import "server-only";
import { z } from "zod";
import { db, Decimal, type Prisma, type Tx } from "../db";
import { audit } from "../audit";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { type Ctx, can, need, requireModule } from "../context";
import { addDays, civilDate, nextCode, pageArgs, PAGE_SIZE, todayIn } from "../util";
import { currencySchema, moneySchema } from "./inventory";

const mod = (ctx: Ctx) => requireModule(ctx, "maintenance");
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const optDate = z.string().optional().transform((v) => (v ? civilDate(v) : null));
const reading = z.string().trim().regex(/^\d{1,12}(\.\d)?$/, "Lectura inválida").transform((v) => new Decimal(v));
const optReading = z.string().trim().optional().transform((v) => v || undefined).pipe(reading.optional());

/**
 * POLÍTICA DE VENCIMIENTO (visible en la interfaz):
 * - Un plan vence al cumplirse CUALQUIERA de sus umbrales (fecha o lectura).
 * - El siguiente vencimiento se calcula desde la fecha y lectura EFECTIVAS del último servicio completado
 *   (no desde un calendario fijo). Sin servicio previo, desde la creación del plan y la lectura de ese momento.
 * - "Próximo": faltan ≤ leadDays días o ≤ leadReading unidades. Sin lectura actual (o con más de 30 días),
 *   el umbral por uso queda "sin confirmar": nunca se presenta como al corriente.
 */
export const MAINTENANCE_POLICY =
  "Vence al cumplirse cualquiera de sus umbrales. El siguiente vencimiento se cuenta desde la fecha y lectura reales del último servicio completado.";
export const STALE_READING_DAYS = 30;

export type PlanEval = { state: "overdue" | "soon" | "ok" | "unknown"; reasons: string[] };

export function evaluatePlan(
  p: { intervalDays: number | null; intervalReading: Decimal | null; nextDueOn: Date | null; nextDueReading: Decimal | null; leadReading: Decimal | null },
  asset: { currentReading: Decimal | null; readingAt: Date | null },
  today: Date,
  leadDays: number,
): PlanEval {
  const reasons: string[] = [];
  let overdue = false;
  let soon = false;
  let unknown = false;
  if (p.intervalDays && p.nextDueOn) {
    if (p.nextDueOn <= today) (overdue = true), reasons.push(`venció el ${p.nextDueOn.toISOString().slice(0, 10)}`);
    else if (p.nextDueOn <= addDays(today, leadDays)) (soon = true), reasons.push(`vence el ${p.nextDueOn.toISOString().slice(0, 10)}`);
  }
  if (p.intervalReading && p.nextDueReading) {
    const stale = !asset.readingAt || asset.readingAt < addDays(today, -STALE_READING_DAYS);
    if (asset.currentReading === null) (unknown = true), reasons.push("sin lectura de uso registrada");
    else {
      const cur = new Decimal(asset.currentReading);
      const lead = p.leadReading ? new Decimal(p.leadReading) : new Decimal(p.intervalReading).mul(0.1);
      if (cur.gte(p.nextDueReading)) (overdue = true), reasons.push(`lectura ${cur} ≥ ${p.nextDueReading}`);
      else if (cur.gte(new Decimal(p.nextDueReading).sub(lead))) (soon = true), reasons.push(`lectura ${cur} cerca de ${p.nextDueReading}`);
      if (stale) (unknown = true), reasons.push(`última lectura con más de ${STALE_READING_DAYS} días`);
    }
  }
  return { state: overdue ? "overdue" : soon ? "soon" : unknown ? "unknown" : "ok", reasons };
}

function computeNext(p: { intervalDays: number | null; intervalReading: Decimal | null }, baseDate: Date, baseReading: Decimal | null) {
  return {
    nextDueOn: p.intervalDays ? addDays(baseDate, p.intervalDays) : null,
    nextDueReading: p.intervalReading && baseReading !== null ? new Decimal(baseReading).add(p.intervalReading) : null,
  };
}

