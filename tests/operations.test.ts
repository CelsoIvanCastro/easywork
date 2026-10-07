import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, Decimal } from "@/server/db";
import * as companies from "@/server/services/companies";
import * as inv from "@/server/services/inventory";
import * as sup from "@/server/services/suppliers";
import * as pur from "@/server/services/purchases";
import { addMember, ctxOf, expectError, makeCompany } from "./helpers";

async function setup(name = "Ops") {
  const base = await makeCompany(name);
  for (const m of ["inventory", "suppliers", "purchases", "maintenance"]) await companies.setModule(base.ctx, m, true);
  const ctx = await ctxOf(base.owner.id, base.company.id);
  const consumibles = await inv.activateSuggested(ctx, "consumibles");
  const vehiculos = await inv.activateSuggested(ctx, "vehiculos");
  const s1 = await sup.createSupplier(ctx, { name: "Ferretería Uno" });
  const s2 = await sup.createSupplier(ctx, { name: "Distribuidora Dos" });
  const item = await inv.createItem(ctx, { name: "Tornillo 1/4", categoryId: consumibles.id, unit: "pieza", initialQuantity: "10", minQuantity: "5" });
  return { ...base, ctx, consumibles, vehiculos, s1, s2, item };
}

const key = () => randomUUID();

describe("inventario", () => {
  it("dos salidas concurrentes no producen stock negativo; repetir una solicitud no duplica", async () => {
    const { ctx, item } = await setup("Inv1");
    const results = await Promise.allSettled([1, 2].map(() => inv.recordMovement(ctx, item.id, { type: "OUT", quantity: "7", idempotencyKey: key() })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await db.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.quantity.toString()).toBe("3");
    const k = key();
    const a = await inv.recordMovement(ctx, item.id, { type: "IN", quantity: "2.5", idempotencyKey: k });
    const b = await inv.recordMovement(ctx, item.id, { type: "IN", quantity: "2.5", idempotencyKey: k });
    expect(b.duplicate).toBe(true);
    expect(b.movement.id).toBe(a.movement.id);
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).quantity.toString()).toBe("5.5");
    // Saldo = suma del libro.
    const sum = (await db.stockMovement.findMany({ where: { itemId: item.id } })).reduce((s, m) => s.add(m.quantity), new Decimal(0));
    expect(sum.toString()).toBe("5.5");
  });

  it("corregir genera compensación; no se revierte dos veces; ajuste exige motivo", async () => {
    const { ctx, item } = await setup("Inv2");
    const { movement } = await inv.recordMovement(ctx, item.id, { type: "OUT", quantity: "4", idempotencyKey: key() });
    await inv.reverseMovement(ctx, movement.id, "Captura errónea");
    await expectError(inv.reverseMovement(ctx, movement.id, "otra vez"), "CONFLICT");
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).quantity.toString()).toBe("10");
    expect(await db.stockMovement.count({ where: { itemId: item.id } })).toBe(3);
    await expectError(inv.recordMovement(ctx, item.id, { type: "ADJUST", quantity: "1", idempotencyKey: key() }), "VALIDATION");
  });

  it("categoría: no cambia modelo; no se borra con referencias; un activo no usa categoría de existencias", async () => {
    const { ctx, consumibles } = await setup("Inv3");
    await expectError(inv.archiveOrDeleteCategory(ctx, consumibles.id, "delete"), "VALIDATION");
    await expectError(inv.createAsset(ctx, { name: "Camioneta", categoryId: consumibles.id }), "VALIDATION");
    await inv.archiveOrDeleteCategory(ctx, consumibles.id, "archive");
    expect((await db.item.count({ where: { categoryId: consumibles.id } }))).toBe(1);
  });

  it("vender un activo conserva su vida, detiene planes y alertas; transiciones inválidas se rechazan", async () => {
    const { ctx, vehiculos } = await setup("Inv4");
    const a = await inv.createAsset(ctx, { name: "Camioneta", categoryId: vehiculos.id, usageKind: "KM", initialReading: "1000", costAmount: "250000", costCurrency: "MXN" });
    await db.maintenancePlan.create({ data: { companyId: ctx.companyId, assetId: a.id, name: "Servicio", intervalReading: new Decimal(5000) } });
    await db.alert.create({ data: { companyId: ctx.companyId, type: "maintenance.due", dedupeKey: `asset:${a.id}:plan:x`, title: "x", link: "/", module: "maintenance", requiredPermission: "maintenance.read" } });
    await expectError(inv.changeAssetStatus(ctx, a.id, { status: "SOLD" }), "VALIDATION");
    await inv.changeAssetStatus(ctx, a.id, { status: "SOLD", soldOn: "2026-09-30", saleAmount: "180000.50", saleCurrency: "MXN" });
    const got = await inv.getAsset(ctx, a.id);
    expect(got.asset.status).toBe("SOLD");
    expect(got.asset.saleAmount?.toString()).toBe("180000.5");
    expect(got.events.length).toBe(2);
    expect(got.plans.every((p) => !p.active)).toBe(true);
    expect(await db.alert.count({ where: { companyId: ctx.companyId, status: "OPEN" } })).toBe(0);
    await expectError(inv.changeAssetStatus(ctx, a.id, { status: "ACTIVE" }), "VALIDATION");
  });

  it("costes ocultos sin permiso independiente", async () => {
    const { ctx, vehiculos } = await setup("Inv5");
    const a = await inv.createAsset(ctx, { name: "Laptop", categoryId: vehiculos.id, costAmount: "30000" });
    const m = await addMember(ctx);
    await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: m.membershipId, permission: "inventory.read", effect: "ALLOW", scope: "COMPANY" });
    const got = await inv.getAsset(await m.ctx(), a.id);
    expect(got.asset.costAmount).toBeNull();
    expect(got.costsVisible).toBe(false);
  });
});

