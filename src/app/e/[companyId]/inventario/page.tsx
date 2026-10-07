import Link from "next/link";
import { allowOr404, getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { listCategories, listItems } from "@/server/services/inventory";
import { SUGGESTED_CATEGORIES, UNITS } from "@/lib/catalogs";
import { ActionForm, Field, Select } from "@/components/ActionForm";
import { Badge, Empty, fmtQty, Pager } from "@/components/ui";
import * as A from "./actions";

type SP = { q?: string; cat?: string; low?: string; page?: string; archived?: string };

export default async function Inventario({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<SP> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(can(ctx, "inventory.read"));
  const manage = can(ctx, "inventory.manage");
  const [list, cats] = await Promise.all([
    load(listItems(ctx, { q: sp.q, categoryId: sp.cat, low: sp.low === "1", archived: sp.archived === "1", page: Number(sp.page ?? 1) })),
    load(listCategories(ctx, { includeHidden: manage })),
  ]);
  const stockCats = cats.filter((x) => x.tracking === "STOCK" && !x.hidden);
  const active = new Set(cats.map((x) => x.suggestedKey));
  const qs = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;
  const c = <input type="hidden" name="c" value={companyId} />;
  return (
    <>
      <div className="spread"><h1>Inventario (existencias)</h1><Link href={`/e/${companyId}/activos`}>Ver activos individuales →</Link></div>
      <form className="card fields" role="search">
        <label>Buscar<input name="q" defaultValue={sp.q} placeholder="Nombre o código" /></label>
        <label>Categoría<select name="cat" defaultValue={sp.cat ?? ""}><option value="">Todas</option>{stockCats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="inline"><input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} /> Solo stock bajo</label>
        <label className="inline"><input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} /> Archivados</label>
        <div className="row"><button>Filtrar</button></div>
      </form>
      {list.rows.length === 0 ? <Empty>Sin artículos.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Artículo</th><th>Categoría</th><th>Disponible</th><th>Mínimo</th><th>Ubicación</th></tr></thead>
            <tbody>
              {list.rows.map((i) => (
                <tr key={i.id}>
                  <td>{i.code}</td>
                  <td><Link href={`/e/${companyId}/inventario/${i.id}`}>{i.name}</Link></td>
                  <td>{i.category.name}</td>
                  <td>{fmtQty(i.quantity)} {i.unit} {i.minQuantity && i.quantity.lte(i.minQuantity) && <Badge tone="warn">Stock bajo</Badge>}</td>
                  <td>{i.minQuantity ? fmtQty(i.minQuantity) : "—"}</td>
                  <td>{i.location ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} total={list.total} pageSize={list.pageSize} href={qs} />
      {manage && (
        <section className="card">
          <h2>Nuevo artículo</h2>
          {stockCats.length ? (
            <ActionForm action={A.itemAction} submit="Crear artículo">
              {c}
              <div className="fields">
                <Field label="Nombre" name="name" required maxLength={160} />
                <Select label="Categoría" name="categoryId" options={stockCats.map((x) => [x.id, x.name] as [string, string])} />
                <Select label="Unidad" name="unit" options={UNITS.map((u) => [u, u] as [string, string])} />
                <Field label="Saldo inicial" name="initialQuantity" inputMode="decimal" placeholder="0" />
                <Field label="Nivel mínimo (opcional)" name="minQuantity" inputMode="decimal" />
                <Field label="Ubicación general (opcional)" name="location" maxLength={160} />
              </div>
            </ActionForm>
          ) : <p className="muted">Activa o crea primero una categoría de existencias.</p>}
        </section>
      )}
      <section className="card">
        <h2>Categorías</h2>
        <ul>
          {cats.map((x) => (
            <li key={x.id} className="row">
              {x.name} <Badge>{x.tracking === "STOCK" ? "Existencias" : "Activos"}</Badge> {x.hidden && <Badge>Oculta</Badge>}
              <span className="small muted">{x._count.items + x._count.assets} registro(s)</span>
              {manage && (
                <details>
                  <summary>Editar</summary>
                  <ActionForm action={A.categoryUpdateAction}>
                    {c}<input type="hidden" name="id" value={x.id} />
                    <Field label="Nombre" name="name" defaultValue={x.name} required />
                    <label className="inline"><input type="checkbox" name="hidden" defaultChecked={x.hidden} /> Ocultar en formularios</label>
                  </ActionForm>
                  <ActionForm action={A.categoryRemoveAction} submit="Archivar" className="">{c}<input type="hidden" name="id" value={x.id} /><input type="hidden" name="mode" value="archive" /></ActionForm>
                  <ActionForm action={A.categoryRemoveAction} submit="Borrar (solo si está vacía)" className="" confirm="¿Borrar definitivamente esta categoría vacía?">{c}<input type="hidden" name="id" value={x.id} /><input type="hidden" name="mode" value="delete" /></ActionForm>
                </details>
              )}
            </li>
          ))}
        </ul>
        {manage && (
          <>
            <h3>Categorías sugeridas</h3>
            <p className="small muted">Activa solo las que tu empresa use.</p>
            <div className="row">
              {SUGGESTED_CATEGORIES.filter((s) => !active.has(s.key)).map((s) => (
                <ActionForm key={s.key} action={A.suggestedAction} submit={`+ ${s.name}`} className="">{c}<input type="hidden" name="key" value={s.key} /></ActionForm>
              ))}
            </div>
            <h3>Categoría propia</h3>
            <ActionForm action={A.categoryAction} submit="Crear categoría" reset>
              {c}
              <div className="fields">
                <Field label="Nombre" name="name" required maxLength={80} />
                <Select label="Seguimiento" name="tracking" options={[["STOCK", "Existencias por cantidad"], ["ASSET", "Activos individuales"]]} />
                <Select label="Subcategoría de" name="parentId" options={[["", "—"], ...cats.filter((x) => !x.parentId).map((x) => [x.id, x.name] as [string, string])]} />
              </div>
              <p className="small muted">El tipo de seguimiento no se puede cambiar después.</p>
            </ActionForm>
          </>
        )}
      </section>
    </>
  );
}
