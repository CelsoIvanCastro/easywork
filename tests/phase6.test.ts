import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, Decimal } from "@/server/db";
import * as companies from "@/server/services/companies";
import * as structure from "@/server/services/structure";
import * as employees from "@/server/services/employees";
import * as inv from "@/server/services/inventory";
import * as m from "@/server/services/maintenance";
import * as alerts from "@/server/services/alerts";
import * as notes from "@/server/services/notifications";
import * as ann from "@/server/services/announcements";
import { universalSearch } from "@/server/services/search";
import { dashboard } from "@/server/services/dashboard";
import { claim, enqueue, recoverStale, runJob } from "@/server/jobs";
import { addMember, ctxOf, expectError, makeCompany } from "./helpers";

const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function setup(name: string) {
  const base = await makeCompany(name);
  for (const mod of ["inventory", "maintenance"]) await companies.setModule(base.ctx, mod, true);
  const ctx = await ctxOf(base.owner.id, base.company.id);
  const cat = await inv.activateSuggested(ctx, "vehiculos");
  return { ...base, ctx, cat };
}

describe("mantenimiento", () => {
  it("evaluación pura: fecha, lectura, umbral combinado y lectura ausente", () => {
    const today = new Date("2026-10-06T00:00:00Z");
    const plan = { intervalDays: 90, intervalReading: new Decimal(5000), nextDueOn: new Date("2026-10-10T00:00:00Z"), nextDueReading: new Decimal(15000), leadReading: new Decimal(500) };
    expect(m.evaluatePlan(plan, { currentReading: new Decimal(10000), readingAt: today }, today, 7).state).toBe("soon");
    expect(m.evaluatePlan({ ...plan, nextDueOn: new Date("2026-12-01T00:00:00Z") }, { currentReading: new Decimal(15001), readingAt: today }, today, 7).state).toBe("overdue");
    expect(m.evaluatePlan({ ...plan, nextDueOn: new Date("2026-12-01T00:00:00Z") }, { currentReading: null, readingAt: null }, today, 7).state).toBe("unknown");
    expect(m.evaluatePlan({ ...plan, nextDueOn: new Date("2026-12-01T00:00:00Z") }, { currentReading: new Decimal(1000), readingAt: today }, today, 7).state).toBe("ok");
  });

  it("lecturas monótonas; corrección y cambio de medidor explícitos", async () => {
    const { ctx, cat } = await setup("Mant1");
    const a = await inv.createAsset(ctx, { name: "Camión", categoryId: cat.id, usageKind: "KM", initialReading: "10000" });
    await expectError(m.recordReading(ctx, a.id, { value: "9000" }), "VALIDATION");
    await expectError(m.recordReading(ctx, a.id, { value: "9000", kind: "CORRECTION" }), "VALIDATION");
    await m.recordReading(ctx, a.id, { value: "9500", kind: "CORRECTION", notes: "Error de dedo" });
    await m.recordReading(ctx, a.id, { value: "12", kind: "METER_REPLACEMENT", notes: "Tablero nuevo" });
    let asset = await db.asset.findUniqueOrThrow({ where: { id: a.id } });
    expect(asset.currentReading?.toString()).toBe("9500");
    await m.recordReading(ctx, a.id, { value: "112" });
    asset = await db.asset.findUniqueOrThrow({ where: { id: a.id } });
    expect(asset.currentReading?.toString()).toBe("9600");
  });

  it("detecta vencido por lectura y por fecha; completar recalcula y conserva el historial", async () => {
    const { ctx, cat } = await setup("Mant2");
    const truck = await inv.createAsset(ctx, { name: "Camión", categoryId: cat.id, usageKind: "KM", initialReading: "10000" });
    const plan = await m.createPlan(ctx, truck.id, { name: "Aceite", intervalReading: "5000", lastServiceReading: "4000", lastServiceOn: day(-200) });
    expect(plan.nextDueReading?.toString()).toBe("9000");
    const forklift = await inv.createAsset(ctx, { name: "Montacargas", categoryId: cat.id });
    const datePlan = await m.createPlan(ctx, forklift.id, { name: "Revisión", intervalDays: "30", lastServiceOn: day(-25) });
    const board = await m.planBoard(ctx);
    expect(board.find((r) => r.plan.id === plan.id)!.eval.state).toBe("overdue");
    expect(board.find((r) => r.plan.id === datePlan.id)!.eval.state).toBe("soon");
    const rec = await m.createRecord(ctx, truck.id, { type: "PREVENTIVE", planId: plan.id, description: "Cambio de aceite" });
    await m.startRecord(ctx, rec.id);
    expect((await db.asset.findUniqueOrThrow({ where: { id: truck.id } })).status).toBe("IN_MAINTENANCE");
    await m.completeRecord(ctx, rec.id, { performedOn: day(0), reading: "10100" });
    const p = await db.maintenancePlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(p.lastServiceReading?.toString()).toBe("10100");
    expect(p.nextDueReading?.toString()).toBe("15100");
    expect((await db.asset.findUniqueOrThrow({ where: { id: truck.id } })).status).toBe("ACTIVE");
    expect(await db.maintenanceRecord.count({ where: { assetId: truck.id } })).toBe(1);
    await expectError(m.completeRecord(ctx, rec.id, { performedOn: day(0) }), "CONFLICT");
    // Sin lectura no hay falsa garantía.
    const van = await inv.createAsset(ctx, { name: "Van", categoryId: cat.id, usageKind: "KM" });
    const vp = await m.createPlan(ctx, van.id, { name: "Servicio", intervalReading: "5000", lastServiceReading: "0" });
    expect((await m.planBoard(ctx)).find((r) => r.plan.id === vp.id)!.eval.state).toBe("unknown");
  });
});