describe("compras y recepciones", () => {
  async function purchase(ctx: Awaited<ReturnType<typeof setup>>["ctx"], supplierId: string, itemId: string, catId: string, price = "2.50") {
    const p = await pur.createPurchase(ctx, {
      supplierId, orderedOn: "2026-09-01", currency: "MXN",
      lines: [
        { kind: "STOCK", itemId, quantity: "100", unitPrice: price },
        { kind: "ASSET", categoryId: catId, description: "Camioneta reparto", quantity: "2", unitPrice: "350000" },
        { kind: "SERVICE", description: "Flete", quantity: "1", unitPrice: "1500.333" },
      ],
    });
    await pur.confirmPurchase(ctx, p.id);
    return p;
  }

  it("totales en servidor; recepción parcial idempotente; no excede lo pendiente", async () => {
    const { ctx, s1, item, vehiculos } = await setup("Pur1");
    const p = await purchase(ctx, s1.id, item.id, vehiculos.id);
    const full = await pur.getPurchase(ctx, p.id);
    // 100*2.50 + 2*350000 + 1500.33 = 701750.33
    expect(full.purchase.total?.toString()).toBe("701750.33");
    const [l1, l2] = full.purchase.lines;
    const k = key();
    const body = { idempotencyKey: k, lines: [{ lineId: l1.id, quantity: "40" }, { lineId: l2.id, quantity: "1", serials: ["VIN123"] }] };
    const r1 = await pur.receivePurchase(ctx, p.id, body);
    const r2 = await pur.receivePurchase(ctx, p.id, body);
    expect(r2.duplicate).toBe(true);
    expect(r2.receipt.id).toBe(r1.receipt.id);
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).quantity.toString()).toBe("50");
    expect(await db.asset.count({ where: { companyId: ctx.companyId, serial: "VIN123" } })).toBe(1);
    expect((await db.purchase.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PARTIAL");
    await expectError(pur.receivePurchase(ctx, p.id, { idempotencyKey: key(), lines: [{ lineId: l1.id, quantity: "61" }] }), "VALIDATION");
    // Reintentos concurrentes con la misma clave: una sola recepción.
    const k2 = key();
    const both = await Promise.all([1, 2].map(() => pur.receivePurchase(ctx, p.id, { idempotencyKey: k2, lines: [{ lineId: l1.id, quantity: "10" }] })));
    expect(both[0].receipt.id).toBe(both[1].receipt.id);
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).quantity.toString()).toBe("60");
  });

  it("reversión: conserva historia; se bloquea si el stock ya se usó o el activo tiene historia", async () => {
    const { ctx, s1, item, vehiculos } = await setup("Pur2");
    const p = await purchase(ctx, s1.id, item.id, vehiculos.id);
    const { purchase: full } = await pur.getPurchase(ctx, p.id);
    const r = await pur.receivePurchase(ctx, p.id, { idempotencyKey: key(), lines: [{ lineId: full.lines[0].id, quantity: "100" }, { lineId: full.lines[1].id, quantity: "2" }] });
    // Consumir casi todo el stock recibido (saldo inicial 10 + 100 = 110 → deja 5).
    await inv.recordMovement(ctx, item.id, { type: "OUT", quantity: "105", idempotencyKey: key() });
    await expectError(pur.reverseReceipt(ctx, r.receipt.id, "Error de captura"), "VALIDATION");
    await inv.recordMovement(ctx, item.id, { type: "IN", quantity: "100", idempotencyKey: key() });
    const asset = await db.asset.findFirstOrThrow({ where: { companyId: ctx.companyId, name: "Camioneta reparto" } });
    await inv.changeAssetStatus(ctx, asset.id, { status: "OUT_OF_SERVICE" });
    await expectError(pur.reverseReceipt(ctx, r.receipt.id, "Error de captura"), "VALIDATION");
    await inv.changeAssetStatus(ctx, asset.id, { status: "ACTIVE" });
    // Sigue bloqueada: el activo tiene eventos propios.
    await expectError(pur.reverseReceipt(ctx, r.receipt.id, "Error de captura"), "VALIDATION");
    // Una compra con recepciones no se cancela.
    await expectError(pur.cancelPurchase(ctx, p.id), "VALIDATION");
  });

  it("reversión válida devuelve stock, marca activos y actualiza estado; archivar proveedor no rompe compras", async () => {
    const { ctx, s1, item, vehiculos } = await setup("Pur3");
    const p = await purchase(ctx, s1.id, item.id, vehiculos.id);
    const { purchase: full } = await pur.getPurchase(ctx, p.id);
    const r = await pur.receivePurchase(ctx, p.id, { idempotencyKey: key(), lines: [{ lineId: full.lines[0].id, quantity: "30" }, { lineId: full.lines[1].id, quantity: "1" }] });
    await pur.reverseReceipt(ctx, r.receipt.id, "Mercancía devuelta");
    expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).quantity.toString()).toBe("10");
    expect((await db.purchase.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CONFIRMED");
    const movements = await db.stockMovement.findMany({ where: { itemId: item.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => m.type)).toEqual(["INITIAL", "RECEIPT", "RECEIPT_REVERSAL"]);
    await expectError(pur.reverseReceipt(ctx, r.receipt.id, "otra"), "CONFLICT");
    await sup.setSupplierArchived(ctx, s1.id, true);
    expect((await pur.getPurchase(ctx, p.id)).purchase.supplierName).toBe("Ferretería Uno");
    await expectError(pur.createPurchase(ctx, { supplierId: s1.id, orderedOn: "2026-09-02", currency: "MXN", lines: [{ kind: "SERVICE", description: "x", quantity: "1", unitPrice: "1" }] }), "VALIDATION");
  });

  it("precios: último precio y comparación solo entre equivalentes", async () => {
    const { ctx, s1, s2, item, vehiculos } = await setup("Pur4");
    const p1 = await purchase(ctx, s1.id, item.id, vehiculos.id, "2.50");
    const p2 = await purchase(ctx, s2.id, item.id, vehiculos.id, "2.10");
    const usd = await pur.createPurchase(ctx, { supplierId: s2.id, orderedOn: "2026-09-03", currency: "USD", lines: [{ kind: "STOCK", itemId: item.id, quantity: "10", unitPrice: "0.05" }] });
    await pur.confirmPurchase(ctx, usd.id);
    for (const p of [p1, p2, usd]) {
      const full = await pur.getPurchase(ctx, p.id);
      await pur.receivePurchase(ctx, p.id, { idempotencyKey: key(), lines: [{ lineId: full.purchase.lines[0].id, quantity: "1" }] });
    }
    const cmp = await inv.comparePrices(ctx, item.id);
    const mxn = cmp.comparable.find((g) => g.basis.includes("MXN"))!;
    expect(mxn.suppliers[0].supplier).toBe("Distribuidora Dos");
    expect(mxn.suppliers[0].unitPrice).toBe("2.1");
    expect(cmp.comparable.find((g) => g.basis.includes("USD"))!.suppliers).toHaveLength(1);
  });

  it("IDs de otra empresa fallan en compras e inventario", async () => {
    const a = await setup("PurA");
    const b = await setup("PurB");
    await expectError(pur.getPurchase(b.ctx, (await pur.createPurchase(a.ctx, { supplierId: a.s1.id, orderedOn: "2026-09-01", currency: "MXN", lines: [{ kind: "SERVICE", description: "x", quantity: "1", unitPrice: "1" }] })).id), "NOT_FOUND");
    await expectError(pur.createPurchase(b.ctx, { supplierId: a.s1.id, orderedOn: "2026-09-01", currency: "MXN", lines: [{ kind: "SERVICE", description: "x", quantity: "1", unitPrice: "1" }] }), "VALIDATION");
    await expectError(pur.createPurchase(b.ctx, { supplierId: b.s1.id, orderedOn: "2026-09-01", currency: "MXN", lines: [{ kind: "STOCK", itemId: a.item.id, quantity: "1", unitPrice: "1" }] }), "VALIDATION");
    await expectError(inv.recordMovement(b.ctx, a.item.id, { type: "OUT", quantity: "1", idempotencyKey: key() }), "NOT_FOUND");
    await expectError(inv.getItem(b.ctx, a.item.id), "NOT_FOUND");
    await expectError(sup.getSupplier(b.ctx, a.s1.id), "NOT_FOUND");
  });
});
