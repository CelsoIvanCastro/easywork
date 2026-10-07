import "server-only";
import { db, type Tx } from "../db";
import { can, loadCtx, type Ctx, type ModuleKey } from "../context";
import { addDays, civilDate, todayIn } from "../util";
import { isPermission, type Permission } from "../permissions";
import { missingItems } from "./employees";
import { evaluatePlan, STALE_READING_DAYS } from "./maintenance";

type Condition = {
  type: string;
  dedupeKey: string;
  title: string;
  link: string;
  module: ModuleKey;
  requiredPermission: Permission;
  severity: "warning" | "danger" | "info";
  departmentId?: string | null;
  employeeId?: string | null;
};

const TYPE_MODULE: Record<string, ModuleKey> = {
  "doc.missing": "employees",
  "doc.expiring": "employees",
  "contract.expiring": "employees",
  "stock.low": "inventory",
  "maintenance.due": "maintenance",
  "maintenance.reading": "maintenance",
  "join.pending": "employees",
};

/** Condiciones vigentes de una empresa. Solo para módulos activos: los inactivos quedan en pausa (ni se crean ni se cierran). */
async function collect(db: Tx, companyId: string, active: Set<ModuleKey>): Promise<Condition[]> {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, include: { settings: true } });
  const s = company.settings!;
  const today = civilDate(todayIn(company.timezone));
  const out: Condition[] = [];
  const b = `/e/${companyId}`;

  // Expedientes incompletos (personal activo).
  const emps = await db.employee.findMany({
    where: { companyId, status: { in: ["ACTIVE", "SUSPENDED", "OFFBOARDING"] } },
    select: {
      id: true, firstName: true, lastName: true, birthDate: true, curpEnc: true, rfcEnc: true, nssEnc: true, phone: true, email: true, addressEnc: true, departmentId: true, positionId: true,
      documents: { where: { archivedAt: null }, select: { docType: true, currentVersionNo: true } },
      bankAccounts: { where: { isCurrent: true }, select: { id: true } },
    },
  });
  const all = { personalRead: true, bankRead: true, docsView: true };
  for (const e of emps) {
    if (missingItems(s, e, e.documents, e.bankAccounts.length > 0, all).length)
      out.push({ type: "doc.missing", dedupeKey: `emp:${e.id}:incomplete`, title: `Expediente incompleto: ${e.firstName} ${e.lastName}`, link: `${b}/personal/${e.id}`, module: "employees", requiredPermission: "employees.read", severity: "warning", departmentId: e.departmentId, employeeId: e.id });
  }

  // Documentos por vencer o vencidos.
  const docs = await db.document.findMany({
    where: { companyId, archivedAt: null, expiresOn: { lte: addDays(today, s.docExpiryLeadDays) }, OR: [{ employeeId: null }, { employee: { status: { not: "FORMER" } } }] },
    select: { id: true, title: true, expiresOn: true, employeeId: true, confidential: true, supplierId: true, assetId: true, purchaseId: true, maintenanceId: true, employee: { select: { departmentId: true, firstName: true, lastName: true } } },
  });
  for (const d of docs) {
    const expired = d.expiresOn! < today;
    const perm: Permission = d.employeeId ? "employees.documents.view" : d.supplierId ? "suppliers.read" : d.assetId ? "inventory.read" : d.purchaseId ? "purchases.read" : d.maintenanceId ? "maintenance.read" : d.confidential ? "documents.confidential" : "documents.view";
    const mod: ModuleKey = d.employeeId ? "employees" : d.supplierId ? "suppliers" : d.assetId ? "inventory" : d.purchaseId ? "purchases" : d.maintenanceId ? "maintenance" : "documents";
    out.push({
      type: "doc.expiring",
      dedupeKey: `doc:${d.id}:expiry:${d.expiresOn!.toISOString().slice(0, 10)}`,
      title: `${expired ? "Documento vencido" : "Documento por vencer"}: ${d.title}${d.employee ? ` (${d.employee.firstName} ${d.employee.lastName})` : ""} · ${d.expiresOn!.toISOString().slice(0, 10)}`,
      link: `${b}/documentos/${d.id}`,
      module: mod,
      requiredPermission: perm,
      severity: expired ? "danger" : "warning",
      departmentId: d.employee?.departmentId ?? null,
      employeeId: d.employeeId,
    });
  }

  // Contratos por vencer.
  const contracts = await db.employeeContract.findMany({
    where: { companyId, archivedAt: null, endDate: { gte: addDays(today, -30), lte: addDays(today, s.contractExpiryLeadDays) }, employee: { status: { in: ["ACTIVE", "SUSPENDED", "OFFBOARDING"] } } },
    include: { employee: { select: { id: true, firstName: true, lastName: true, departmentId: true } } },
  });
  for (const c of contracts)
    out.push({ type: "contract.expiring", dedupeKey: `emp:${c.employee.id}:contract:${c.id}`, title: `Contrato por vencer: ${c.employee.firstName} ${c.employee.lastName} · ${c.endDate!.toISOString().slice(0, 10)}`, link: `${b}/personal/${c.employee.id}`, module: "employees", requiredPermission: "employees.read", severity: "warning", departmentId: c.employee.departmentId, employeeId: c.employee.id });

  // Stock bajo.
  if (active.has("inventory")) {
    const low = await db.$queryRaw<{ id: string; name: string; code: string }[]>`SELECT id, name, code FROM item WHERE "companyId" = ${companyId} AND "archivedAt" IS NULL AND "minQuantity" IS NOT NULL AND quantity <= "minQuantity"`;
    for (const i of low) out.push({ type: "stock.low", dedupeKey: `item:${i.id}:low`, title: `Stock bajo: ${i.code} ${i.name}`, link: `${b}/inventario/${i.id}`, module: "inventory", requiredPermission: "inventory.read", severity: "warning" });
  }

  // Mantenimiento próximo/vencido y lecturas faltantes.
  if (active.has("maintenance")) {
    const plans = await db.maintenancePlan.findMany({ where: { companyId, active: true, asset: { status: { notIn: ["SOLD", "DISPOSED"] } } }, include: { asset: true } });
    for (const p of plans) {
      const e = evaluatePlan(p, p.asset, today, s.maintenanceLeadDays);
      if (e.state === "overdue" || e.state === "soon")
        out.push({ type: "maintenance.due", dedupeKey: `asset:${p.assetId}:plan:${p.id}`, title: `${e.state === "overdue" ? "Mantenimiento vencido" : "Mantenimiento próximo"}: ${p.asset.code} ${p.asset.name} · ${p.name}`, link: `${b}/activos/${p.assetId}`, module: "maintenance", requiredPermission: "maintenance.read", severity: e.state === "overdue" ? "danger" : "warning" });
      if (p.intervalReading && (!p.asset.readingAt || p.asset.readingAt < addDays(today, -STALE_READING_DAYS)))
        out.push({ type: "maintenance.reading", dedupeKey: `asset:${p.assetId}:reading`, title: `Actualiza la lectura de uso: ${p.asset.code} ${p.asset.name}`, link: `${b}/activos/${p.assetId}`, module: "maintenance", requiredPermission: "maintenance.read", severity: "info" });
    }
  }

  // Solicitudes de ingreso pendientes.
  const reqs = await db.joinRequest.findMany({ where: { companyId, status: "PENDING" }, include: { user: { select: { name: true, lastName: true } } } });
  for (const r of reqs) out.push({ type: "join.pending", dedupeKey: `join:${r.id}`, title: `Solicitud de ingreso: ${r.user.name} ${r.user.lastName}`, link: `${b}/solicitudes`, module: "employees", requiredPermission: "joinRequests.review", severity: "info" });

  return [...new Map(out.map((c) => [c.dedupeKey, c])).values()];
}

