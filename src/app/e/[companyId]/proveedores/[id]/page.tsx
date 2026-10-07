import Link from "next/link";
import { getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { getSupplier } from "@/server/services/suppliers";
import { ACCEPT } from "@/server/files";
import { PURCHASE_STATUS } from "@/lib/catalogs";
import { ActionForm, Field } from "@/components/ActionForm";
import { SupplierFields } from "@/components/SupplierFields";
import { Badge, Empty, fmtCivil, fmtMoney } from "@/components/ui";
import * as A from "../actions";

export default async function Proveedor({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  const ctx = await getCtx(companyId);
  const { supplier: s, purchases, prices, documents } = await load(getSupplier(ctx, id));
  const manage = can(ctx, "suppliers.manage");
  const h = <><input type="hidden" name="c" value={companyId} /><input type="hidden" name="id" value={id} /></>;
  return (
    <>
      <p><Link href={`/e/${companyId}/proveedores`}>← Proveedores</Link></p>
      <div className="spread"><h1>{s.name} <span className="small muted">{s.code}</span></h1>{s.archivedAt && <Badge>Archivado</Badge>}</div>
      <dl className="kv card">
        <dt>Razón social</dt><dd>{s.legalName ?? "—"}</dd><dt>RFC</dt><dd>{s.rfc ?? "—"}</dd>
        <dt>Contacto</dt><dd>{[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</dd>
        <dt>Productos/servicios</dt><dd>{s.categories ?? "—"}</dd><dt>Domicilio</dt><dd>{s.address ?? "—"}</dd>
        <dt>Notas</dt><dd style={{ whiteSpace: "pre-wrap" }}>{s.notes ?? "—"}</dd>
      </dl>
      {ctx.modules.has("purchases") && can(ctx, "purchases.read") && (
        <section className="card">
          <h2>Compras</h2>
          {purchases.length ? <ul>{purchases.map((p) => <li key={p.id}><Link href={`/e/${companyId}/compras/${p.id}`}>{p.code}</Link> · {fmtCivil(p.orderedOn)} · {PURCHASE_STATUS[p.status]}{p.total && ` · ${fmtMoney(p.total, p.currency)}`}</li>)}</ul> : <Empty>Sin compras.</Empty>}
        </section>
      )}
      {prices.length > 0 && (
        <section className="card">
          <h2>Precios observados</h2>
          <ul>{prices.map((p) => <li key={p.id}>{fmtCivil(p.observedOn)} · {p.description}: {fmtMoney(p.unitPrice, p.currency)} / {p.unit}{p.pricesIncludeTax ? " (con impuestos)" : ""}</li>)}</ul>
        </section>
      )}
      <section className="card">
        <h2>Documentos</h2>
        {documents.length ? <ul>{documents.map((d) => <li key={d.id}><Link href={`/e/${companyId}/documentos/${d.id}`}>{d.title}</Link></li>)}</ul> : <Empty>Sin documentos.</Empty>}
        {manage && (
          <ActionForm action={A.docAction} submit="Subir" reset>
            {h}
            <div className="fields"><Field label="Título" name="title" required /><Field label="Archivo" name="file" type="file" accept={ACCEPT} required /></div>
          </ActionForm>
        )}
      </section>
      {manage && (
        <section className="card">
          <h2>Editar</h2>
          <ActionForm action={A.updateAction}>{h}<input type="hidden" name="version" value={s.version} /><SupplierFields s={s} /></ActionForm>
          <ActionForm action={A.archiveAction} submit={s.archivedAt ? "Reactivar" : "Archivar"} className="" confirm={s.archivedAt ? undefined : "Archivar proveedor conservará sus compras y precios, pero no admitirá compras nuevas."}>
            {h}<input type="hidden" name="archived" value={s.archivedAt ? "0" : "1"} />
          </ActionForm>
        </section>
      )}
    </>
  );
}
