import Link from "next/link";
import { allowOr404, getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { listPurchases } from "@/server/services/purchases";
import { PURCHASE_STATUS } from "@/lib/catalogs";
import { Badge, Empty, fmtCivil, fmtMoney, Pager } from "@/components/ui";

export default async function Compras({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(ctx.modules.has("purchases") && can(ctx, "purchases.read"));
  const list = await load(listPurchases(ctx, { q: sp.q, status: sp.status && sp.status in PURCHASE_STATUS ? sp.status : undefined, page: Number(sp.page ?? 1) }));
  return (
    <>
      <div className="spread"><h1>Compras</h1>{can(ctx, "purchases.manage") && <Link className="btn" href={`/e/${companyId}/compras/nueva`}>Nueva compra</Link>}</div>
      <form className="card fields" role="search">
        <label>Buscar<input name="q" defaultValue={sp.q} placeholder="Código, referencia o proveedor" /></label>
        <label>Estado<select name="status" defaultValue={sp.status ?? ""}><option value="">Todos</option>{Object.entries(PURCHASE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <div className="row"><button>Filtrar</button></div>
      </form>
      {list.rows.length === 0 ? <Empty>Sin compras.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Proveedor</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead>
            <tbody>{list.rows.map((p) => <tr key={p.id}><td><Link href={`/e/${companyId}/compras/${p.id}`}>{p.code}</Link></td><td>{p.supplierName}</td><td>{fmtCivil(p.orderedOn)}</td><td><Badge>{PURCHASE_STATUS[p.status]}</Badge></td><td>{p.total ? fmtMoney(p.total, p.currency) : "—"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} total={list.total} pageSize={list.pageSize} href={(n) => `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.status ? { status: sp.status } : {}), page: String(n) })}`} />
    </>
  );
}
