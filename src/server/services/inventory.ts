import "server-only";
import { z } from "zod";
import { db, Decimal, type Prisma, type Tx } from "../db";
import { audit, diff } from "../audit";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { type Ctx, can, need, requireModule } from "../context";
import { civilDate, nextCode, pageArgs, PAGE_SIZE } from "../util";
import { SUGGESTED_CATEGORIES, UNITS, CURRENCIES } from "@/lib/catalogs";

// ───────── Utilidades numéricas: siempre Decimal, nunca floats ─────────

export const qtySchema = (msg = "Cantidad inválida") =>
  z.string().trim().regex(/^\d{1,12}(\.\d{1,4})?$/, msg).transform((v) => new Decimal(v));
export const moneySchema = z.string().trim().regex(/^\d{1,14}(\.\d{1,4})?$/, "Importe inválido").transform((v) => new Decimal(v));
const optMoney = z.string().trim().optional().transform((v) => v || undefined).pipe(moneySchema.optional());
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const optDate = z.string().optional().transform((v) => (v ? civilDate(v) : null));
export const currencySchema = z.enum(CURRENCIES, { message: "Moneda no admitida" });

function inv(ctx: Ctx) {
  requireModule(ctx, "inventory");
}

// ───────── Categorías ─────────

export async function listCategories(ctx: Ctx, opts: { includeHidden?: boolean; tracking?: "STOCK" | "ASSET" } = {}) {
  inv(ctx);
  need(ctx, "inventory.read");
  return db.category.findMany({
    where: { companyId: ctx.companyId, archivedAt: null, ...(opts.includeHidden ? {} : { hidden: false }), ...(opts.tracking ? { tracking: opts.tracking } : {}) },
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true, assets: true } } },
  });
}

/** Activa una categoría sugerida. Ninguna categoría se crea sin que la empresa la elija. */
export async function activateSuggested(ctx: Ctx, key: string) {
  inv(ctx);
  need(ctx, "inventory.manage");
  const s = SUGGESTED_CATEGORIES.find((x) => x.key === key);
  if (!s) throw invalid("Categoría sugerida desconocida.");
  return db.$transaction(async (tx) => {
    const existing = await tx.category.findUnique({ where: { companyId_suggestedKey: { companyId: ctx.companyId, suggestedKey: key } } });
    if (existing) {
      await tx.category.update({ where: { id: existing.id }, data: { hidden: false, archivedAt: null } });
      return existing;
    }
    const c = await tx.category.create({ data: { companyId: ctx.companyId, name: s.name, tracking: s.tracking, suggestedKey: s.key } });
    await audit(tx, ctx, { action: "category.create", module: "inventory", entityType: "category", entityId: c.id, summary: s.name });
    return c;
  });
}

const catSchema = z.object({
  name: z.string().trim().min(1, "Requerido").max(80),
  tracking: z.enum(["STOCK", "ASSET"], { message: "Elige el tipo de seguimiento" }),
  parentId: z.string().optional().transform((v) => v || null),
});

export async function createCategory(ctx: Ctx, raw: Record<string, unknown>) {
  inv(ctx);
  need(ctx, "inventory.manage");
  const c = catSchema.parse(raw);
  return db.$transaction(async (tx) => {
    if (c.parentId) {
      const p = await tx.category.findFirst({ where: { id: c.parentId, companyId: ctx.companyId } });
      if (!p) throw invalid("La categoría superior no existe.");
      if (p.parentId) throw invalid("Solo se admite un nivel de subcategorías.");
      if (p.tracking !== c.tracking) throw invalid("Una subcategoría usa el mismo tipo de seguimiento que su categoría.");
    }
    const cat = await tx.category.create({ data: { companyId: ctx.companyId, ...c } });
    await audit(tx, ctx, { action: "category.create", module: "inventory", entityType: "category", entityId: cat.id, summary: c.name });
    return cat;
  });
}

