import "server-only";
import { db, type Tx, Prisma } from "./db";
import type { Ctx } from "./context";

export type AuditEntry = {
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  departmentId?: string | null;
  summary?: string;
  changes?: Record<string, unknown>;
  sensitive?: boolean;
  result?: "SUCCESS" | "DENIED" | "FAILED";
};

/** Se escribe con el mismo tx que la operación: si la auditoría falla, la operación también. */
export async function audit(tx: Tx, ctx: Pick<Ctx, "companyId" | "userId" | "userLabel"> | null, e: AuditEntry) {
  await tx.auditLog.create({
    data: {
      companyId: ctx?.companyId ?? null,
      actorUserId: ctx?.userId ?? null,
      actorLabel: ctx?.userLabel ?? "Sistema",
      action: e.action,
      module: e.module,
      entityType: e.entityType,
      entityId: e.entityId,
      departmentId: e.departmentId ?? null,
      summary: e.summary,
      changes: (e.changes as Prisma.InputJsonValue) ?? undefined,
      sensitive: e.sensitive ?? false,
      result: e.result ?? "SUCCESS",
    },
  });
}

/** Para eventos sin operación asociada (accesos a datos sensibles, denegaciones). */
export const auditNow = (ctx: Parameters<typeof audit>[1], e: AuditEntry) => audit(db, ctx, e);

const SECRET = "[protegido]";
/** Diferencias útiles; los campos protegidos solo indican que cambiaron. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown>, protectedFields: string[] = []) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(after)) {
    const a = before?.[k] ?? null;
    const b = after[k] ?? null;
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v instanceof Prisma.Decimal ? v.toString() : v);
    if (JSON.stringify(norm(a)) === JSON.stringify(norm(b))) continue;
    out[k] = protectedFields.includes(k) ? [a ? SECRET : null, b ? SECRET : null] : [norm(a), norm(b)];
  }
  return out;
}
