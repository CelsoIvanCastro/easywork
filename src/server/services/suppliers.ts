import "server-only";
import { z } from "zod";
import { db, type Prisma } from "../db";
import { audit, diff } from "../audit";
import { conflict, notFound } from "../errors";
import { type Ctx, can, need, requireModule } from "../context";
import { nextCode, pageArgs, PAGE_SIZE } from "../util";
import { isValidRfc } from "@/lib/mx";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const supplierSchema = z.object({
  name: z.string().trim().min(1, "Requerido").max(160),
  legalName: opt(200),
  rfc: opt(13).transform((v) => v?.toUpperCase() ?? null).refine((v) => !v || isValidRfc(v), "RFC con formato inválido"),
  email: z.string().trim().max(200).optional().transform((v) => v || null).pipe(z.email("Correo inválido").nullable()),
  phone: opt(30),
  contactName: opt(120),
  address: opt(300),
  categories: opt(300),
  notes: opt(2000),
});

const mod = (ctx: Ctx) => requireModule(ctx, "suppliers");

export async function listSuppliers(ctx: Ctx, f: { q?: string; archived?: boolean; page?: number }) {
  mod(ctx);
  need(ctx, "suppliers.read");
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.SupplierWhereInput = {
    companyId: ctx.companyId,
    archivedAt: f.archived ? { not: null } : null,
    ...(f.q
      ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { categories: { contains: f.q, mode: "insensitive" } }, { rfc: { contains: f.q, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([db.supplier.findMany({ where, ...pageArgs(page), orderBy: { name: "asc" } }), db.supplier.count({ where })]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function createSupplier(ctx: Ctx, raw: Record<string, unknown>) {
  mod(ctx);
  need(ctx, "suppliers.manage");
  const s = supplierSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const code = await nextCode(tx, ctx.companyId, "supplier", "PRV");
    const sup = await tx.supplier.create({ data: { companyId: ctx.companyId, code, ...s } });
    await audit(tx, ctx, { action: "supplier.create", module: "suppliers", entityType: "supplier", entityId: sup.id, summary: `${code} ${s.name}` });
    return sup;
  });
}

export async function updateSupplier(ctx: Ctx, id: string, raw: Record<string, unknown>, version: number) {
  mod(ctx);
  need(ctx, "suppliers.manage");
  const s = supplierSchema.parse(raw);
  await db.$transaction(async (tx) => {
    const before = await tx.supplier.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!before) throw notFound("El proveedor");
    const n = await tx.supplier.updateMany({ where: { id, companyId: ctx.companyId, version }, data: { ...s, version: { increment: 1 } } });
    if (!n.count) throw conflict();
    await audit(tx, ctx, { action: "supplier.update", module: "suppliers", entityType: "supplier", entityId: id, changes: diff(before, s) });
  });
}

/** Archivar impide nuevas compras pero conserva compras, mantenimientos y precios históricos. */
export async function setSupplierArchived(ctx: Ctx, id: string, archived: boolean) {
  mod(ctx);
  need(ctx, "suppliers.manage");
  await db.$transaction(async (tx) => {
    const n = await tx.supplier.updateMany({ where: { id, companyId: ctx.companyId }, data: { archivedAt: archived ? new Date() : null } });
    if (!n.count) throw notFound("El proveedor");
    await audit(tx, ctx, { action: archived ? "supplier.archive" : "supplier.unarchive", module: "suppliers", entityType: "supplier", entityId: id });
  });
}

export async function getSupplier(ctx: Ctx, id: string) {
  mod(ctx);
  need(ctx, "suppliers.read");
  const s = await db.supplier.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!s) throw notFound("El proveedor");
  const costs = can(ctx, "costs.read");
  const [purchases, prices, docs] = await Promise.all([
    ctx.modules.has("purchases") && can(ctx, "purchases.read")
      ? db.purchase.findMany({ where: { companyId: ctx.companyId, supplierId: id }, orderBy: { orderedOn: "desc" }, take: 50, select: { id: true, code: true, orderedOn: true, status: true, total: true, currency: true } })
      : [],
    costs ? db.priceRecord.findMany({ where: { companyId: ctx.companyId, supplierId: id, voidedAt: null }, orderBy: { observedOn: "desc" }, take: 50 }) : [],
    db.document.findMany({ where: { companyId: ctx.companyId, supplierId: id, archivedAt: null }, select: { id: true, title: true, currentVersionNo: true, confidential: true } }),
  ]);
  return {
    supplier: s,
    purchases: purchases.map((p) => ({ ...p, total: costs ? p.total : null })),
    prices,
    documents: can(ctx, "documents.confidential") ? docs : docs.filter((d) => !d.confidential),
  };
}