export async function updateCategory(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  inv(ctx);
  need(ctx, "inventory.manage");
  const u = z.object({ name: z.string().trim().min(1).max(80), hidden: z.string().optional().transform((v) => v === "on") }).parse(raw);
  await db.$transaction(async (tx) => {
    const c = await tx.category.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!c) throw notFound("La categoría");
    // El tipo de seguimiento no se edita: cambiarlo alteraría el significado de los registros existentes.
    await tx.category.update({ where: { id }, data: u });
    await audit(tx, ctx, { action: "category.update", module: "inventory", entityType: "category", entityId: id, changes: diff(c, u) });
  });
}

/** Archivar conserva referencias. Borrar solo se permite si está vacía y sin historial. */
export async function archiveOrDeleteCategory(ctx: Ctx, id: string, mode: "archive" | "delete") {
  inv(ctx);
  need(ctx, "inventory.manage");
  await db.$transaction(async (tx) => {
    const c = await tx.category.findFirst({ where: { id, companyId: ctx.companyId }, include: { _count: { select: { items: true, assets: true, children: true, purchaseLines: true } } } });
    if (!c) throw notFound("La categoría");
    if (mode === "delete") {
      const used = c._count.items + c._count.assets + c._count.children + c._count.purchaseLines;
      if (used) throw invalid("Solo se pueden borrar categorías vacías y sin referencias. Puedes archivarla.");
      await tx.category.delete({ where: { id } });
    } else await tx.category.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(tx, ctx, { action: `category.${mode}`, module: "inventory", entityType: "category", entityId: id, summary: c.name });
  });
}

async function categoryOf(tx: Tx | typeof db, ctx: Ctx, id: string, tracking: "STOCK" | "ASSET") {
  const c = await tx.category.findFirst({ where: { id, companyId: ctx.companyId, archivedAt: null } });
  if (!c) throw invalid("La categoría no existe en esta empresa.", { categoryId: "No válida" });
  if (c.tracking !== tracking) throw invalid(tracking === "STOCK" ? "Esa categoría es de activos individuales." : "Esa categoría es de existencias por cantidad.", { categoryId: "Tipo incorrecto" });
  return c;
}

// ───────── Existencias ─────────

