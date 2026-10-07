import { allowOr404, getCtx } from "@/server/web";
import { can } from "@/server/context";
import { db } from "@/server/db";
import { CURRENCIES } from "@/lib/catalogs";
import { ActionForm, Area, Field, Select } from "@/components/ActionForm";
import { createAction } from "../actions";
import { LinesEditor } from "./lines";

export default async function NuevaCompra({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  allowOr404(ctx.modules.has("purchases") && can(ctx, "purchases.manage"));
  const [suppliers, items, cats] = await Promise.all([
    db.supplier.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.item.findMany({ where: { companyId, archivedAt: null }, select: { id: true, code: true, name: true, unit: true }, orderBy: { name: "asc" }, take: 500 }),
    db.category.findMany({ where: { companyId, archivedAt: null, tracking: "ASSET" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <h1>Nueva compra</h1>
      {suppliers.length === 0 ? <p className="msg info">Registra primero un proveedor activo.</p> : (
        <ActionForm action={createAction} submit="Guardar borrador">
          <input type="hidden" name="c" value={companyId} />
          <div className="fields">
            <Select label="Proveedor" name="supplierId" options={suppliers.map((s) => [s.id, s.name] as [string, string])} />
            <Field label="Fecha" name="orderedOn" type="date" required />
            <Field label="Referencia (factura, cotización)" name="reference" maxLength={80} />
            <Select label="Moneda" name="currency" options={CURRENCIES.map((c) => [c, c] as [string, string])} />
          </div>
          <label className="inline"><input type="checkbox" name="pricesIncludeTax" /> Los precios incluyen impuestos</label>
          <LinesEditor items={items.map((i) => [i.id, `${i.code} ${i.name} (${i.unit})`])} assetCats={cats.map((c) => [c.id, c.name])} />
          <Area label="Notas" name="notes" maxLength={2000} />
          <p className="small muted">La unidad de las líneas de inventario es la del artículo. El borrador no mueve existencias: solo la recepción lo hace.</p>
        </ActionForm>
      )}
    </>
  );
}
