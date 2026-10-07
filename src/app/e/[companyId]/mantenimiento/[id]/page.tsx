import Link from "next/link";
import { getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { getRecord } from "@/server/services/maintenance";
import { ACCEPT } from "@/server/files";
import { CURRENCIES, MAINT_STATUS } from "@/lib/catalogs";
import { ActionForm, Area, Field, Select } from "@/components/ActionForm";
import { Empty, fmtCivil, fmtMoney, fmtQty } from "@/components/ui";
import * as A from "../actions";

export default async function Registro({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  const ctx = await getCtx(companyId);
  const { record: r, costsVisible, documents } = await load(getRecord(ctx, id));
  const manage = can(ctx, "maintenance.manage");
  const open = r.status === "SCHEDULED" || r.status === "IN_PROGRESS";
  const h = <><input type="hidden" name="c" value={companyId} /><input type="hidden" name="id" value={id} /></>;
  return (
    <>
      <p><Link href={`/e/${companyId}/activos/${r.assetId}`}>← {r.asset.code} {r.asset.name}</Link></p>
      <h1>{r.code} · {r.type === "PREVENTIVE" ? "Preventivo" : "Correctivo"}</h1>
      <dl className="kv card">
        <dt>Estado</dt><dd>{MAINT_STATUS[r.status]}</dd>
        <dt>Plan</dt><dd>{r.plan?.name ?? "—"}</dd>
        <dt>Programado</dt><dd>{fmtCivil(r.scheduledOn)}</dd>
        <dt>Realizado</dt><dd>{fmtCivil(r.performedOn)}</dd>
        <dt>Lectura</dt><dd>{r.reading ? fmtQty(r.reading) : "—"}</dd>
        <dt>Taller / proveedor</dt><dd>{r.supplier?.name ?? r.workshop ?? "—"}</dd>
        {costsVisible && <><dt>Coste</dt><dd>{r.costAmount ? fmtMoney(r.costAmount, r.costCurrency ?? "MXN") : "—"}</dd></>}
        <dt>Trabajo</dt><dd style={{ whiteSpace: "pre-wrap" }}>{r.description}</dd>
        <dt>Notas</dt><dd style={{ whiteSpace: "pre-wrap" }}>{r.notes ?? "—"}</dd>
      </dl>
      {manage && open && (
        <section className="card">
          <h2>Cerrar trabajo</h2>
          <div className="row">
            {r.status === "SCHEDULED" && <ActionForm action={A.startAction} submit="Iniciar (activo en mantenimiento)" className="">{h}</ActionForm>}
            <ActionForm action={A.cancelAction} submit="Cancelar" className="" confirm="¿Cancelar este mantenimiento?">{h}</ActionForm>
          </div>
          <ActionForm action={A.completeAction} submit="Completar">
            {h}
            <div className="fields">
              <Field label="Fecha de realización" name="performedOn" type="date" required />
              {r.asset.usageKind !== "NONE" && <Field label="Lectura al servicio" name="reading" inputMode="decimal" />}
              {costsVisible && <Field label="Coste" name="costAmount" inputMode="decimal" />}
              {costsVisible && <Select label="Moneda" name="costCurrency" options={CURRENCIES.map((c) => [c, c] as [string, string])} />}
            </div>
            <Area label="Notas" name="notes" maxLength={2000} />
          </ActionForm>
        </section>
      )}
      <section className="card">
        <h2>Documentos</h2>
        {documents.length ? <ul>{documents.map((d) => <li key={d.id}><Link href={`/e/${companyId}/documentos/${d.id}`}>{d.title}</Link></li>)}</ul> : <Empty>Sin documentos.</Empty>}
        {manage && (
          <ActionForm action={A.maintDocAction} submit="Subir" reset>
            {h}
            <div className="fields">
              <Field label="Título" name="title" required />
              <Field label="Archivo" name="file" type="file" accept={ACCEPT} required />
            </div>
          </ActionForm>
        )}
      </section>
    </>
  );
}