export async function listItems(ctx: Ctx, f: { q?: string; categoryId?: string; low?: boolean; archived?: boolean; page?: number }) {
  inv(ctx);
  need(ctx, "inventory.read");
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.ItemWhereInput = {
    companyId: ctx.companyId,
    archivedAt: f.archived ? { not: null } : null,
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  if (f.low) {
    // Comparación columna contra columna: se resuelve en SQL.
    const ids = await db.$queryRaw<{ id: string }[]>`SELECT id FROM item WHERE "companyId" = ${ctx.companyId} AND "archivedAt" IS NULL AND "minQuantity" IS NOT NULL AND quantity <= "minQuantity"`;
    where.id = { in: ids.map((r) => r.id) };
  }
  const [rows, total] = await Promise.all([
    db.item.findMany({ where, ...pageArgs(page), orderBy: { name: "asc" }, include: { category: { select: { name: true } } } }),
    db.item.count({ where }),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Requerido").max(160),
  categoryId: z.string().min(1, "Elige una categoría"),
  unit: z.enum(UNITS, { message: "Unidad no válida" }),
  minQuantity: z.string().trim().optional().transform((v) => v || undefined).pipe(qtySchema().optional()),
  location: opt(160),
  notes: opt(1000),
});

export async function createItem(ctx: Ctx, raw: Record<string, unknown>) {
  inv(ctx);
  need(ctx, "inventory.manage");
  const i = itemSchema.parse(raw);
  const initial = z.string().trim().optional().transform((v) => v || "0").pipe(qtySchema()).parse(raw.initialQuantity);
  return db.$transaction(async (tx) => {
    await categoryOf(tx, ctx, i.categoryId, "STOCK");
    const code = await nextCode(tx, ctx.companyId, "item", "ART");
    const item = await tx.item.create({ data: { companyId: ctx.companyId, code, ...i, minQuantity: i.minQuantity ?? null, quantity: initial } });
    if (initial.gt(0)) {
      await tx.stockMovement.create({ data: { companyId: ctx.companyId, itemId: item.id, type: "INITIAL", quantity: initial, balanceAfter: initial, reason: "Saldo inicial", actorId: ctx.userId } });
    }
    await audit(tx, ctx, { action: "item.create", module: "inventory", entityType: "item", entityId: item.id, summary: `${code} ${i.name} (saldo inicial ${initial} ${i.unit})` });
    return item;
  });
}

export async function updateItem(ctx: Ctx, id: string, raw: Record<string, unknown>, version: number) {
  inv(ctx);
  need(ctx, "inventory.manage");
  const i = itemSchema.parse(raw);
  await db.$transaction(async (tx) => {
    const before = await tx.item.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!before) throw notFound("El artículo");
    await categoryOf(tx, ctx, i.categoryId, "STOCK");
    if (i.unit !== before.unit && (await tx.stockMovement.count({ where: { itemId: id } }))) throw invalid("No se puede cambiar la unidad de un artículo con movimientos.", { unit: "Tiene movimientos" });
    const n = await tx.item.updateMany({ where: { id, companyId: ctx.companyId, version }, data: { ...i, minQuantity: i.minQuantity ?? null, version: { increment: 1 } } });
    if (!n.count) throw conflict();
    await audit(tx, ctx, { action: "item.update", module: "inventory", entityType: "item", entityId: id, changes: diff(before, i) });
  });
}

export async function setItemArchived(ctx: Ctx, id: string, archived: boolean) {
  inv(ctx);
  need(ctx, "inventory.manage");
  await db.$transaction(async (tx) => {
    const n = await tx.item.updateMany({ where: { id, companyId: ctx.companyId }, data: { archivedAt: archived ? new Date() : null } });
    if (!n.count) throw notFound("El artículo");
    await audit(tx, ctx, { action: archived ? "item.archive" : "item.unarchive", module: "inventory", entityType: "item", entityId: id });
  });
}

/**
 * Aplica un movimiento al saldo de forma atómica: el UPDATE condicional impide saldos negativos
 * incluso con salidas concurrentes. Debe llamarse dentro de una transacción.
 */
export async function applyMovement(
  tx: Tx,
  ctx: Ctx,
  m: { itemId: string; type: Prisma.StockMovementCreateInput["type"]; delta: Decimal; reason: string | null; idempotencyKey?: string | null; reversesId?: string | null; receiptLineId?: string | null },
) {
  const rows = await tx.$queryRaw<{ quantity: Decimal }[]>`
    UPDATE item SET quantity = quantity + ${m.delta}::numeric, version = version + 1, "updatedAt" = now()
    WHERE id = ${m.itemId} AND "companyId" = ${ctx.companyId} AND quantity + ${m.delta}::numeric >= 0
    RETURNING quantity`;
  if (!rows.length) {
    const exists = await tx.item.findFirst({ where: { id: m.itemId, companyId: ctx.companyId }, select: { quantity: true, unit: true } });
    if (!exists) throw notFound("El artículo");
    throw invalid(`Existencias insuficientes: hay ${exists.quantity} ${exists.unit}.`, { quantity: "Supera el disponible" });
  }
  return tx.stockMovement.create({
    data: {
      companyId: ctx.companyId,
      itemId: m.itemId,
      type: m.type,
      quantity: m.delta,
      balanceAfter: new Decimal(rows[0].quantity),
      reason: m.reason,
      actorId: ctx.userId,
      idempotencyKey: m.idempotencyKey ?? null,
      reversesId: m.reversesId ?? null,
      receiptLineId: m.receiptLineId ?? null,
    },
  });
}

const moveSchema = z.object({
  type: z.enum(["IN", "OUT", "ADJUST"]),
  quantity: qtySchema(),
  direction: z.enum(["+", "-"]).default("+"),
  reason: z.string().trim().max(300).optional().transform((v) => v || null),
  idempotencyKey: z.string().trim().min(8).max(80),
});

/** Entrada/salida/ajuste con clave de idempotencia: repetir la misma solicitud devuelve el mismo movimiento. */
export async function recordMovement(ctx: Ctx, itemId: string, raw: Record<string, unknown>) {
  inv(ctx);
  need(ctx, "inventory.move");
  const m = moveSchema.parse(raw);
  if (m.quantity.lte(0)) throw invalid("La cantidad debe ser mayor que cero.", { quantity: "Mayor que cero" });
  if (m.type === "ADJUST" && !m.reason) throw invalid("Un ajuste requiere motivo.", { reason: "Requerido" });
  const prior = await db.stockMovement.findUnique({ where: { companyId_idempotencyKey: { companyId: ctx.companyId, idempotencyKey: m.idempotencyKey } } });
  if (prior) return { movement: prior, duplicate: true };
  const delta = m.type === "OUT" || (m.type === "ADJUST" && m.direction === "-") ? m.quantity.neg() : m.quantity;
  try {
    const movement = await db.$transaction(async (tx) => {
      const mv = await applyMovement(tx, ctx, { itemId, type: m.type, delta, reason: m.reason, idempotencyKey: m.idempotencyKey });
      await audit(tx, ctx, { action: "stock.move", module: "inventory", entityType: "item", entityId: itemId, changes: { type: m.type, quantity: delta.toString(), balanceAfter: mv.balanceAfter.toString(), reason: m.reason } });
      return mv;
    });
    return { movement, duplicate: false };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const again = await db.stockMovement.findUnique({ where: { companyId_idempotencyKey: { companyId: ctx.companyId, idempotencyKey: m.idempotencyKey } } });
      if (again) return { movement: again, duplicate: true };
    }
    throw e;
  }
}