async function lockAsset(tx: Tx, ctx: Ctx, assetId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM asset WHERE id = ${assetId} AND "companyId" = ${ctx.companyId} FOR UPDATE`;
  if (!rows.length) throw notFound("El activo");
  return tx.asset.findUniqueOrThrow({ where: { id: assetId } });
}

const readingSchema = z.object({
  value: reading,
  kind: z.enum(["NORMAL", "CORRECTION", "METER_REPLACEMENT"]).default("NORMAL"),
  notes: opt(300),
});

/**
 * Lecturas monótonas. Bajar una lectura exige un evento explícito:
 * - CORRECTION: corrige un error de captura (requiere motivo; queda auditado).
 * - METER_REPLACEMENT: medidor nuevo; la lectura efectiva continúa desde la anterior.
 */
async function applyReading(tx: Tx, ctx: Ctx, assetId: string, r: z.infer<typeof readingSchema>, at = new Date()) {
  const a = await lockAsset(tx, ctx, assetId);
  if (a.usageKind === "NONE") throw invalid("Este activo no registra uso.");
  if (a.status === "SOLD" || a.status === "DISPOSED") throw invalid("El activo ya no está en operación.");
  const offset = new Decimal(a.readingOffset);
  const current = a.currentReading === null ? null : new Decimal(a.currentReading);
  let effective = r.value.add(offset);
  let newOffset = offset;
  if (r.kind === "NORMAL" && current && effective.lt(current))
    throw invalid(`La lectura (${effective}) es menor que la anterior (${current}). Si fue un error, registra una corrección; si cambió el medidor, regístralo como cambio de medidor.`, { value: "Menor que la anterior" });
  if (r.kind !== "NORMAL" && !r.notes) throw invalid("Explica el motivo de la corrección o del cambio de medidor.", { notes: "Requerido" });
  if (r.kind === "METER_REPLACEMENT") {
    newOffset = (current ?? new Decimal(0)).sub(r.value);
    effective = current ?? r.value;
  }
  await tx.usageReading.create({ data: { companyId: ctx.companyId, assetId, kind: r.kind, rawValue: r.value, effectiveValue: effective, readAt: at, notes: r.notes, actorId: ctx.userId } });
  await tx.asset.update({ where: { id: assetId }, data: { currentReading: effective, readingAt: at, readingOffset: newOffset, version: { increment: 1 } } });
  await audit(tx, ctx, { action: `asset.reading.${r.kind.toLowerCase()}`, module: "maintenance", entityType: "asset", entityId: assetId, changes: { reading: [current?.toString() ?? null, effective.toString()], notes: r.notes } });
  return effective;
}

export async function recordReading(ctx: Ctx, assetId: string, raw: Record<string, unknown>) {
  mod(ctx);
  need(ctx, "maintenance.manage");
  const r = readingSchema.parse(raw);
  return db.$transaction((tx) => applyReading(tx, ctx, assetId, r));
}

const planSchema = z
  .object({
    name: z.string().trim().min(1, "Requerido").max(120),
    intervalDays: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(3650).nullable()),
    intervalReading: optReading,
    leadReading: optReading,
    lastServiceOn: optDate,
    lastServiceReading: optReading,
  })
  .refine((p) => p.intervalDays || p.intervalReading, { message: "Define un intervalo por días o por uso", path: ["intervalDays"] });

export async function createPlan(ctx: Ctx, assetId: string, raw: Record<string, unknown>) {
  mod(ctx);
  need(ctx, "maintenance.manage");
  const p = planSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const a = await lockAsset(tx, ctx, assetId);
    if (a.status === "SOLD" || a.status === "DISPOSED") throw invalid("El activo ya no está en operación.");
    if (p.intervalReading && a.usageKind === "NONE") throw invalid("Este activo no registra uso; usa un intervalo por días.");
    const baseDate = p.lastServiceOn ?? civilDate(todayIn(ctx.company.timezone));
    const baseReading = p.lastServiceReading ?? (a.currentReading === null ? null : new Decimal(a.currentReading));
    const plan = await tx.maintenancePlan.create({
      data: {
        companyId: ctx.companyId,
        assetId,
        name: p.name,
        intervalDays: p.intervalDays,
        intervalReading: p.intervalReading ?? null,
        leadReading: p.leadReading ?? null,
        lastServiceOn: p.lastServiceOn,
        lastServiceReading: p.lastServiceReading ?? null,
        ...computeNext({ intervalDays: p.intervalDays, intervalReading: p.intervalReading ?? null }, baseDate, baseReading),
      },
    });
    await audit(tx, ctx, { action: "maintenance.plan.create", module: "maintenance", entityType: "asset", entityId: assetId, summary: p.name });
    return plan;
  });
}

export async function setPlanActive(ctx: Ctx, planId: string, active: boolean) {
  mod(ctx);
  need(ctx, "maintenance.manage");
  await db.$transaction(async (tx) => {
    const p = await tx.maintenancePlan.findFirst({ where: { id: planId, companyId: ctx.companyId }, include: { asset: true } });
    if (!p) throw notFound("El plan");
    if (active && ["SOLD", "DISPOSED"].includes(p.asset.status)) throw invalid("El activo ya no está en operación.");
    await tx.maintenancePlan.update({ where: { id: planId }, data: { active } });
    await audit(tx, ctx, { action: active ? "maintenance.plan.activate" : "maintenance.plan.deactivate", module: "maintenance", entityType: "asset", entityId: p.assetId, summary: p.name });
  });
}

const recordSchema = z.object({
  type: z.enum(["PREVENTIVE", "CORRECTIVE"]),
  planId: z.string().optional().transform((v) => v || null),
  scheduledOn: optDate,
  description: z.string().trim().min(1, "Describe el trabajo").max(2000),
  supplierId: z.string().optional().transform((v) => v || null),
  workshop: opt(160),
  notes: opt(2000),
});

export async function createRecord(ctx: Ctx, assetId: string, raw: Record<string, unknown>) {
  mod(ctx);
  need(ctx, "maintenance.manage");
  const r = recordSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const a = await lockAsset(tx, ctx, assetId);
    if (a.status === "SOLD" || a.status === "DISPOSED") throw invalid("El activo ya no está en operación.");
    if (r.planId && !(await tx.maintenancePlan.findFirst({ where: { id: r.planId, companyId: ctx.companyId, assetId } }))) throw invalid("El plan no corresponde a este activo.");
    if (r.supplierId && !(await tx.supplier.findFirst({ where: { id: r.supplierId, companyId: ctx.companyId } }))) throw invalid("El proveedor no existe en esta empresa.");
    const code = await nextCode(tx, ctx.companyId, "maintenance", "MT");
    const rec = await tx.maintenanceRecord.create({ data: { companyId: ctx.companyId, code, assetId, ...r, createdById: ctx.userId } });
    await audit(tx, ctx, { action: "maintenance.record.create", module: "maintenance", entityType: "asset", entityId: assetId, summary: `${code} ${r.type === "PREVENTIVE" ? "preventivo" : "correctivo"}` });
    return rec;
  });
}

async function lockRecord(tx: Tx, ctx: Ctx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM maintenance_record WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`;
  if (!rows.length) throw notFound("El mantenimiento");
  return tx.maintenanceRecord.findUniqueOrThrow({ where: { id } });
}

