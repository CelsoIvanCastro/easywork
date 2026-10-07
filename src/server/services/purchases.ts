import "server-only";
import { z } from "zod";
import { db, Decimal, type Prisma, type Tx } from "../db";
import { audit } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { type Ctx, can, need, requireModule } from "../context";
import { civilDate, nextCode, pageArgs, PAGE_SIZE, todayIn } from "../util";
import { applyMovement, currencySchema, moneySchema, qtySchema } from "./inventory";
import { UNITS } from "@/lib/catalogs";

const mod = (ctx: Ctx) => requireModule(ctx, "purchases");
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const lineSchema = z
  .object({
    kind: z.enum(["STOCK", "ASSET", "SERVICE"]),
    itemId: z.string().optional().transform((v) => v || null),
    categoryId: z.string().optional().transform((v) => v || null),
    description: z.string().trim().max(200).default(""),
    unit: z.enum(UNITS).optional(),
    quantity: qtySchema("Cantidad inválida"),
    unitPrice: moneySchema,
  })
  .refine((l) => l.quantity.gt(0), { message: "La cantidad debe ser mayor que cero", path: ["quantity"] })
  .refine((l) => l.kind !== "ASSET" || l.quantity.isInteger(), { message: "Los activos se compran en unidades enteras", path: ["quantity"] });

const purchaseSchema = z.object({
  supplierId: z.string().min(1, "Elige un proveedor"),
  orderedOn: z.string().min(1, "Indica la fecha").transform(civilDate),
  reference: opt(80),
  currency: currencySchema,
  pricesIncludeTax: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
  notes: opt(2000),
  lines: z.array(lineSchema).min(1, "Agrega al menos una línea").max(100),
});

/** Importe de línea = cantidad × precio unitario, redondeado a centavos (mitad hacia arriba). Calculado en servidor. */
export const lineAmount = (q: Decimal, p: Decimal) => q.mul(p).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

async function buildLines(tx: Tx, ctx: Ctx, lines: z.infer<typeof lineSchema>[]) {
  const out: Omit<Prisma.PurchaseLineCreateManyInput, "companyId" | "purchaseId">[] = [];
  let total = new Decimal(0);
  for (const [i, l] of lines.entries()) {
    let unit = l.unit ?? "pieza";
    let description = l.description;
    if (l.kind === "STOCK") {
      const item = await tx.item.findFirst({ where: { id: l.itemId ?? "-", companyId: ctx.companyId, archivedAt: null } });
      if (!item) throw invalid(`Línea ${i + 1}: elige un artículo de existencias válido.`);
      unit = item.unit as typeof unit; // La unidad de compra es la del artículo: el stock se mantiene coherente.
      description ||= item.name;
    } else if (l.kind === "ASSET") {
      const cat = await tx.category.findFirst({ where: { id: l.categoryId ?? "-", companyId: ctx.companyId, tracking: "ASSET", archivedAt: null } });
      if (!cat) throw invalid(`Línea ${i + 1}: elige una categoría de activos válida.`);
      unit = "pieza";
      if (!description) throw invalid(`Línea ${i + 1}: describe el activo.`);
    } else if (!description) throw invalid(`Línea ${i + 1}: describe el servicio.`);
    const amount = lineAmount(l.quantity, l.unitPrice);
    total = total.add(amount);
    out.push({ lineNo: i + 1, kind: l.kind, itemId: l.kind === "STOCK" ? l.itemId : null, categoryId: l.kind === "ASSET" ? l.categoryId : null, description, unit, quantity: l.quantity, unitPrice: l.unitPrice, amount });
  }
  return { lines: out, total };
}

async function activeSupplier(tx: Tx, ctx: Ctx, id: string) {
  const s = await tx.supplier.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!s) throw invalid("El proveedor no existe en esta empresa.", { supplierId: "No válido" });
  if (s.archivedAt) throw invalid("El proveedor está archivado: no admite nuevas compras.", { supplierId: "Archivado" });
  return s;
}