/** Corrección = movimiento compensatorio. El historial nunca se borra. */
export async function reverseMovement(ctx: Ctx, movementId: string, reason: string) {
  inv(ctx);
  need(ctx, "inventory.move");
  const r = z.string().trim().min(3, "Indica el motivo").max(300).parse(reason);
  return db.$transaction(async (tx) => {
    const m = await tx.stockMovement.findFirst({ where: { id: movementId, companyId: ctx.companyId } });
    if (!m) throw notFound("El movimiento");
    if (m.type === "REVERSAL" || m.type === "RECEIPT_REVERSAL") throw invalid("Una reversión no se revierte; registra un movimiento nuevo.");
    if (m.type === "RECEIPT") throw invalid("Los movimientos de recepción se revierten desde la compra.");
    if (await tx.stockMovement.findUnique({ where: { reversesId: m.id } })) throw conflict("Ese movimiento ya fue revertido.");
    const mv = await applyMovement(tx, ctx, { itemId: m.itemId, type: "REVERSAL", delta: new Decimal(m.quantity).neg(), reason: r, reversesId: m.id });
    await audit(tx, ctx, { action: "stock.reverse", module: "inventory", entityType: "item", entityId: m.itemId, changes: { reverses: m.id, quantity: mv.quantity.toString(), reason: r } });
    return mv;
  });
}

export async function getItem(ctx: Ctx, id: string, page = 1) {
  inv(ctx);
  need(ctx, "inventory.read");
  const item = await db.item.findFirst({ where: { id, companyId: ctx.companyId }, include: { category: true } });
  if (!item) throw notFound("El artículo");
  const showCosts = can(ctx, "costs.read") && (can(ctx, "purchases.read") || can(ctx, "inventory.read"));
  const [movements, total, prices] = await Promise.all([
    db.stockMovement.findMany({ where: { companyId: ctx.companyId, itemId: id }, orderBy: { createdAt: "desc" }, ...pageArgs(page) }),
    db.stockMovement.count({ where: { companyId: ctx.companyId, itemId: id } }),
    showCosts ? comparePrices(ctx, id) : null,
  ]);
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(movements.map((m) => m.actorId))] } }, select: { id: true, name: true, lastName: true } });
  const names = new Map(actors.map((a) => [a.id, `${a.name} ${a.lastName}`]));
  return { item, movements: movements.map((m) => ({ ...m, actor: names.get(m.actorId) ?? "—" })), total, page, pageSize: PAGE_SIZE, prices };
}

