import "server-only";
import { z } from "zod";
import { db } from "../db";
import { can, type Ctx, MODULE_LABELS, TOGGLEABLE_MODULES } from "../context";
import { PERMISSIONS, type Permission } from "../permissions";
import * as companies from "../services/companies";
import * as employees from "../services/employees";
import * as docs from "../services/documents";
import * as notifications from "../services/notifications";
import * as announcements from "../services/announcements";
import * as inv from "../services/inventory";
import * as suppliers from "../services/suppliers";
import * as purchases from "../services/purchases";
import * as maint from "../services/maintenance";
import * as structure from "../services/structure";
import * as accounts from "../services/accounts";
import { listAudit } from "../services/auditLog";
import { universalSearch } from "../services/search";
import { dashboard } from "../services/dashboard";
import { ask } from "../ai/assistant";

/**
 * API v1 (RPC tipada). Cada operación recibe identidad y contexto del servidor —nunca del cliente— y llama al mismo
 * servicio que la web, con sus permisos, validaciones y auditoría. El contrato público está en src/lib/api-contract.ts.
 */
export type UserCtx = { userId: string; headers: Headers; session: { id: string; reauthAt: Date | null; twoFactorEnabled: boolean }; ip: string };
type CompanyOp = { scope: "company"; input: z.ZodType; run: (ctx: Ctx, input: never, u: UserCtx) => Promise<unknown> };
type UserOp = { scope: "user"; input: z.ZodType; run: (u: UserCtx, input: never) => Promise<unknown> };
export type Op = CompanyOp | UserOp;

const id = z.string().min(1).max(80);
const page = z.number().int().min(1).max(10000).optional();
const rec = z.record(z.string(), z.unknown());
const none = z.object({}).optional();
const c = <T extends z.ZodType>(input: T, run: (ctx: Ctx, i: z.infer<T>, u: UserCtx) => Promise<unknown>): Op => ({ scope: "company", input, run: run as CompanyOp["run"] });
const u = <T extends z.ZodType>(input: T, run: (u: UserCtx, i: z.infer<T>) => Promise<unknown>): Op => ({ scope: "user", input, run: run as UserOp["run"] });

const KEY_PERMS: Permission[] = Object.keys(PERMISSIONS) as Permission[];