export async function createPurchase(ctx: Ctx, raw: unknown) {
  mod(ctx);
  need(ctx, "purchases.manage");
  const p = purchaseSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const s = await activeSupplier(tx, ctx, p.supplierId);
    const { lines, total } = await buildLines(tx, ctx, p.lines);
    const code = await nextCode(tx, ctx.companyId, "purchase", "OC");
    const purchase = await tx.purchase.create({
      data: { companyId: ctx.companyId, code, supplierId: s.id, supplierName: s.name, orderedOn: p.orderedOn, reference: p.reference, currency: p.currency, pricesIncludeTax: p.pricesIncludeTax, notes: p.notes, total, createdById: ctx.userId },
    });
    await tx.purchaseLine.createMany({ data: lines.map((l) => ({ ...l, companyId: ctx.companyId, purchaseId: purchase.id })) });
    await audit(tx, ctx, { action: "purchase.create", module: "purchases", entityType: "purchase", entityId: purchase.id, summary: `${code} · ${s.name} · ${lines.length} línea(s) · ${total} ${p.currency}` });
    return purchase;
  });
}

export async function updateDraft(ctx: Ctx, id: string, raw: unknown, version: number) {
  mod(ctx);
  need(ctx, "purchases.manage");
  const p = purchaseSchema.parse(raw);
  await db.$transaction(async (tx) => {
    const cur = await tx.purchase.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!cur) throw notFound("La compra");
    if (cur.status !== "DRAFT") throw invalid("Solo se editan compras en borrador.");
    const s = await activeSupplier(tx, ctx, p.supplierId);
    const { lines, total } = await buildLines(tx, ctx, p.lines);
    const n = await tx.purchase.updateMany({
      where: { id, companyId: ctx.companyId, version, status: "DRAFT" },
      data: { supplierId: s.id, supplierName: s.name, orderedOn: p.orderedOn, reference: p.reference, currency: p.currency, pricesIncludeTax: p.pricesIncludeTax, notes: p.notes, total, version: { increment: 1 } },
    });
    if (!n.count) throw conflict();
    await tx.purchaseLine.deleteMany({ where: { purchaseId: id } });
    await tx.purchaseLine.createMany({ data: lines.map((l) => ({ ...l, companyId: ctx.companyId, purchaseId: id })) });
    await audit(tx, ctx, { action: "purchase.update", module: "purchases", entityType: "purchase", entityId: id, summary: `${lines.length} línea(s) · ${total} ${p.currency}` });
  });
}

