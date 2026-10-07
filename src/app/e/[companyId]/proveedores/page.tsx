import Link from "next/link";
import { allowOr404, getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { listSuppliers } from "@/server/services/suppliers";
import { ActionForm } from "@/components/ActionForm";
import { SupplierFields } from "@/components/SupplierFields";
import { Empty, Pager } from "@/components/ui";
import { createAction } from "./actions";

export default async function Proveedores({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ q?: string; archived?: string; page?: string }> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(ctx.modules.has("suppliers") && can(ctx, "suppliers.read"));
  const list = await load(listSuppliers(ctx, { q: sp.q, archived: sp.archived === "1", page: Number(sp.page ?? 1) }));
  return (
    <>
      <h1>Proveedores</h1>
      <form className="card fields" role="search">
        <label>Buscar<input name="q" defaultValue={sp.q} placeholder="Nombre, código, RFC o productos" /></label>
        <label className="inline"><input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} /> Archivados</label>
        <div className="row"><button>Filtrar</button></div>
      </form>
      {list.rows.length === 0 ? <Empty>Sin proveedores.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Nombre</th><th>Contacto</th><th>Productos/servicios</th></tr></thead>
            <tbody>{list.rows.map((s) => <tr key={s.id}><td>{s.code}</td><td><Link href={`/e/${companyId}/proveedores/${s.id}`}>{s.name}</Link></td><td>{[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</td><td>{s.categories ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} total={list.total} pageSize={list.pageSize} href={(p) => `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.archived ? { archived: "1" } : {}), page: String(p) })}`} />
      {can(ctx, "suppliers.manage") && (
        <section className="card">
          <h2>Nuevo proveedor</h2>
          <ActionForm action={createAction} submit="Crear proveedor"><input type="hidden" name="c" value={companyId} /><SupplierFields /></ActionForm>
        </section>
      )}
    </>
  );
}
