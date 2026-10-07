import Link from "next/link";
import { getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { db } from "@/server/db";
import { assetTransitions, getAsset, listCategories } from "@/server/services/inventory";
import { ACCEPT } from "@/server/files";
import { ASSET_STATUS, CURRENCIES, MAINT_STATUS } from "@/lib/catalogs";
import { ActionForm, Field, Select } from "@/components/ActionForm";
import { AssetFields } from "@/components/AssetFields";
import { Badge, Empty, fmtCivil, fmtDateTime, fmtMoney, fmtQty } from "@/components/ui";
import * as A from "../../inventario/actions";
import { ReadingForm, PlanForm, RecordForm } from "../../mantenimiento/forms";

export default async function Activo({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  const ctx = await getCtx(companyId);
  const d = await load(getAsset(ctx, id));
  const a = d.asset;
  const tz = ctx.company.timezone;
  const manage = can(ctx, "inventory.manage");
  const maint = ctx.modules.has("maintenance") && can(ctx, "maintenance.manage");
  const h = <><input type="hidden" name="c" value={companyId} /><input type="hidden" name="id" value={id} /></>;
  const [cats, suppliers, docs] = await Promise.all([
    manage ? listCategories(ctx, { tracking: "ASSET" }) : [],
    ctx.modules.has("suppliers") ? db.supplier.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true } }) : [],
    db.document.findMany({ where: { companyId, assetId: id, archivedAt: null, ...(can(ctx, "documents.confidential") ? {} : { confidential: false }) }, select: { id: true, title: true, currentVersionNo: true } }),
  ]);
  const unit = a.usageKind === "KM" ? "km" : "h";
  const terminal = a.status === "SOLD" || a.status === "DISPOSED";
  return (
    <>
      <p><Link href={`/e/${companyId}/activos`}>← Activos</Link></p>
      <div className="spread">
        <h1>{a.name} <span className="small muted">{a.code}</span></h1>
        <Badge tone={a.status === "ACTIVE" ? "ok" : terminal ? undefined : "warn"}>{ASSET_STATUS[a.status]}</Badge>
      </div>
      <dl className="kv card">
        <dt>Categoría</dt><dd>{a.category.name}</dd>
        <dt>Serie</dt><dd>{a.serial ?? "—"}</dd>
        <dt>Marca / modelo / año</dt><dd>{[a.brand, a.model, a.year].filter(Boolean).join(" · ") || "—"}</dd>
        <dt>Adquisición</dt><dd>{fmtCivil(a.acquiredOn)} {a.supplier && <>· <Link href={`/e/${companyId}/proveedores/${a.supplier.id}`}>{a.supplier.name}</Link></>}</dd>
        {d.costsVisible && <><dt>Coste</dt><dd>{a.costAmount ? fmtMoney(a.costAmount, a.costCurrency ?? "MXN") : "—"}</dd></>}
        <dt>Garantía</dt><dd>{fmtCivil(a.warrantyUntil)}</dd>
        <dt>Ubicación</dt><dd>{a.location ?? "—"}</dd>
        <dt>Responsable (informativo)</dt><dd>{a.responsibleLabel ?? "—"}</dd>
        {a.usageKind !== "NONE" && <><dt>Lectura actual</dt><dd>{a.currentReading ? `${fmtQty(a.currentReading)} ${unit} (${fmtDateTime(a.readingAt, tz)})` : <Badge tone="warn">Sin lectura registrada</Badge>}</dd></>}
        {a.status === "SOLD" && <><dt>Venta</dt><dd>{fmtCivil(a.soldOn)}{d.costsVisible && a.saleAmount ? ` · ${fmtMoney(a.saleAmount, a.saleCurrency ?? "MXN")}` : ""}</dd></>}
      </dl>
      {manage && !terminal && (
        <section className="card">
          <h2>Cambiar estado</h2>
          <ActionForm action={A.assetStatusAction} submit="Cambiar estado" confirm="Vender o dar de baja detiene su mantenimiento y no se puede deshacer. ¿Continuar?">
            {h}
            <div className="fields">
              <Select label="Nuevo estado" name="status" options={assetTransitions(a.status).map((s) => [s, ASSET_STATUS[s as keyof typeof ASSET_STATUS]] as [string, string])} />
              <Field label="Fecha de venta (si se vende)" name="soldOn" type="date" />
              {d.costsVisible && <Field label="Valor de venta" name="saleAmount" inputMode="decimal" />}
              {d.costsVisible && <Select label="Moneda" name="saleCurrency" options={CURRENCIES.map((c) => [c, c] as [string, string])} />}
              <Field label="Notas" name="notes" maxLength={1000} />
            </div>
          </ActionForm>
        </section>
      )}
      {ctx.modules.has("maintenance") && can(ctx, "maintenance.read") && (
        <section className="card">
          <h2>Mantenimiento</h2>
          {d.plans.length ? (
            <ul>
              {d.plans.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong> {!p.active && <Badge>Inactivo</Badge>} · cada {[p.intervalDays && `${p.intervalDays} días`, p.intervalReading && `${fmtQty(p.intervalReading)} ${unit}`].filter(Boolean).join(" o ")}
                  {" "}· último: {fmtCivil(p.lastServiceOn)}{p.lastServiceReading ? ` / ${fmtQty(p.lastServiceReading)} ${unit}` : ""}
                  {" "}· siguiente: {p.nextDueOn ? fmtCivil(p.nextDueOn) : "—"}{p.nextDueReading ? ` / ${fmtQty(p.nextDueReading)} ${unit}` : ""}
                </li>
              ))}
            </ul>
          ) : <Empty>Sin planes preventivos.</Empty>}
          <h3>Registros</h3>
          {d.records.length ? (
            <ul>{d.records.map((r) => <li key={r.id}><Link href={`/e/${companyId}/mantenimiento/${r.id}`}>{r.code}</Link> · {r.type === "PREVENTIVE" ? "Preventivo" : "Correctivo"} · {MAINT_STATUS[r.status]} · {fmtCivil(r.performedOn ?? r.scheduledOn)} · {r.description}</li>)}</ul>
          ) : <Empty>Sin registros.</Empty>}
          {maint && !terminal && (
            <div className="grid">
              {a.usageKind !== "NONE" && <ReadingForm companyId={companyId} assetId={id} unit={unit} />}
              <PlanForm companyId={companyId} assetId={id} usage={a.usageKind !== "NONE"} unit={unit} />
              <RecordForm companyId={companyId} assetId={id} plans={d.plans.filter((p) => p.active).map((p) => [p.id, p.name])} costs={d.costsVisible} />
            </div>
          )}
          {a.usageKind !== "NONE" && d.readings.length > 0 && (
            <details>
              <summary>Historial de lecturas</summary>
              <ul>{d.readings.map((r) => <li key={r.id}>{fmtDateTime(r.readAt, tz)}: {fmtQty(r.effectiveValue)} {unit}{r.kind !== "NORMAL" && ` (${r.kind === "CORRECTION" ? "corrección" : "cambio de medidor"}: ${r.notes ?? ""})`}</li>)}</ul>
            </details>
          )}
        </section>
      )}
      <section className="card">
        <h2>Documentos</h2>
        {docs.length ? <ul>{docs.map((x) => <li key={x.id}><Link href={`/e/${companyId}/documentos/${x.id}`}>{x.title}</Link> (v{x.currentVersionNo})</li>)}</ul> : <Empty>Sin documentos.</Empty>}
        {manage && (
          <ActionForm action={A.assetDocAction} submit="Subir" reset>
            {h}
            <div className="fields">
              <Field label="Título (factura, garantía, foto…)" name="title" required />
              <Field label="Archivo" name="file" type="file" accept={ACCEPT} required />
            </div>
          </ActionForm>
        )}
      </section>
      <section className="card">
        <h2>Historial de vida</h2>
        <ul>{d.events.map((e) => <li key={e.id}>{fmtDateTime(e.createdAt, tz)} · {e.type}{e.fromStatus && ` ${ASSET_STATUS[e.fromStatus]} →`}{e.toStatus && ` ${ASSET_STATUS[e.toStatus]}`}{e.notes && ` — ${e.notes}`}</li>)}</ul>
      </section>
      {manage && (
        <section className="card">
          <h2>Editar</h2>
          <ActionForm action={A.assetUpdateAction}>
            {h}<input type="hidden" name="version" value={a.version} />
            <AssetFields a={a} cats={cats.map((x) => [x.id, x.name])} suppliers={suppliers.map((s) => [s.id, s.name])} costs={d.costsVisible} />
          </ActionForm>
        </section>
      )}
    </>
  );
}