async function lockPurchase(tx: Tx, ctx: Ctx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM purchase WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`;
  if (!rows.length) throw notFound("La compra");
  return tx.purchase.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
}

export async function confirmPurchase(ctx: Ctx, id: string) {
  mod(ctx);
  need(ctx, "purchases.manage");
  await db.$transaction(async (tx) => {
    const p = await lockPurchase(tx, ctx, id);
    if (p.status !== "DRAFT") throw conflict("La compra ya fue confirmada o cancelada.");
    const s = await activeSupplier(tx, ctx, p.supplierId);
    await tx.purchase.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date(), supplierName: s.name, version: { increment: 1 } } });
    await audit(tx, ctx, { action: "purchase.confirm", module: "purchases", entityType: "purchase", entityId: id, changes: { status: ["DRAFT", "CONFIRMED"] } });
  });
}

/** Cancelar solo sin recepciones vigentes: una compra recibida se corrige revirtiendo recepciones, nunca borrando movimientos. */
export async function cancelPurchase(ctx: Ctx, id: string) {
  mod(ctx);
  need(ctx, "purchases.manage");
  await db.$transaction(async (tx) => {
    const p = await lockPurchase(tx, ctx, id);
    if (!["DRAFT", "CONFIRMED"].includes(p.status)) throw invalid("Tiene recepciones registradas: revierte primero las recepciones.");
    await tx.purchase.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } } });
    await audit(tx, ctx, { action: "purchase.cancel", module: "purchases", entityType: "purchase", entityId: id, changes: { status: [p.status, "CANCELLED"] } });
  });
}

const receiptSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(80),
  receivedOn: z.string().optional().transform((v) => v || undefined),
  notes: opt(1000),
  lines: z
    .array(z.object({ lineId: z.string(), quantity: z.string().trim().optional().transform((v) => v || "0").pipe(qtySchema()), serials: z.array(z.string().trim().max(120)).default([]) }))
    .max(100),
});

const statusFor = (lines: { quantity: Decimal; receivedQty: Decimal }[]) =>
  lines.every((l) => new Decimal(l.receivedQty).gte(l.quantity)) ? "RECEIVED" : lines.some((l) => new Decimal(l.receivedQty).gt(0)) ? "PARTIAL" : "CONFIRMED";

/**
 * Recepción: solo ella aumenta existencias o crea activos. Admite cantidades parciales, no excede lo pendiente
 * y es idempotente por clave (un reintento devuelve la misma recepción sin duplicar stock ni activos).
 * Los activos recibidos se crean con código reservado; la serie puede capturarse ahora o completarse después.
 */
export async function receivePurchase(ctx: Ctx, id: string, raw: unknown) {
  mod(ctx);
  need(ctx, "purchases.receive");
  const r = receiptSchema.parse(raw);
  const prior = await db.receipt.findUnique({ where: { companyId_idempotencyKey: { companyId: ctx.companyId, idempotencyKey: r.idempotencyKey } } });
  if (prior) return { receipt: prior, duplicate: true };
  const wanted = r.lines.filter((l) => l.quantity.gt(0));
  if (!wanted.length) throw invalid("Indica al menos una cantidad recibida.");
  try {
    const receipt = await db.$transaction(async (tx) => {
      const p = await lockPurchase(tx, ctx, id);
      if (!["CONFIRMED", "PARTIAL"].includes(p.status)) throw invalid("Solo se reciben compras confirmadas con pendientes.");
      const receivedOn = civilDate(r.receivedOn ?? todayIn(ctx.company.timezone));
      const number = (await tx.receipt.count({ where: { purchaseId: id } })) + 1;
      const rec = await tx.receipt.create({ data: { companyId: ctx.companyId, purchaseId: id, number, idempotencyKey: r.idempotencyKey, receivedOn, notes: r.notes, actorId: ctx.userId } });
      const byId = new Map(p.lines.map((l) => [l.id, l]));
      const summary: string[] = [];
      for (const w of wanted) {
        const line = byId.get(w.lineId);
        if (!line) throw invalid("Una línea no pertenece a esta compra.");
        const pending = new Decimal(line.quantity).sub(line.receivedQty);
        if (w.quantity.gt(pending)) throw invalid(`Línea ${line.lineNo}: solo quedan ${pending} ${line.unit} pendientes.`);
        const rl = await tx.receiptLine.create({ data: { companyId: ctx.companyId, receiptId: rec.id, lineId: line.id, quantity: w.quantity } });
        if (line.kind === "STOCK") {
          const mv = await applyMovement(tx, ctx, { itemId: line.itemId!, type: "RECEIPT", delta: w.quantity, reason: `Recepción ${p.code}-${number}`, receiptLineId: rl.id });
          await tx.receiptLine.update({ where: { id: rl.id }, data: { movementId: mv.id } });
        } else if (line.kind === "ASSET") {
          if (!w.quantity.isInteger()) throw invalid(`Línea ${line.lineNo}: los activos se reciben en unidades enteras.`);
          for (let k = 0; k < w.quantity.toNumber(); k++) {
            const code = await nextCode(tx, ctx.companyId, "asset", "ACT");
            const asset = await tx.asset.create({
              data: {
                companyId: ctx.companyId, code, name: line.description, categoryId: line.categoryId!, serial: w.serials[k] || null,
                acquiredOn: receivedOn, costAmount: new Decimal(line.unitPrice).toDecimalPlaces(2), costCurrency: p.currency, supplierId: p.supplierId, receiptLineId: rl.id,
              },
            });
            await tx.assetEvent.create({ data: { companyId: ctx.companyId, assetId: asset.id, type: "CREATED", toStatus: "ACTIVE", notes: `Recibido en ${p.code}`, actorId: ctx.userId } });
          }
        }
        await tx.purchaseLine.update({ where: { id: line.id }, data: { receivedQty: { increment: w.quantity } } });
        // Precio histórico de una operación real (primera recepción de la línea).
        const existing = await tx.priceRecord.findUnique({ where: { purchaseLineId: line.id } });
        if (!existing) {
          await tx.priceRecord.create({
            data: { companyId: ctx.companyId, supplierId: p.supplierId, itemId: line.itemId, purchaseLineId: line.id, description: line.description, unit: line.unit, currency: p.currency, pricesIncludeTax: p.pricesIncludeTax, unitPrice: line.unitPrice, observedOn: receivedOn },
          });
        } else if (existing.voidedAt) await tx.priceRecord.update({ where: { id: existing.id }, data: { voidedAt: null } });
        summary.push(`L${line.lineNo}: ${w.quantity} ${line.unit}`);
      }
      const lines = await tx.purchaseLine.findMany({ where: { purchaseId: id } });
      const status = statusFor(lines);
      await tx.purchase.update({ where: { id }, data: { status, version: { increment: 1 } } });
      await audit(tx, ctx, { action: "purchase.receive", module: "purchases", entityType: "purchase", entityId: id, summary: `Recepción ${number}: ${summary.join(", ")}`, changes: { status: [p.status, status] } });
      return rec;
    });
    return { receipt, duplicate: false };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const again = await db.receipt.findUnique({ where: { companyId_idempotencyKey: { companyId: ctx.companyId, idempotencyKey: r.idempotencyKey } } });
      if (again) return { receipt: again, duplicate: true };
    }
    throw e;
  }
}

/**
 * Reversión de recepción con validación de efectos posteriores: se bloquea si las existencias ya se consumieron
 * o si algún activo recibido tiene historia propia (mantenimientos, lecturas, cambios de estado).
 * Se registran movimientos compensatorios y se conserva toda la trazabilidad.
 */
export async function reverseReceipt(ctx: Ctx, receiptId: string, reason: string) {
  mod(ctx);
  need(ctx, "purchases.receive");
  const why = z.string().trim().min(3, "Indica el motivo").max(300).parse(reason);
  await db.$transaction(async (tx) => {
    const rec = await tx.receipt.findFirst({ where: { id: receiptId, companyId: ctx.companyId }, include: { lines: { include: { line: true } } } });
    if (!rec) throw notFound("La recepción");
    const p = await lockPurchase(tx, ctx, rec.purchaseId);
    const fresh = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    if (fresh.reversedAt) throw conflict("La recepción ya fue revertida.");
    for (const rl of rec.lines) {
      if (rl.line.kind === "STOCK") {
        await applyMovement(tx, ctx, { itemId: rl.line.itemId!, type: "RECEIPT_REVERSAL", delta: new Decimal(rl.quantity).neg(), reason: `Reversión ${p.code}-${rec.number}: ${why}`, receiptLineId: rl.id }).catch((e) => {
          throw invalid(`No se puede revertir: las existencias de “${rl.line.description}” ya se usaron. ${(e as Error).message}`);
        });
      } else if (rl.line.kind === "ASSET") {
        const assets = await tx.asset.findMany({ where: { companyId: ctx.companyId, receiptLineId: rl.id }, include: { _count: { select: { events: true, readings: true, maintenances: true, plans: true } } } });
        const used = assets.filter((a) => a.status !== "ACTIVE" || a._count.events > 1 || a._count.readings > 0 || a._count.maintenances > 0 || a._count.plans > 0);
        if (used.length) throw invalid(`No se puede revertir: los activos ${used.map((a) => a.code).join(", ")} ya tienen historial propio. Gestiona su baja desde el activo.`);
        for (const a of assets) {
          await tx.asset.update({ where: { id: a.id }, data: { status: "DISPOSED", version: { increment: 1 } } });
          await tx.assetEvent.create({ data: { companyId: ctx.companyId, assetId: a.id, type: "RECEIPT_REVERSAL", fromStatus: "ACTIVE", toStatus: "DISPOSED", notes: `Recepción ${p.code}-${rec.number} revertida: ${why}`, actorId: ctx.userId } });
        }
      }
      const updated = await tx.purchaseLine.update({ where: { id: rl.lineId }, data: { receivedQty: { decrement: rl.quantity } } });
      if (new Decimal(updated.receivedQty).lte(0)) await tx.priceRecord.updateMany({ where: { purchaseLineId: rl.lineId }, data: { voidedAt: new Date() } });
    }
    await tx.receipt.update({ where: { id: receiptId }, data: { reversedAt: new Date(), reversedById: ctx.userId, reversalReason: why } });
    const lines = await tx.purchaseLine.findMany({ where: { purchaseId: p.id } });
    const status = statusFor(lines);
    await tx.purchase.update({ where: { id: p.id }, data: { status, version: { increment: 1 } } });
    await audit(tx, ctx, { action: "purchase.receipt.reverse", module: "purchases", entityType: "purchase", entityId: p.id, summary: `Recepción ${rec.number} revertida: ${why}`, changes: { status: [p.status, status] } });
  });
}

export async function listPurchases(ctx: Ctx, f: { status?: string; supplierId?: string; q?: string; page?: number }) {
  mod(ctx);
  need(ctx, "purchases.read");
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.PurchaseWhereInput = {
    companyId: ctx.companyId,
    ...(f.status ? { status: f.status as never } : {}),
    ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    ...(f.q ? { OR: [{ code: { contains: f.q, mode: "insensitive" } }, { reference: { contains: f.q, mode: "insensitive" } }, { supplierName: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const costs = can(ctx, "costs.read");
  const [rows, total] = await Promise.all([
    db.purchase.findMany({ where, ...pageArgs(page), orderBy: { createdAt: "desc" }, select: { id: true, code: true, supplierName: true, orderedOn: true, status: true, total: true, currency: true, reference: true } }),
    db.purchase.count({ where }),
  ]);
  return { rows: rows.map((r) => ({ ...r, total: costs ? r.total : null })), total, page, pageSize: PAGE_SIZE };
}

export async function getPurchase(ctx: Ctx, id: string) {
  mod(ctx);
  need(ctx, "purchases.read");
  const p = await db.purchase.findFirst({
    where: { id, companyId: ctx.companyId },
    include: {
      lines: { orderBy: { lineNo: "asc" }, include: { item: { select: { code: true, name: true } }, category: { select: { name: true } } } },
      receipts: { orderBy: { number: "asc" }, include: { lines: true } },
      supplier: { select: { id: true, name: true, archivedAt: true } },
    },
  });
  if (!p) throw notFound("La compra");
  const costs = can(ctx, "costs.read");
  const assets = await db.asset.findMany({ where: { companyId: ctx.companyId, receiptLineId: { in: p.receipts.flatMap((r) => r.lines.map((l) => l.id)) } }, select: { id: true, code: true, serial: true, status: true, receiptLineId: true } });
  return {
    purchase: { ...p, total: costs ? p.total : null, lines: p.lines.map((l) => ({ ...l, unitPrice: costs ? l.unitPrice : null, amount: costs ? l.amount : null })) },
    costsVisible: costs,
    assets,
  };
}