export const OPS: Record<string, Op> = {
  // ───── Cuenta ─────
  "me": u(none, async (x) => {
    const user = await db.user.findUniqueOrThrow({ where: { id: x.userId }, select: { id: true, name: true, lastName: true, email: true, phone: true, twoFactorEnabled: true, image: true } });
    return { ...user, image: user.image ? `/api/foto/${user.id}` : null };
  }),
  "companies.mine": u(none, async (x) => ({ ...(await companies.listMyCompanies(x.userId)), transfers: await accounts.pendingTransfersFor(x.userId) })),
  "companies.create": u(rec, async (x, i) => {
    const user = await db.user.findUniqueOrThrow({ where: { id: x.userId } });
    return { id: (await companies.createCompany(user, i)).id };
  }),
  "join.lookup": u(z.object({ code: z.string() }), (x, i) => companies.lookupJoinCode(x.userId, x.ip, i.code)),
  "join.request": u(z.object({ code: z.string(), message: z.string().max(500).default("") }), (x, i) => companies.requestJoin(x.userId, x.ip, i.code, i.message).then(() => ({ ok: true }))),
  "join.cancel": u(z.object({ id }), (x, i) => companies.cancelMyRequest(x.userId, i.id)),
  "sessions.list": u(none, (x) =>
    db.session.findMany({ where: { userId: x.userId, expiresAt: { gt: new Date() } }, select: { id: true, userAgent: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: "desc" } }).then((r) => r.map((s) => ({ ...s, current: s.id === x.session.id }))),
  ),
  "sessions.revoke": u(z.object({ id }), (x, i) => db.session.deleteMany({ where: { id: i.id, userId: x.userId } }).then(() => ({ ok: true }))),
  "sessions.revokeOthers": u(none, (x) => db.session.deleteMany({ where: { userId: x.userId, id: { not: x.session.id } } }).then(() => ({ ok: true }))),
  "account.reauth": u(z.object({ password: z.string().max(128), code: z.string().max(12).optional() }), async (x, i) => {
    const { reauthenticate } = await import("../reauth");
    await reauthenticate(x.headers, i.password, i.code);
    return { ok: true };
  }),
  "account.deletionPreview": u(none, (x) => accounts.deletionPreview(x.userId)),
  "account.delete": u(z.object({ confirm: z.string().max(200) }), (x, i) => accounts.deleteAccount(x.userId, x.session, i.confirm)),
  "ownership.accept": u(z.object({ id }), (x, i) => accounts.acceptTransfer(x.userId, x.session, i.id).then(() => ({ ok: true }))),

  // ───── Empresa: contexto, inicio, alertas, búsqueda ─────
  "company.context": c(none, async (ctx) => ({
    id: ctx.companyId,
    tradeName: ctx.company.tradeName,
    timezone: ctx.company.timezone,
    isOwner: ctx.isOwner,
    fullAccess: ctx.fullAccess,
    employeeId: ctx.employee?.id ?? null,
    modules: Object.fromEntries(TOGGLEABLE_MODULES.map((m) => [m, ctx.modules.has(m)])),
    moduleLabels: MODULE_LABELS,
    can: Object.fromEntries(KEY_PERMS.map((p) => [p, can(ctx, p)])),
    unread: await notifications.unreadCount(ctx),
  })),
  "dashboard": c(none, (ctx) => dashboard(ctx)),
  "company.get": c(none, (ctx) => companies.getCompany(ctx)),
  "notifications.list": c(none, (ctx) => notifications.listNotifications(ctx)),
  "notifications.update": c(z.object({ id, op: z.enum(["read", "unread", "dismiss", "snooze"]) }), (ctx, i) => notifications.updateNotification(ctx, i.id, i.op)),
  "notifications.readAll": c(none, (ctx) => notifications.markAllRead(ctx)),
  "search": c(z.object({ q: z.string().max(100) }), (ctx, i) => universalSearch(ctx, i.q)),

  // ───── Personal y estructura ─────
  "employees.list": c(z.object({ view: z.enum(["active", "former"]).default("active"), q: z.string().max(100).optional(), departmentId: z.string().optional(), page }), (ctx, i) => employees.listEmployees(ctx, i)),
  "employees.get": c(z.object({ id, reveal: z.boolean().optional() }), (ctx, i) => employees.getEmployee(ctx, i.id, { revealPersonal: i.reveal })),
  "employees.create": c(rec, (ctx, i) => employees.createEmployee(ctx, i).then((e) => ({ id: e!.id }))),
  "employees.updateBasic": c(z.object({ id, version: z.number().int(), data: rec }), (ctx, i) => employees.updateBasic(ctx, i.id, i.data, i.version)),
  "employees.updatePersonal": c(z.object({ id, version: z.number().int(), data: rec }), (ctx, i) => employees.updatePersonal(ctx, i.id, i.data, i.version)),
  "employees.assign": c(z.object({ id, data: rec }), (ctx, i) => employees.changeAssignment(ctx, i.id, i.data)),
  "employees.terminate": c(z.object({ id, data: rec }), (ctx, i) => employees.terminate(ctx, i.id, i.data)),
  "employees.rehire": c(z.object({ id, data: rec }), (ctx, i) => employees.rehire(ctx, i.id, i.data)),
  "employees.setStatus": c(z.object({ id, status: z.enum(["ACTIVE", "SUSPENDED", "OFFBOARDING"]) }), (ctx, i) => employees.setStatus(ctx, i.id, i.status)),
  "employees.addNote": c(z.object({ id, data: rec }), (ctx, i) => employees.addNote(ctx, i.id, i.data)),
  "employees.setBank": c(z.object({ id, data: rec }), (ctx, i) => employees.setBankAccount(ctx, i.id, i.data)),
  "employees.revealClabe": c(z.object({ bankId: id }), (ctx, i) => employees.revealClabe(ctx, i.bankId).then((clabe) => ({ clabe }))),
  "structure.departments": c(none, (ctx) => structure.listDepartments(ctx)),
  "structure.positions": c(none, (ctx) => structure.listPositions(ctx)),
  "structure.orgChart": c(none, async (ctx) => {
    const o = await structure.orgChart(ctx);
    return { roots: o.roots, unassigned: o.unassigned, openable: [...o.openable] };
  }),
  "joinRequests.list": c(z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING") }), (ctx, i) => companies.listJoinRequests(ctx, i.status)),
  "joinRequests.approve": c(z.object({ id, data: rec }), (ctx, i) => companies.approveJoinRequest(ctx, i.id, i.data)),
  "joinRequests.reject": c(z.object({ id, note: z.string().max(300).default("") }), (ctx, i) => companies.rejectJoinRequest(ctx, i.id, i.note)),

  // ───── Documentos (la carga va por /api/v1/upload) ─────
  "documents.list": c(z.object({ q: z.string().max(100).optional(), folderId: z.string().nullable().optional(), page }), (ctx, i) => docs.listDocuments(ctx, i)),
  "documents.get": c(z.object({ id }), (ctx, i) => docs.getDocument(ctx, i.id)),
  "documents.restore": c(z.object({ id, number: z.number().int().min(1) }), (ctx, i) => docs.restoreVersion(ctx, i.id, i.number).then((n) => ({ number: n }))),
  "documents.archive": c(z.object({ id, archived: z.boolean() }), (ctx, i) => docs.setArchived(ctx, i.id, i.archived)),
  "documents.folders": c(none, (ctx) => docs.listFolders(ctx)),

  // ───── Avisos ─────
  "announcements.list": c(z.object({ page }), (ctx, i) => announcements.listAnnouncements(ctx, i)),
  "announcements.publish": c(rec, (ctx, i) => announcements.publish(ctx, i).then((a) => ({ id: a.id }))),

  // ───── Inventario, activos, compras, mantenimiento ─────
  "inventory.items": c(z.object({ q: z.string().max(100).optional(), low: z.boolean().optional(), page }), (ctx, i) => inv.listItems(ctx, i)),
  "inventory.item": c(z.object({ id, page }), (ctx, i) => inv.getItem(ctx, i.id, i.page)),
  "inventory.move": c(z.object({ id, data: rec }), (ctx, i) => inv.recordMovement(ctx, i.id, i.data)),
  "assets.list": c(z.object({ q: z.string().max(100).optional(), status: z.string().optional(), page }), (ctx, i) => inv.listAssets(ctx, i)),
  "assets.get": c(z.object({ id }), (ctx, i) => inv.getAsset(ctx, i.id)),
  "assets.status": c(z.object({ id, data: rec }), (ctx, i) => inv.changeAssetStatus(ctx, i.id, i.data)),
  "suppliers.list": c(z.object({ q: z.string().max(100).optional(), page }), (ctx, i) => suppliers.listSuppliers(ctx, i)),
  "suppliers.get": c(z.object({ id }), (ctx, i) => suppliers.getSupplier(ctx, i.id)),
  "purchases.list": c(z.object({ q: z.string().max(100).optional(), status: z.string().optional(), page }), (ctx, i) => purchases.listPurchases(ctx, i)),
  "purchases.get": c(z.object({ id }), (ctx, i) => purchases.getPurchase(ctx, i.id)),
  "purchases.receive": c(z.object({ id, data: rec }), (ctx, i) => purchases.receivePurchase(ctx, i.id, i.data)),
  "maintenance.board": c(none, (ctx) => maint.planBoard(ctx)),
  "maintenance.records": c(z.object({ status: z.string().optional(), page }), (ctx, i) => maint.listRecords(ctx, i)),
  "maintenance.get": c(z.object({ id }), (ctx, i) => maint.getRecord(ctx, i.id)),
  "maintenance.reading": c(z.object({ assetId: id, data: rec }), (ctx, i) => maint.recordReading(ctx, i.assetId, i.data).then((v) => ({ reading: v.toString() }))),
  "maintenance.complete": c(z.object({ id, data: rec }), (ctx, i) => maint.completeRecord(ctx, i.id, i.data)),

  // ───── Administración ─────
  "audit.list": c(z.object({ module: z.string().optional(), entityType: z.string().optional(), entityId: z.string().optional(), page }), (ctx, i) => listAudit(ctx, i)),
  "members.list": c(none, (ctx) => companies.listMembers(ctx)),
  "members.fullAccess": c(z.object({ membershipId: id, enabled: z.boolean() }), (ctx, i) => companies.setFullAccess(ctx, i.membershipId, i.enabled)),
  "grants.list": c(none, (ctx) => companies.listGrants(ctx, {})),
  "grants.add": c(rec, (ctx, i) => companies.addGrant(ctx, i)),
  "grants.remove": c(z.object({ id }), (ctx, i) => companies.removeGrant(ctx, i.id)),
  "modules.set": c(z.object({ module: z.string(), enabled: z.boolean() }), (ctx, i) => companies.setModule(ctx, i.module, i.enabled)),

  // ───── IA ─────
  "ai.ask": c(z.object({ question: z.string(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).max(20).default([]) }), (ctx, i) => ask(ctx, i)),
};