// ───────── Precios ─────────

/**
 * Último precio por proveedor y comparación SOLO entre precios equivalentes: misma unidad, misma moneda
 * y misma base fiscal (con/sin impuestos). No se inventan conversiones ni tipos de cambio.
 */
export async function comparePrices(ctx: Ctx, itemId: string) {
  if (!can(ctx, "costs.read")) throw forbidden("No tienes permiso para ver precios.");
  const recs = await db.priceRecord.findMany({
    where: { companyId: ctx.companyId, itemId, voidedAt: null },
    orderBy: { observedOn: "desc" },
    include: { supplier: { select: { name: true } }, purchaseLine: { select: { purchase: { select: { id: true, code: true } } } } },
    take: 200,
  });
  const latestBySupplier = new Map<string, (typeof recs)[number]>();
  for (const r of recs) {
    const k = `${r.supplierId}|${r.unit}|${r.currency}|${r.pricesIncludeTax}`;
    if (!latestBySupplier.has(k)) latestBySupplier.set(k, r);
  }
  const groups = new Map<string, (typeof recs)[number][]>();
  for (const r of latestBySupplier.values()) {
    const g = `${r.unit}|${r.currency}|${r.pricesIncludeTax ? "con impuestos" : "sin impuestos"}`;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const fmt = (r: (typeof recs)[number]) => ({
    supplier: r.supplier.name,
    unitPrice: r.unitPrice.toString(),
    unit: r.unit,
    currency: r.currency,
    includesTax: r.pricesIncludeTax,
    observedOn: r.observedOn.toISOString().slice(0, 10),
    purchaseCode: r.purchaseLine.purchase.code,
    purchaseId: r.purchaseLine.purchase.id,
  });
  return {
    last: recs[0] ? fmt(recs[0]) : null,
    comparable: [...groups.entries()].map(([basis, rs]) => ({
      basis,
      suppliers: rs.sort((a, b) => a.unitPrice.comparedTo(b.unitPrice)).map(fmt),
    })),
  };
}

// ───────── Activos ─────────

const ASSET_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["IN_MAINTENANCE", "OUT_OF_SERVICE", "SOLD", "DISPOSED"],
  IN_MAINTENANCE: ["ACTIVE", "OUT_OF_SERVICE", "SOLD", "DISPOSED"],
  OUT_OF_SERVICE: ["ACTIVE", "IN_MAINTENANCE", "SOLD", "DISPOSED"],
  SOLD: [],
  DISPOSED: [],
};
export const assetTransitions = (s: string) => ASSET_TRANSITIONS[s] ?? [];