describe("worker y alertas", () => {
  it("reejecutar no duplica; resolver cierra; reaparecer abre otra; reinicio recupera tareas", async () => {
    const { ctx, cat } = await setup("Alert1");
    const consum = await inv.activateSuggested(ctx, "consumibles");
    const item = await inv.createItem(ctx, { name: "Guantes", categoryId: consum.id, unit: "par", initialQuantity: "2", minQuantity: "5" });
    void cat;
    await alerts.scanCompany(ctx.companyId);
    await alerts.scanCompany(ctx.companyId);
    await Promise.all([alerts.scanCompany(ctx.companyId), alerts.scanCompany(ctx.companyId)]);
    const low = await db.alert.findMany({ where: { companyId: ctx.companyId, type: "stock.low" } });
    expect(low).toHaveLength(1);
    expect(await db.notification.count({ where: { alertId: low[0].id } })).toBe(1);
    await inv.recordMovement(ctx, item.id, { type: "IN", quantity: "10", idempotencyKey: randomUUID() });
    await alerts.scanCompany(ctx.companyId);
    expect((await db.alert.findUniqueOrThrow({ where: { id: low[0].id } })).status).toBe("RESOLVED");
    await inv.recordMovement(ctx, item.id, { type: "OUT", quantity: "11", idempotencyKey: randomUUID() });
    await alerts.scanCompany(ctx.companyId);
    expect(await db.alert.count({ where: { companyId: ctx.companyId, type: "stock.low" } })).toBe(2);
    expect(await db.alert.count({ where: { companyId: ctx.companyId, type: "stock.low", status: "OPEN" } })).toBe(1);

    // Cola: dedupe por clave y recuperación de una tarea abandonada por un worker caído.
    const k = `alerts.scan:${ctx.companyId}:test-${randomUUID()}`;
    expect(await enqueue("alerts.scan", { companyId: ctx.companyId, dedupeKey: k })).toBe(true);
    expect(await enqueue("alerts.scan", { companyId: ctx.companyId, dedupeKey: k })).toBe(false);
    let job = await claim("worker-a");
    while (job && job.companyId !== ctx.companyId) {
      await runJob(job).catch(() => {});
      job = await claim("worker-a");
    }
    expect(job).not.toBeNull();
    // Simula caída: la tarea queda RUNNING con un lock antiguo.
    await db.job.update({ where: { id: job!.id }, data: { lockedAt: new Date(Date.now() - 3600_000) } });
    await recoverStale();
    expect((await db.job.findUniqueOrThrow({ where: { id: job!.id } })).status).toBe("QUEUED");
    let again = await claim("worker-b");
    while (again && again.id !== job!.id) {
      await runJob(again).catch(() => {});
      again = await claim("worker-b");
    }
    await runJob(again!);
    expect((await db.job.findUniqueOrThrow({ where: { id: job!.id } })).status).toBe("DONE");
  });

  it("revocar un permiso oculta la notificación con datos del expediente; desactivar módulo pausa alertas", async () => {
    const { ctx } = await setup("Alert2");
    const dept = await structure.saveDepartment(ctx, null, { name: "RH" });
    const e = await employees.createEmployee(ctx, { firstName: "Laura", lastName: "Privada", departmentId: dept.id });
    const hr = await addMember(ctx, { name: "RH" });
    const g = await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: hr.membershipId, permission: "employees.read", effect: "ALLOW", scope: "COMPANY" });
    await alerts.scanCompany(ctx.companyId);
    const list = await notes.listNotifications(await hr.ctx());
    expect(list.some((n) => n.title.includes("Laura Privada"))).toBe(true);
    await companies.removeGrant(ctx, g.id);
    const after = await notes.listNotifications(await hr.ctx());
    expect(after.some((n) => n.title.includes("Laura Privada"))).toBe(false);
    void e;
    // Módulo desactivado: alertas de stock no se cierran ni se muestran; reactivar las conserva.
    const consum = await inv.activateSuggested(ctx, "consumibles");
    await inv.createItem(ctx, { name: "Cinta", categoryId: consum.id, unit: "rollo", initialQuantity: "0", minQuantity: "1" });
    await alerts.scanCompany(ctx.companyId);
    await companies.setModule(ctx, "maintenance", false);
    await companies.setModule(ctx, "inventory", false);
    await alerts.scanCompany(ctx.companyId);
    expect(await db.alert.count({ where: { companyId: ctx.companyId, type: "stock.low", status: "OPEN" } })).toBe(1);
    const offCtx = await ctxOf(ctx.userId, ctx.companyId);
    expect((await alerts.visibleAlerts(offCtx)).some((a) => a.type === "stock.low")).toBe(false);
    await companies.setModule(ctx, "inventory", true);
    expect(await db.item.count({ where: { companyId: ctx.companyId } })).toBe(1);
  });
});

