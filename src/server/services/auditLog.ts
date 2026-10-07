import "server-only";
import { db, type Prisma } from "../db";
import { type Ctx, can, need } from "../context";
import { forbidden } from "../errors";
import { civilDate, pageArgs, PAGE_SIZE } from "../util";
import type { Permission } from "../permissions";

const MODULE_READ: Record<string, Permission> = {
  employees: "employees.read",
  structure: "employees.read",
  documents: "documents.view",
  inventory: "inventory.read",
  suppliers: "suppliers.read",
  purchases: "purchases.read",
  maintenance: "maintenance.read",
  announcements: "audit.read",
  core: "audit.read",
  ai: "audit.read",
};
const COST_KEY = /cost|amount|price|total|sale/i;

/**
 * Auditoría consultable (solo lectura; la app no ofrece editar ni borrar historial).
 * Alcance: audit.read de empresa ve todo; por departamentos, solo eventos de esos departamentos.
 * Contenido: se ocultan detalles de módulos que la persona no puede consultar y los importes sin costs.read.
 */
export async function listAudit(ctx: Ctx, f: { actor?: string; module?: string; action?: string; entityType?: string; entityId?: string; from?: string; to?: string; page?: number }) {
  need(ctx, "audit.read");
  const e = ctx.perms.get("audit.read");
  if (!e) throw forbidden();
  const scope: Prisma.AuditLogWhereInput = e.company
    ? e.excluded.size
      ? { OR: [{ departmentId: null }, { departmentId: { notIn: [...e.excluded] } }] }
      : {}
    : { departmentId: { in: [...e.departments] } };
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      { companyId: ctx.companyId },
      scope,
      f.actor ? { actorLabel: { contains: f.actor, mode: "insensitive" } } : {},
      f.module ? { module: f.module } : {},
      f.action ? { action: { contains: f.action } } : {},
      f.entityType ? { entityType: f.entityType } : {},
      f.entityId ? { entityId: f.entityId } : {},
      f.from ? { createdAt: { gte: civilDate(f.from) } } : {},
      f.to ? { createdAt: { lt: new Date(civilDate(f.to).getTime() + 86400000) } } : {},
    ],
  };
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([db.auditLog.findMany({ where, ...pageArgs(page), orderBy: { createdAt: "desc" } }), db.auditLog.count({ where })]);
  const costs = can(ctx, "costs.read");
  return {
    rows: rows.map((r) => {
      const p = MODULE_READ[r.module] ?? "audit.read";
      const readable = can(ctx, p, r.departmentId ? { departmentId: r.departmentId } : undefined) || p === "audit.read";
      let changes = readable ? (r.changes as Record<string, unknown> | null) : null;
      let summary = readable ? r.summary : null;
      if (!costs && changes) changes = Object.fromEntries(Object.entries(changes).filter(([k]) => !COST_KEY.test(k)));
      if (!costs && summary && ["purchases", "maintenance", "inventory"].includes(r.module) && /\d[\d.,]*\s*(MXN|USD|EUR)/.test(summary)) summary = "[importe oculto]";
      return { ...r, changes, summary, redacted: !readable };
    }),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}