/** Iniciar trabajo: el activo pasa a "en mantenimiento". */
export async function startRecord(ctx: Ctx, id: string) {
  mod(ctx);
  need(ctx, "maintenance.manage");
  await db.$transaction(async (tx) => {
    const r = await lockRecord(tx, ctx, id);
    if (r.status !== "SCHEDULED") throw conflict("El mantenimiento ya inició o terminó.");
    await tx.maintenanceRecord.update({ where: { id }, data: { status: "IN_PROGRESS", version: { increment: 1 } } });
    const a = await lockAsset(tx, ctx, r.assetId);
    if (a.status === "ACTIVE") {
      await tx.asset.update({ where: { id: a.id }, data: { status: "IN_MAINTENANCE", version: { increment: 1 } } });
      await tx.assetEvent.create({ data: { companyId: ctx.companyId, assetId: a.id, type: "STATUS", fromStatus: "ACTIVE", toStatus: "IN_MAINTENANCE", notes: `Inicio ${r.code}`, actorId: ctx.userId } });
    }
    await audit(tx, ctx, { action: "maintenance.record.start", module: "maintenance", entityType: "asset", entityId: r.assetId, summary: r.code });
  });
}

const completeSchema = z.object({
  performedOn: z.string().min(1, "Indica la fecha").transform(civilDate),
  reading: optReading,
  costAmount: z.string().trim().optional().transform((v) => v || undefined).pipe(moneySchema.optional()),
  costCurrency: z.string().optional().transform((v) => v || undefined).pipe(currencySchema.optional()),
  notes: opt(2000),
});