describe("avisos, búsqueda y dashboard", () => {
  it("un aviso departamental no es visible para otros departamentos", async () => {
    const { ctx } = await makeCompany("Avisos");
    const a = await structure.saveDepartment(ctx, null, { name: "Ventas" });
    const b = await structure.saveDepartment(ctx, null, { name: "Almacén" });
    const seller = await addMember(ctx, { departmentId: a.id });
    const keeper = await addMember(ctx, { departmentId: b.id });
    await ann.publish(ctx, { title: "Meta de ventas", body: "<script>x</script> solo ventas", audience: "departments", departmentIds: [a.id] });
    await ann.publish(ctx, { title: "General", body: "todos", audience: "all" });
    expect((await ann.listAnnouncements(await seller.ctx(), {})).rows.map((r) => r.title).sort()).toEqual(["General", "Meta de ventas"]);
    expect((await ann.listAnnouncements(await keeper.ctx(), {})).rows.map((r) => r.title)).toEqual(["General"]);
    await expectError(ann.publish(await keeper.ctx(), { title: "x", body: "y", audience: "all" }), "FORBIDDEN");
  });

  it("búsqueda y dashboard respetan permisos y alcance", async () => {
    const { ctx } = await makeCompany("Busca");
    const a = await structure.saveDepartment(ctx, null, { name: "Sistemas" });
    const b = await structure.saveDepartment(ctx, null, { name: "Ventas" });
    await employees.createEmployee(ctx, { firstName: "Zacarías", lastName: "Sistemas", departmentId: a.id, rfc: "GODE561231GR8" });
    await employees.createEmployee(ctx, { firstName: "Zacarías", lastName: "Ventas", departmentId: b.id });
    const viewer = await addMember(ctx, { departmentId: a.id });
    await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: viewer.membershipId, permission: "employees.read", effect: "ALLOW", scope: "DEPARTMENTS", scopeDepartmentIds: [a.id] });
    const vctx = await viewer.ctx();
    const r = await universalSearch(vctx, "Zacarías");
    const labels = r.sections.flatMap((s) => s.hits.map((h) => h.label));
    expect(labels).toContain("Zacarías Sistemas");
    expect(labels).not.toContain("Zacarías Ventas");
    const sens = await universalSearch(vctx, "GODE561231GR8");
    expect(sens.sections).toHaveLength(0);
    expect(sens.restricted).toBe(true);
    const d = await dashboard(vctx);
    // Sistemas: Zacarías + la propia persona.
    expect(d.kpis.find((k) => k.label === "Personas activas")!.value).toBe(2);
    expect(d.kpis.some((k) => k.label === "Solicitudes de ingreso")).toBe(false);
    const own = await dashboard(ctx);
    expect(own.kpis.find((k) => k.label === "Personas activas")!.value).toBe(4);
  });
});
