import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { getItem, listCategories } from "@/server/services/inventory";
import { MOVEMENT_TYPES, UNITS } from "@/lib/catalogs";
import { ActionForm, Field, Select } from "@/components/ActionForm";
import { Empty, fmtCivil, fmtDateTime, fmtMoney, fmtQty, Pager } from "@/components/ui";
import * as A from "../actions";

export default async function Articulo({ params, searchParams }: { params: Promise<{ companyId: string; id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { companyId, id } = await params;
  const { page } = await searchParams;
  const ctx = await getCtx(companyId);
  const d = await load(getItem(ctx, id, Number(page ?? 1)));
  const { item } = d;
  const tz = ctx.company.timezone;
  const h = <><input type="hidden" name="c" value={companyId} /><input type="hidden" name="id" value={id} /></>;
  const cats = can(ctx, "inventory.manage") ? await listCategories(ctx, { tracking: "STOCK" }) : [];
  return (
    <>
      <p><Link href={`/e/${companyId}/inventario`}>← Inventario</Link></p>
      <h1>{item.name} <span className="small muted">{item.code}</span></h1>
      <dl className="kv card">
        <dt>Disponible</dt><dd><strong>{fmtQty(item.quantity)} {item.unit}</strong></dd>
        <dt>Mínimo</dt><dd>{item.minQuantity ? `${fmtQty(item.minQuantity)} ${item.unit}` : "—"}</dd>
        <dt>Categoría</dt><dd>{item.category.name}</dd>
        <dt>Ubicación</dt><dd>{item.location ?? "—"}</dd>
      </dl>
      {can(ctx, "inventory.move") && !item.archivedAt && (
        <section className="card">
          <h2>Registrar movimiento</h2>
          <p className="small muted">El saldo solo cambia mediante movimientos con motivo. No se permiten saldos negativos.</p>
          <ActionForm action={A.moveAction} submit="Registrar">
            {h}<input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <div className="fields">
              <Select label="Tipo" name="type" options={[["IN", "Entrada"], ["OUT", "Salida"], ["ADJUST", "Ajuste"]]} />
              <Select label="Sentido (solo ajustes)" name="direction" options={[["+", "Aumenta"], ["-", "Disminuye"]]} />
              <Field label={`Cantidad (${item.unit})`} name="quantity" required inputMode="decimal" />
              <Field label="Motivo" name="reason" maxLength={300} />
            </div>
          </ActionForm>
        </section>
      )}
      <section className="card">
        <h2>Libro de movimientos</h2>
        {d.movements.length === 0 ? <Empty>Sin movimientos.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Saldo</th><th>Motivo</th><th>Responsable</th><th></th></tr></thead>
              <tbody>
                {d.movements.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDateTime(m.createdAt, tz)}</td>
                    <td>{MOVEMENT_TYPES[m.type]}</td>
                    <td>{m.quantity.gt(0) ? "+" : ""}{fmtQty(m.quantity)}</td>
                    <td>{fmtQty(m.balanceAfter)}</td>
                    <td>{m.reason ?? "—"}</td>
                    <td>{m.actor}</td>
                    <td>
                      {can(ctx, "inventory.move") && ["IN", "OUT", "ADJUST", "INITIAL"].includes(m.type) && (
                        <details>
                          <summary>Corregir</summary>
                          <ActionForm action={A.reverseMoveAction} submit="Compensar">
                            {h}<input type="hidden" name="movementId" value={m.id} />
                            <Field label="Motivo" name="reason" required />
                          </ActionForm>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={d.page} total={d.total} pageSize={d.pageSize} href={(p) => `?page=${p}`} />
      </section>
      {d.prices && (
        <section className="card">
          <h2>Precios</h2>
          {d.prices.last ? (
            <p>Último precio: <strong>{fmtMoney(d.prices.last.unitPrice, d.prices.last.currency)}</strong> por {d.prices.last.unit} · {d.prices.last.supplier} · {fmtCivil(d.prices.last.observedOn)} · <Link href={`/e/${companyId}/compras/${d.prices.last.purchaseId}`}>{d.prices.last.purchaseCode}</Link></p>
          ) : <Empty>Sin compras recibidas.</Empty>}
          {d.prices.comparable.map((g) => (
            <div key={g.basis}>
              <h3>Comparables: {g.basis}</h3>
              <ol>{g.suppliers.map((s) => <li key={s.supplier + s.purchaseCode}>{s.supplier}: {fmtMoney(s.unitPrice, s.currency)} ({fmtCivil(s.observedOn)}, {s.purchaseCode})</li>)}</ol>
            </div>
          ))}
          {d.prices.comparable.length > 1 && <p className="small muted">Precios en distinta unidad, moneda o base fiscal se muestran por separado: no se comparan ni se convierten.</p>}
        </section>
      )}
      {can(ctx, "inventory.manage") && (
        <section className="card">
          <h2>Editar</h2>
          <ActionForm action={A.itemUpdateAction}>
            {h}<input type="hidden" name="version" value={item.version} />
            <div className="fields">
              <Field label="Nombre" name="name" defaultValue={item.name} required />
              <Select label="Categoría" name="categoryId" options={cats.map((x) => [x.id, x.name] as [string, string])} defaultValue={item.categoryId} />
              <Select label="Unidad" name="unit" options={UNITS.map((u) => [u, u] as [string, string])} defaultValue={item.unit} />
              <Field label="Mínimo" name="minQuantity" defaultValue={item.minQuantity?.toString() ?? ""} inputMode="decimal" />
              <Field label="Ubicación" name="location" defaultValue={item.location ?? ""} />
            </div>
          </ActionForm>
          <ActionForm action={A.itemArchiveAction} submit={item.archivedAt ? "Desarchivar" : "Archivar"} className="">{h}<input type="hidden" name="archived" value={item.archivedAt ? "0" : "1"} /></ActionForm>
        </section>
      )}
    </>
  );
}
