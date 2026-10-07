import "server-only";
import { db } from "../db";
import { type Ctx, can, employeeScope } from "../context";
import { addDays, civilDate, todayIn } from "../util";
import { visibleAlerts } from "./alerts";

export type Kpi = { label: string; value: number; href: string; tone?: "warn" | "bad" | "ok" };

/** Indicadores reales, calculados después de aplicar módulos, permisos y alcance por departamento. */
export async function dashboard(ctx: Ctx) {
  const b = `/e/${ctx.companyId}`;
  const kpis: Kpi[] = [];
  const today = civilDate(todayIn(ctx.company.timezone));
  const alerts = await visibleAlerts(ctx);
  const byType = (t: string) => alerts.filter((a) => a.type === t);

  const scope = employeeScope(ctx, "employees.read");
  if (scope) {
    const [active, exits] = await Promise.all([
      db.employee.count({ where: { AND: [scope, { status: "ACTIVE" }] } }),
      db.employmentPeriod.count({ where: { companyId: ctx.companyId, endDate: { gte: addDays(today, -30) }, employee: scope } }),
    ]);
    kpis.push({ label: "Personas activas", value: active, href: `${b}/personal` });
    kpis.push({ label: "Bajas últimos 30 días", value: exits, href: `${b}/personal?view=former&from=${addDays(today, -30).toISOString().slice(0, 10)}` });
    kpis.push({ label: "Expedientes incompletos", value: byType("doc.missing").length, href: `${b}/notificaciones?tipo=doc.missing`, tone: byType("doc.missing").length ? "warn" : "ok" });
  }
  if (can(ctx, "joinRequests.review")) {
    const n = await db.joinRequest.count({ where: { companyId: ctx.companyId, status: "PENDING" } });
    kpis.push({ label: "Solicitudes de ingreso", value: n, href: `${b}/solicitudes`, tone: n ? "warn" : undefined });
  }
  const expiring = [...byType("doc.expiring"), ...byType("contract.expiring")];
  if (expiring.length || scope) kpis.push({ label: "Vencimientos (documentos y contratos)", value: expiring.length, href: `${b}/notificaciones?tipo=vencimientos`, tone: expiring.length ? "warn" : "ok" });
  if (ctx.modules.has("inventory") && can(ctx, "inventory.read")) kpis.push({ label: "Artículos con stock bajo", value: byType("stock.low").length, href: `${b}/inventario?low=1`, tone: byType("stock.low").length ? "warn" : "ok" });
  if (ctx.modules.has("maintenance") && can(ctx, "maintenance.read")) {
    const due = byType("maintenance.due");
    kpis.push({ label: "Mantenimientos vencidos", value: due.filter((a) => a.severity === "danger").length, href: `${b}/mantenimiento?state=overdue`, tone: due.some((a) => a.severity === "danger") ? "bad" : "ok" });
    kpis.push({ label: "Mantenimientos próximos", value: due.filter((a) => a.severity !== "danger").length, href: `${b}/mantenimiento?state=soon` });
    kpis.push({ label: "Activos sin lectura reciente", value: byType("maintenance.reading").length, href: `${b}/mantenimiento?state=unknown` });
  }
  const purchases =
    ctx.modules.has("purchases") && can(ctx, "purchases.read")
      ? await db.purchase.findMany({ where: { companyId: ctx.companyId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, code: true, supplierName: true, status: true, orderedOn: true } })
      : null;
  if (ctx.modules.has("suppliers") && can(ctx, "suppliers.read")) kpis.push({ label: "Proveedores activos", value: await db.supplier.count({ where: { companyId: ctx.companyId, archivedAt: null } }), href: `${b}/proveedores` });
  return { kpis, alerts: alerts.slice(0, 10), purchases };
}
