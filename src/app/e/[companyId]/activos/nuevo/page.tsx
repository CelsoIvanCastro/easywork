import { allowOr404, getCtx } from "@/server/web";
import { can } from "@/server/context";
import { db } from "@/server/db";
import { listCategories } from "@/server/services/inventory";
import { ActionForm } from "@/components/ActionForm";
import { AssetFields } from "@/components/AssetFields";
import { assetAction } from "../../inventario/actions";

export default async function NuevoActivo({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  allowOr404(can(ctx, "inventory.manage"));
  const cats = await listCategories(ctx, { tracking: "ASSET" });
  const suppliers = ctx.modules.has("suppliers") ? await db.supplier.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  return (
    <>
      <h1>Nuevo activo</h1>
      {cats.length === 0 ? <p className="msg info">Activa o crea primero una categoría de activos individuales en Inventario.</p> : (
        <ActionForm action={assetAction} submit="Crear activo">
          <input type="hidden" name="c" value={companyId} />
          <AssetFields cats={cats.map((x) => [x.id, x.name])} suppliers={suppliers.map((s) => [s.id, s.name])} costs={can(ctx, "costs.read")} isNew />
        </ActionForm>
      )}
    </>
  );
}
