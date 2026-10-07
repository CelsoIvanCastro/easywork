import "server-only";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { db, type Prisma } from "../db";
import { audit } from "../audit";
import { AppError, conflict, forbidden, invalid, notFound } from "../errors";
import { type Ctx, requireOwner, requireRecentReauth, type SessionInfo } from "../context";
import { accountFingerprint, securityEvent } from "../security";
import { scheduleFileDeletion } from "./documents";
import { sendMail } from "../mail";

const REAUTH_MS = 10 * 60 * 1000;
const TRANSFER_DAYS = 7;

// Libro de eliminaciones fuera de la base: tras restaurar una copia antigua se reaplica (scripts/reapply-erasures.ts).
// En producción, ERASURE_LEDGER debe apuntar a un almacenamiento separado de las copias de la base.
export function appendErasureLedger(entry: { kind: "ACCOUNT" | "EMPLOYEE"; subject: string; companyId?: string | null }) {
  const file = process.env.ERASURE_LEDGER ?? ".local/erasure-ledger.jsonl";
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
}

function requireFreshSession(s: SessionInfo | undefined) {
  if (!s?.reauthAt || Date.now() - s.reauthAt.getTime() > REAUTH_MS) throw new AppError("REAUTH", "Confirma tu contraseña para continuar (válido 10 minutos).");
}

/** Qué se elimina y qué se conserva, para mostrarlo antes de confirmar. */
export async function deletionPreview(userId: string) {
  const [owned, memberships, records] = await Promise.all([
    db.company.findMany({ where: { ownerId: userId, closedAt: null }, select: { id: true, tradeName: true } }),
    db.membership.findMany({ where: { userId }, include: { company: { select: { tradeName: true, closedAt: true } } } }),
    db.employee.count({ where: { userId } }),
  ]);
  return { blockingCompanies: owned, memberships: memberships.map((m) => m.company.tradeName), employmentRecords: records };
}

/**
 * Elimina la identidad personal: cuenta, sesiones, credenciales, 2FA, foto, solicitudes y accesos a empresas.
 * NO borra expedientes laborales que cada empresa conserva bajo su responsabilidad: se desvinculan de la cuenta.
 * La auditoría conserva las acciones con el autor seudonimizado ("Cuenta eliminada").
 */