export async function listAssets(ctx: Ctx, f: { q?: string; status?: string; categoryId?: string; page?: number }) {
  inv(ctx);
  need(ctx, "inventory.read");
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.AssetWhereInput = {
    companyId: ctx.companyId,
    ...(f.status && f.status in ASSET_TRANSITIONS ? { status: f.status as never } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { serial: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.asset.findMany({
      where,
      ...pageArgs(page),
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, serial: true, status: true, location: true, usageKind: true, currentReading: true, category: { select: { name: true } } },
    }),
    db.asset.count({ where }),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

const assetSchema = z.object({
  name: z.string().trim().min(1, "Requerido").max(160),
  categoryId: z.string().min(1, "Elige una categoría"),
  serial: opt(120),
  brand: opt(80),
  model: opt(80),
  year: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1900).max(2100).nullable()),
  acquiredOn: optDate,
  supplierId: opt(60),
  warrantyUntil: optDate,
  location: opt(160),
  usageKind: z.enum(["NONE", "KM", "HOURS"]).default("NONE"),
  responsibleLabel: opt(160),
  notes: opt(2000),
});
const costSchema = z.object({ costAmount: optMoney, costCurrency: z.string().optional().transform((v) => v || undefined).pipe(currencySchema.optional()) });

async function validateSupplier(tx: Tx | typeof db, ctx: Ctx, supplierId: string | null) {
  if (!supplierId) return;
  requireModule(ctx, "suppliers");
  if (!(await tx.supplier.findFirst({ where: { id: supplierId, companyId: ctx.companyId } }))) throw invalid("El proveedor no existe en esta empresa.");
}

export async function createAsset(ctx: Ctx, raw: Record<string, unknown>) {
  inv(ctx);
  need(ctx, "inventory.manage");
  const a = assetSchema.parse(raw);
  const cost = costSchema.parse(raw);
  if (cost.costAmount && !can(ctx, "costs.read")) throw forbidden("No tienes permiso para registrar costes.");
  const initialReading = z.string().trim().optional().transform((v) => v || undefined).pipe(z.string().regex(/^\d{1,12}(\.\d)?$/, "Lectura inválida").optional()).parse(raw.initialReading);
  return db.$transaction(async (tx) => {
    await categoryOf(tx, ctx, a.categoryId, "ASSET");
    await validateSupplier(tx, ctx, a.supplierId);
    const code = await nextCode(tx, ctx.companyId, "asset", "ACT");
    const asset = await tx.asset.create({
      data: {
        companyId: ctx.companyId,
        code,
        ...a,
        costAmount: cost.costAmount ?? null,
        costCurrency: cost.costAmount ? (cost.costCurrency ?? "MXN") : null,
        ...(initialReading && a.usageKind !== "NONE" ? { currentReading: new Decimal(initialReading), readingAt: new Date() } : {}),
      },
    });
    await tx.assetEvent.create({ data: { companyId: ctx.companyId, assetId: asset.id, type: "CREATED", toStatus: "ACTIVE", actorId: ctx.userId } });
    if (initialReading && a.usageKind !== "NONE") {
      await tx.usageReading.create({ data: { companyId: ctx.companyId, assetId: asset.id, rawValue: new Decimal(initialReading), effectiveValue: new Decimal(initialReading), readAt: new Date(), notes: "Lectura inicial", actorId: ctx.userId } });
    }
    await audit(tx, ctx, { action: "asset.create", module: "inventory", entityType: "asset", entityId: asset.id, summary: `${code} ${a.name}` });
    return asset;
  });
}

export async function updateAsset(ctx: Ctx, id: string, raw: Record<string, unknown>, version: number) {
  inv(ctx);
  need(ctx, "inventory.manage");
  const a = assetSchema.parse(raw);
  const cost = can(ctx, "costs.read") ? costSchema.parse(raw) : null;
  await db.$transaction(async (tx) => {
    const before = await tx.asset.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!before) throw notFound("El activo");
    await categoryOf(tx, ctx, a.categoryId, "ASSET");
    await validateSupplier(tx, ctx, a.supplierId);
    if (a.usageKind !== before.usageKind && before.currentReading !== null) throw invalid("No se puede cambiar el tipo de uso de un activo con lecturas.", { usageKind: "Tiene lecturas" });
    const data = { ...a, ...(cost ? { costAmount: cost.costAmount ?? null, costCurrency: cost.costAmount ? (cost.costCurrency ?? "MXN") : null } : {}) };
    const n = await tx.asset.updateMany({ where: { id, companyId: ctx.companyId, version }, data: { ...data, version: { increment: 1 } } });
    if (!n.count) throw conflict();
    if (a.responsibleLabel !== before.responsibleLabel) {
      await tx.assetEvent.create({ data: { companyId: ctx.companyId, assetId: id, type: "RESPONSIBLE", notes: `Responsable informativo: ${a.responsibleLabel ?? "ninguno"}`, actorId: ctx.userId } });
    }
    await audit(tx, ctx, { action: "asset.update", module: "inventory", entityType: "asset", entityId: id, changes: diff(before, data, cost ? [] : ["costAmount"]) });
  });
}

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "IN_MAINTENANCE", "OUT_OF_SERVICE", "SOLD", "DISPOSED"]),
  notes: opt(1000),
  soldOn: optDate,
  saleAmount: optMoney,
  saleCurrency: z.string().optional().transform((v) => v || undefined).pipe(currencySchema.optional()),
});