/**
 * Reconciliación idempotente: abre alertas nuevas, actualiza las vigentes y resuelve las que ya no aplican.
 * Regla: una condición resuelta cierra su alerta; si reaparece, se crea una alerta nueva (nueva incidencia).
 * Un candado consultivo de transacción por empresa impide que dos workers procesen la misma empresa a la vez;
 * además, el índice único parcial sobre alertas abiertas impide duplicados aunque algo falle.
 */
export async function scanCompany(companyId: string) {
  const result = await db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${"alerts:" + companyId})) AS ok`;
      if (!lock[0].ok) return null;
      const mods = await tx.companyModule.findMany({ where: { companyId, enabled: true }, select: { module: true } });
      const active = new Set<ModuleKey>(["core", "employees", ...(mods.map((m) => m.module) as ModuleKey[])]);
      const conds = await collect(tx, companyId, active);
      const reconcilable = Object.keys(TYPE_MODULE).filter((t) => active.has(TYPE_MODULE[t]));
      const open = await tx.alert.findMany({ where: { companyId, status: "OPEN", type: { in: reconcilable } } });
      const openByKey = new Map(open.map((a) => [a.dedupeKey, a]));
      const wanted = new Set(conds.map((c) => c.dedupeKey));
      const now = new Date();
      const toResolve = open.filter((a) => !wanted.has(a.dedupeKey) && active.has(a.module as ModuleKey));
      if (toResolve.length) await tx.alert.updateMany({ where: { id: { in: toResolve.map((a) => a.id) } }, data: { status: "RESOLVED", resolvedAt: now } });
      const created: string[] = [];
      for (const c of conds) {
        const existing = openByKey.get(c.dedupeKey);
        if (existing) {
          await tx.alert.update({ where: { id: existing.id }, data: { lastSeenAt: now, title: c.title, severity: c.severity, departmentId: c.departmentId ?? null } });
          continue;
        }
        const a = await tx.alert.create({
          data: { companyId, type: c.type, dedupeKey: c.dedupeKey, title: c.title, link: c.link, module: c.module, requiredPermission: c.requiredPermission, severity: c.severity, departmentId: c.departmentId ?? null, employeeId: c.employeeId ?? null },
        });
        created.push(a.id);
      }
      return { open: conds.length, created, resolved: toResolve.length };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  if (!result) return { skipped: true as const };
  if (result.created.length) await notify(companyId, result.created);
  return { open: result.open, created: result.created.length, resolved: result.resolved };
}

/** Notifica a quienes pueden ver la alerta en este momento. La visibilidad se revalida además al consultar. */
async function notify(companyId: string, alertIds: string[]) {
  const [alerts, members] = await Promise.all([
    db.alert.findMany({ where: { id: { in: alertIds } } }),
    db.membership.findMany({ where: { companyId, status: "ACTIVE" }, select: { userId: true, mutedAlertTypes: true } }),
  ]);
  const ctxs: { ctx: Ctx; muted: Set<string> }[] = [];
  for (const m of members) {
    try {
      ctxs.push({ ctx: await loadCtx(m.userId, companyId), muted: new Set(m.mutedAlertTypes) });
    } catch {
      /* sin acceso vigente */
    }
  }
  const rows = [];
  for (const a of alerts) {
    if (!isPermission(a.requiredPermission)) continue;
    for (const { ctx, muted } of ctxs) {
      if (muted.has(a.type)) continue;
      if (can(ctx, a.requiredPermission, { departmentId: a.departmentId, employeeId: a.employeeId })) rows.push({ companyId, userId: ctx.userId, alertId: a.id, kind: a.type, title: a.title, link: a.link });
    }
  }
  if (rows.length) await db.notification.createMany({ data: rows, skipDuplicates: true });
}

/** Alertas abiertas visibles para quien consulta (dashboard). */
export async function visibleAlerts(ctx: Ctx) {
  // ponytail: filtra en servidor hasta 2000 alertas abiertas; si una empresa supera eso, precalcular por permiso.
  const open = await db.alert.findMany({ where: { companyId: ctx.companyId, status: "OPEN" }, orderBy: { firstSeenAt: "desc" }, take: 2000 });
  return open.filter((a) => isPermission(a.requiredPermission) && can(ctx, a.requiredPermission, { departmentId: a.departmentId, employeeId: a.employeeId }));
}