/**
 * Completar actualiza de forma consistente: registro, lectura, plan (último servicio y siguiente vencimiento),
 * estado operativo del activo y alertas. No borra mantenimientos previos.
 */
export async function completeRecord(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  mod(ctx);
  need(ctx, "maintenance.manage");
  const c = completeSchema.parse(raw);
  if (c.costAmount && !can(ctx, "costs.read")) throw forbidden("No tienes permiso para registrar costes.");
  await db.$transaction(async (tx) => {
    const r = await lockRecord(tx, ctx, id);
    if (!["SCHEDULED", "IN_PROGRESS"].includes(r.status)) throw conflict("El mantenimiento ya se cerró.");
    let effective: Decimal | null = null;
    if (c.reading) effective = await applyReading(tx, ctx, r.assetId, { value: c.reading, kind: "NORMAL", notes: `Servicio ${r.code}` }, c.performedOn);
    const a = await lockAsset(tx, ctx, r.assetId);
    effective ??= a.currentReading === null ? null : new Decimal(a.currentReading);
    await tx.maintenanceRecord.update({
      where: { id },
      data: {
        status: "DONE",
        performedOn: c.performedOn,
        reading: effective,
        costAmount: c.costAmount ?? null,
        costCurrency: c.costAmount ? (c.costCurrency ?? "MXN") : null,
        notes: c.notes ?? r.notes,
        completedById: ctx.userId,
        version: { increment: 1 },
      },
    });
    if (r.planId) {
      const p = await tx.maintenancePlan.findUniqueOrThrow({ where: { id: r.planId } });
      await tx.maintenancePlan.update({
        where: { id: p.id },
        data: { lastServiceOn: c.performedOn, lastServiceReading: effective, ...computeNext(p, c.performedOn, effective), version: { increment: 1 } },
      });
      await tx.alert.updateMany({ where: { companyId: ctx.companyId, status: "OPEN", dedupeKey: `asset:${r.assetId}:plan:${p.id}` }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    }
    if (a.status === "IN_MAINTENANCE") {
      const stillOpen = await tx.maintenanceRecord.count({ where: { companyId: ctx.companyId, assetId: a.id, status: "IN_PROGRESS", id: { not: id } } });
      if (!stillOpen) {
        await tx.asset.update({ where: { id: a.id }, data: { status: "ACTIVE", version: { increment: 1 } } });
        await tx.assetEvent.create({ data: { companyId: ctx.companyId, assetId: a.id, type: "STATUS", fromStatus: "IN_MAINTENANCE", toStatus: "ACTIVE", notes: `Fin ${r.code}`, actorId: ctx.userId } });
      }
    }
    await tx.assetEvent.create({ data: { companyId: ctx.companyId, assetId: a.id, type: "MAINTENANCE", notes: `${r.code} completado`, actorId: ctx.userId } });
    await audit(tx, ctx, { action: "maintenance.record.complete", module: "maintenance", entityType: "asset", entityId: r.assetId, summary: `${r.code} completado ${c.performedOn.toISOString().slice(0, 10)}${effective ? ` a ${effective}` : ""}` });
  });
}

export async function cancelRecord(ctx: Ctx, id: string) {
  mod(ctx);
  need(ctx, "maintenance.manage");
  await db.$transaction(async (tx) => {
    const r = await lockRecord(tx, ctx, id);
    if (!["SCHEDULED", "IN_PROGRESS"].includes(r.status)) throw conflict("El mantenimiento ya se cerró.");
    await tx.maintenanceRecord.update({ where: { id }, data: { status: "CANCELLED", version: { increment: 1 } } });
    await audit(tx, ctx, { action: "maintenance.record.cancel", module: "maintenance", entityType: "asset", entityId: r.assetId, summary: r.code });
  });
}

/** Panel de planes con estado calculado (vencidos, próximos, sin confirmar, al corriente). */
export async function planBoard(ctx: Ctx, filter?: "overdue" | "soon" | "unknown" | "ok") {
  mod(ctx);
  need(ctx, "maintenance.read");
  const [plans, settings] = await Promise.all([
    db.maintenancePlan.findMany({
      where: { companyId: ctx.companyId, active: true, asset: { status: { notIn: ["SOLD", "DISPOSED"] } } },
      include: { asset: { select: { id: true, code: true, name: true, usageKind: true, currentReading: true, readingAt: true } } },
      take: 500,
    }),
    db.companySettings.findUniqueOrThrow({ where: { companyId: ctx.companyId } }),
  ]);
  const today = civilDate(todayIn(ctx.company.timezone));
  const rows = plans.map((p) => ({ plan: p, eval: evaluatePlan(p, p.asset, today, settings.maintenanceLeadDays) }));
  const order = { overdue: 0, soon: 1, unknown: 2, ok: 3 };
  return rows.filter((r) => !filter || r.eval.state === filter).sort((a, b) => order[a.eval.state] - order[b.eval.state]);
}

export async function listRecords(ctx: Ctx, f: { status?: string; from?: string; to?: string; page?: number }) {
  mod(ctx);
  need(ctx, "maintenance.read");
  const page = Math.max(1, f.page ?? 1);
  const range = { ...(f.from ? { gte: civilDate(f.from) } : {}), ...(f.to ? { lte: civilDate(f.to) } : {}) };
  const where: Prisma.MaintenanceRecordWhereInput = {
    companyId: ctx.companyId,
    ...(f.status ? { status: f.status as never } : {}),
    ...(f.from || f.to ? { OR: [{ performedOn: range }, { scheduledOn: range }] } : {}),
  };
  const costs = can(ctx, "costs.read");
  const [rows, total] = await Promise.all([
    db.maintenanceRecord.findMany({ where, ...pageArgs(page), orderBy: { createdAt: "desc" }, include: { asset: { select: { code: true, name: true } } } }),
    db.maintenanceRecord.count({ where }),
  ]);
  return { rows: rows.map((r) => ({ ...r, costAmount: costs ? r.costAmount : null })), total, page, pageSize: PAGE_SIZE };
}

export async function getRecord(ctx: Ctx, id: string) {
  mod(ctx);
  need(ctx, "maintenance.read");
  const r = await db.maintenanceRecord.findFirst({ where: { id, companyId: ctx.companyId }, include: { asset: true, plan: true, supplier: { select: { id: true, name: true } } } });
  if (!r) throw notFound("El mantenimiento");
  const costs = can(ctx, "costs.read");
  const docs = await db.document.findMany({ where: { companyId: ctx.companyId, maintenanceId: id, archivedAt: null }, select: { id: true, title: true, currentVersionNo: true } });
  return { record: { ...r, costAmount: costs ? r.costAmount : null }, costsVisible: costs, documents: docs };
}