/** Transiciones explícitas. Vender o dar de baja detiene planes de mantenimiento y sus alertas; el historial se conserva. */
export async function changeAssetStatus(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  inv(ctx);
  need(ctx, "inventory.manage");
  const s = statusSchema.parse(raw);
  if (s.status === "SOLD") {
    if (!s.soldOn) throw invalid("Indica la fecha de venta.", { soldOn: "Requerido" });
    if (s.saleAmount && !can(ctx, "costs.read")) throw forbidden("No tienes permiso para registrar importes.");
  }
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM asset WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`;
    if (!rows.length) throw notFound("El activo");
    const from = rows[0].status;
    if (!assetTransitions(from).includes(s.status)) throw invalid(`No se puede pasar de ${from} a ${s.status}.`);
    await tx.asset.update({
      where: { id },
      data: {
        status: s.status,
        version: { increment: 1 },
        ...(s.status === "SOLD" ? { soldOn: s.soldOn, saleAmount: s.saleAmount ?? null, saleCurrency: s.saleAmount ? (s.saleCurrency ?? "MXN") : null } : {}),
      },
    });
    await tx.assetEvent.create({ data: { companyId: ctx.companyId, assetId: id, type: "STATUS", fromStatus: from as never, toStatus: s.status, notes: s.notes, actorId: ctx.userId } });
    if (s.status === "SOLD" || s.status === "DISPOSED") {
      await tx.maintenancePlan.updateMany({ where: { companyId: ctx.companyId, assetId: id, active: true }, data: { active: false } });
      await tx.maintenanceRecord.updateMany({ where: { companyId: ctx.companyId, assetId: id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, data: { status: "CANCELLED" } });
      await tx.alert.updateMany({ where: { companyId: ctx.companyId, status: "OPEN", dedupeKey: { startsWith: `asset:${id}:` } }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    }
    await audit(tx, ctx, { action: "asset.status", module: "inventory", entityType: "asset", entityId: id, changes: { status: [from, s.status], ...(s.status === "SOLD" ? { soldOn: s.soldOn?.toISOString().slice(0, 10) } : {}) } });
  });
}

export async function getAsset(ctx: Ctx, id: string) {
  inv(ctx);
  need(ctx, "inventory.read");
  const a = await db.asset.findFirst({ where: { id, companyId: ctx.companyId }, include: { category: true, supplier: { select: { id: true, name: true } } } });
  if (!a) throw notFound("El activo");
  const costs = can(ctx, "costs.read");
  const maint = ctx.modules.has("maintenance") && can(ctx, "maintenance.read");
  const [events, readings, plans, records] = await Promise.all([
    db.assetEvent.findMany({ where: { companyId: ctx.companyId, assetId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.usageReading.findMany({ where: { companyId: ctx.companyId, assetId: id }, orderBy: { readAt: "desc" }, take: 50 }),
    maint ? db.maintenancePlan.findMany({ where: { companyId: ctx.companyId, assetId: id }, orderBy: { createdAt: "asc" } }) : [],
    maint ? db.maintenanceRecord.findMany({ where: { companyId: ctx.companyId, assetId: id }, orderBy: { createdAt: "desc" }, take: 50 }) : [],
  ]);
  return {
    asset: { ...a, costAmount: costs ? a.costAmount : null, saleAmount: costs ? a.saleAmount : null },
    costsVisible: costs,
    events,
    readings,
    plans,
    records: records.map((r) => ({ ...r, costAmount: costs ? r.costAmount : null })),
  };
}

