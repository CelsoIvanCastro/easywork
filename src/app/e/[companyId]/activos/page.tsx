import Link from "next/link";
import { allowOr404, getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { listAssets, listCategories } from "@/server/services/inventory";
import { ASSET_STATUS } from "@/lib/catalogs";
import { Badge, Empty, fmtQty, Pager } from "@/components/ui";

type SP = { q?: string; status?: string; cat?: string; page?: string };

export default async function Activos({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<SP> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(can(ctx, "inventory.read"));
  const [list, cats] = await Promise.all([
    load(listAssets(ctx, { q: sp.q, status: sp.status, categoryId: sp.cat, page: Number(sp.page ?? 1) })),
    load(listCategories(ctx, { tracking: "ASSET" })),
  ]);
  const qs = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;
  return (
    <>
      <div className="spread">
        <h1>Activos</h1>
        {can(ctx, "inventory.manage") && <Link className="btn" href={`/e/${companyId}/activos/nuevo`}>Nuevo activo</Link>}
      </div>
      <form className="card fields" role="search">
        <label>Buscar<input name="q" defaultValue={sp.q} placeholder="Nombre, código o número de serie" /></label>
        <label>Estado<select name="status" defaultValue={sp.status ?? ""}><option value="">Todos</option>{Object.entries(ASSET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Categoría<select name="cat" defaultValue={sp.cat ?? ""}><option value="">Todas</option>{cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <div className="row"><button>Filtrar</button></div>
      </form>
      {list.rows.length === 0 ? <Empty>Sin activos.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Activo</th><th>Serie</th><th>Categoría</th><th>Estado</th><th>Uso</th><th>Ubicación</th></tr></thead>
            <tbody>
              {list.rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.code}</td>
                  <td><Link href={`/e/${companyId}/activos/${a.id}`}>{a.name}</Link></td>
                  <td>{a.serial ?? "—"}</td>
                  <td>{a.category.name}</td>
                  <td><Badge tone={a.status === "ACTIVE" ? "ok" : a.status === "SOLD" || a.status === "DISPOSED" ? undefined : "warn"}>{ASSET_STATUS[a.status]}</Badge></td>
                  <td>{a.usageKind === "NONE" ? "—" : a.currentReading ? `${fmtQty(a.currentReading)} ${a.usageKind === "KM" ? "km" : "h"}` : "Sin lectura"}</td>
                  <td>{a.location ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} total={list.total} pageSize={list.pageSize} href={qs} />
    </>
  );
}