export async function deleteAccount(userId: string, session: SessionInfo | undefined, confirmEmail: string) {
  requireFreshSession(session);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("La cuenta");
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) throw invalid("Escribe tu correo para confirmar.", { confirm: "No coincide" });
  const blocking = await db.company.findMany({ where: { ownerId: userId, closedAt: null }, select: { tradeName: true } });
  if (blocking.length)
    throw invalid(`Eres propietario de ${blocking.map((c) => c.tradeName).join(", ")}. Transfiere la propiedad o cierra la empresa antes de eliminar tu cuenta.`);
  const fp = accountFingerprint(user.email);
  const photo = user.image?.startsWith("key:") ? user.image.slice(4) : null;
  const summary = await db.$transaction(async (tx) => {
    const closedOwned = await tx.company.updateMany({ where: { ownerId: userId, closedAt: { not: null } }, data: { ownerId: null } });
    const unlinked = await tx.employee.updateMany({ where: { userId }, data: { userId: null } });
    await tx.ownershipTransfer.updateMany({ where: { status: "PENDING", OR: [{ fromUserId: userId }, { toUserId: userId }] }, data: { status: "CANCELLED", decidedAt: new Date() } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.aiUsage.updateMany({ where: { userId }, data: { userId: "deleted" } });
    await tx.$queryRaw`SELECT audit_redact_actor(${userId})`;
    const s = { memberships: await tx.membership.count({ where: { userId } }), employmentRecordsKept: unlinked.count, closedCompaniesReleased: closedOwned.count };
    await tx.user.delete({ where: { id: userId } }); // sesiones, credenciales, 2FA, membresías y solicitudes en cascada
    await tx.erasureLog.create({ data: { kind: "ACCOUNT", subject: fp, summary: s as Prisma.InputJsonValue } });
    return s;
  });
  appendErasureLedger({ kind: "ACCOUNT", subject: fp });
  if (photo) await scheduleFileDeletion([photo]);
  await securityEvent({ action: "account.delete", result: "SUCCESS" });
  await sendMail({
    to: user.email,
    subject: "Tu cuenta de EasyWork fue eliminada",
    text: "Eliminamos tu cuenta, tus sesiones y tus accesos. Los expedientes laborales que conservan las empresas en las que trabajaste siguen bajo su responsabilidad; puedes ejercer tus derechos directamente con ellas.",
  }).catch(() => {});
  return summary;
}

// ───────── Propiedad ─────────

export async function startTransfer(ctx: Ctx, membershipId: string) {
  requireOwner(ctx);
  requireRecentReauth(ctx);
  return db.$transaction(async (tx) => {
    const m = await tx.membership.findFirst({ where: { id: membershipId, companyId: ctx.companyId, status: "ACTIVE" }, include: { user: true } });
    if (!m || m.userId === ctx.userId) throw invalid("Elige a un miembro activo distinto de ti.");
    await tx.ownershipTransfer.updateMany({ where: { companyId: ctx.companyId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
    const t = await tx.ownershipTransfer.create({ data: { companyId: ctx.companyId, fromUserId: ctx.userId, toUserId: m.userId, expiresAt: new Date(Date.now() + TRANSFER_DAYS * 86400000) } });
    await tx.notification.create({ data: { companyId: ctx.companyId, userId: m.userId, kind: "ownership.transfer", title: `Te ofrecen la propiedad de ${ctx.company.tradeName}`, link: "/empresas" } });
    await audit(tx, ctx, { action: "ownership.transfer.start", module: "core", entityType: "company", entityId: ctx.companyId, summary: `Propuesta a ${m.user.name} ${m.user.lastName}` });
    return t;
  });
}

export async function cancelTransfer(ctx: Ctx) {
  requireOwner(ctx);
  await db.$transaction(async (tx) => {
    const n = await tx.ownershipTransfer.updateMany({ where: { companyId: ctx.companyId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
    if (n.count) await audit(tx, ctx, { action: "ownership.transfer.cancel", module: "core", entityType: "company", entityId: ctx.companyId });
  });
}

export async function pendingTransfersFor(userId: string) {
  return db.ownershipTransfer.findMany({ where: { toUserId: userId, status: "PENDING", expiresAt: { gt: new Date() } } }).then(async (ts) =>
    Promise.all(ts.map(async (t) => ({ ...t, company: (await db.company.findUnique({ where: { id: t.companyId }, select: { tradeName: true } }))?.tradeName ?? "" }))),
  );
}

/** La acepta el sucesor con reautenticación. El anterior propietario queda como miembro sin privilegios especiales. */
export async function acceptTransfer(userId: string, session: SessionInfo | undefined, transferId: string) {
  requireFreshSession(session);
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ companyId: string }[]>`SELECT "companyId" FROM ownership_transfer WHERE id = ${transferId} AND "toUserId" = ${userId} FOR UPDATE`;
    if (!rows.length) throw notFound("La transferencia");
    const t = await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: transferId } });
    if (t.status !== "PENDING") throw conflict("La transferencia ya no está vigente.");
    if (t.expiresAt < new Date()) {
      await tx.ownershipTransfer.update({ where: { id: t.id }, data: { status: "EXPIRED" } });
      throw conflict("La transferencia caducó.");
    }
    await tx.$queryRaw`SELECT id FROM company WHERE id = ${t.companyId} FOR UPDATE`;
    const c = await tx.company.findUniqueOrThrow({ where: { id: t.companyId } });
    if (c.ownerId !== t.fromUserId || c.closedAt) throw conflict("La empresa cambió de propietario o fue cerrada.");
    const m = await tx.membership.findUnique({ where: { companyId_userId: { companyId: c.id, userId } } });
    if (!m || m.status !== "ACTIVE") throw forbidden("Ya no eres miembro activo de esta empresa.");
    await tx.company.update({ where: { id: c.id }, data: { ownerId: userId, version: { increment: 1 } } });
    await tx.membership.update({ where: { id: m.id }, data: { fullAccess: false } });
    await tx.ownershipTransfer.update({ where: { id: t.id }, data: { status: "ACCEPTED", decidedAt: new Date() } });
    const actor = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await audit(tx, { companyId: c.id, userId, userLabel: `${actor.name} ${actor.lastName}` }, { action: "ownership.transfer.accept", module: "core", entityType: "company", entityId: c.id, changes: { ownerId: [t.fromUserId, userId] } });
  });
}

/**
 * Cierre controlado: nadie vuelve a operar la empresa; sus datos se conservan según la política de retención.
 * Permite al fundador salir (y eliminar después su cuenta) sin entregar la empresa a terceros.
 */
export async function closeCompany(ctx: Ctx, raw: { confirm: string; reason: string }) {
  requireOwner(ctx);
  requireRecentReauth(ctx);
  const r = z.object({ confirm: z.string(), reason: z.string().trim().min(3, "Indica el motivo").max(500) }).parse(raw);
  if (r.confirm.trim() !== ctx.company.tradeName) throw invalid("Escribe el nombre comercial exacto para confirmar.", { confirm: "No coincide" });
  await db.$transaction(async (tx) => {
    await tx.company.update({ where: { id: ctx.companyId }, data: { closedAt: new Date(), closedReason: r.reason } });
    await tx.ownershipTransfer.updateMany({ where: { companyId: ctx.companyId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
    await audit(tx, ctx, { action: "company.close", module: "core", entityType: "company", entityId: ctx.companyId, summary: r.reason });
  });
}
