import "server-only";
import { z } from "zod";
import { db } from "../db";
import { type Ctx, can } from "../context";
import { notFound } from "../errors";
import { isPermission } from "../permissions";

const RECENT = 200;

/**
 * Notificaciones del usuario en la empresa activa. La visibilidad se revalida en cada consulta con los
 * permisos actuales: si se revocó el acceso al expediente/módulo de origen, la notificación no se muestra.
 */
async function visible(ctx: Ctx) {
  // ponytail: filtra en servidor las 200 más recientes; si un usuario acumula más, paginar por cursor con el mismo filtro.
  const rows = await db.notification.findMany({
    where: { companyId: ctx.companyId, userId: ctx.userId, dismissedAt: null, OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }] },
    include: { alert: true },
    orderBy: { createdAt: "desc" },
    take: RECENT,
  });
  const muted = new Set((await db.membership.findUnique({ where: { id: ctx.membershipId }, select: { mutedAlertTypes: true } }))?.mutedAlertTypes ?? []);
  return rows.filter((n) => {
    if (!n.alert) return true;
    if (muted.has(n.alert.type)) return false;
    const p = n.alert.requiredPermission;
    return isPermission(p) && can(ctx, p, { departmentId: n.alert.departmentId, employeeId: n.alert.employeeId });
  });
}

export async function unreadCount(ctx: Ctx) {
  return (await visible(ctx)).filter((n) => !n.readAt && n.alert?.status !== "RESOLVED").length;
}

export async function listNotifications(ctx: Ctx) {
  return (await visible(ctx)).map((n) => ({
    id: n.id,
    title: n.title,
    link: n.link,
    kind: n.kind,
    createdAt: n.createdAt,
    readAt: n.readAt,
    resolved: n.alert?.status === "RESOLVED",
    alertType: n.alert?.type ?? null,
  }));
}

export async function updateNotification(ctx: Ctx, id: string, op: "read" | "unread" | "dismiss" | "snooze") {
  const data =
    op === "read" ? { readAt: new Date() } : op === "unread" ? { readAt: null } : op === "dismiss" ? { dismissedAt: new Date() } : { snoozedUntil: new Date(Date.now() + 7 * 86400000), readAt: new Date() };
  const n = await db.notification.updateMany({ where: { id, userId: ctx.userId, companyId: ctx.companyId }, data });
  if (!n.count) throw notFound("La notificación");
}

export async function markAllRead(ctx: Ctx) {
  await db.notification.updateMany({ where: { userId: ctx.userId, companyId: ctx.companyId, readAt: null }, data: { readAt: new Date() } });
}

export const ALERT_TYPES = {
  "doc.missing": "Expedientes incompletos",
  "doc.expiring": "Documentos por vencer",
  "contract.expiring": "Contratos por vencer",
  "stock.low": "Stock bajo",
  "maintenance.due": "Mantenimiento próximo o vencido",
  "maintenance.reading": "Lecturas de uso faltantes",
  "join.pending": "Solicitudes de ingreso pendientes",
} as const;

export async function setMutedTypes(ctx: Ctx, types: string[]) {
  const valid = z.array(z.enum(Object.keys(ALERT_TYPES) as [string, ...string[]])).parse(types);
  await db.membership.update({ where: { id: ctx.membershipId }, data: { mutedAlertTypes: valid } });
}
