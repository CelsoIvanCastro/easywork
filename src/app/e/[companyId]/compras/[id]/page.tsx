import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { db, Decimal } from "@/server/db";
import { getPurchase } from "@/server/services/purchases";
import { ACCEPT } from "@/server/files";
import { PURCHASE_STATUS } from "@/lib/catalogs";
import { ActionForm, Field } from "@/components/ActionForm";
import { Badge, Empty, fmtCivil, fmtDateTime, fmtMoney, fmtQty } from "@/components/ui";
import * as A from "../actions";

const KIND = { STOCK: "Inventario", ASSET: "Activo", SERVICE: "Servicio" } as const;

export default async function Compra({ params }: { params: Promise<{ companyId: string; id: string }> }) {
  const { companyId, id } = await params;
  const ctx = await getCtx(companyId);
  const { purchase: p, costsVisible, assets } = await load(getPurchase(ctx, id));
  const tz = ctx.company.timezone;
  const h = <><input type="hidden" name="c" value={companyId} /><input type="hidden" name="id" value={id} /></>;
  const receivable = ["CONFIRMED", "PARTIAL"].includes(p.status) && can(ctx, "purchases.receive");
  const docs = await db.document.findMany({ where: { companyId, purchaseId: id, archivedAt: null }, select: { id: true, title: true } });
  return (
    <>
      <p><Link href={`/e/${companyId}/compras`}>← Compras</Link></p>
      <div className="spread"><h1>{p.code} · {p.supplierName}</h1><Badge>{PURCHASE_STATUS[p.status]}</Badge></div>
      <dl className="kv card">
        <dt>Fecha</dt><dd>{fmtCivil(p.orderedOn)}</dd><dt>Referencia</dt><dd>{p.reference ?? "—"}</dd>
        <dt>Moneda</dt><dd>{p.currency} · {p.pricesIncludeTax ? "precios con impuestos" : "precios sin impuestos"}</dd>
        {costsVisible && <><dt>Total (calculado en servidor)</dt><dd><strong>{fmtMoney(p.total, p.currency)}</strong></dd></>}
        <dt>Proveedor</dt><dd><Link href={`/e/${companyId}/proveedores/${p.supplier.id}`}>{p.supplier.name}</Link>{p.supplier.archivedAt && " (archivado)"}</dd>
      </dl>
      <section className="card">
        <h2>Líneas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Tipo</th><th>Descripción</th><th>Cantidad</th><th>Recibido</th>{costsVisible && <><th>P. unitario</th><th>Importe</th></>}</tr></thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNo}</td><td>{KIND[l.kind]}</td>
                  <td>{l.item ? <Link href={`/e/${companyId}/inventario/${l.itemId}`}>{l.item.code} {l.description}</Link> : l.description}{l.category && <span className="small muted"> · {l.category.name}</span>}</td>
                  <td>{fmtQty(l.quantity)} {l.unit}</td><td>{fmtQty(l.receivedQty)}</td>
                  {costsVisible && <><td>{fmtMoney(l.unitPrice, p.currency)}</td><td>{fmtMoney(l.amount, p.currency)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {can(ctx, "purchases.manage") && (
          <div className="row">
            {p.status === "DRAFT" && <ActionForm action={A.confirmAction} submit="Confirmar compra" className="">{h}</ActionForm>}
            {["DRAFT", "CONFIRMED"].includes(p.status) && <ActionForm action={A.cancelAction} submit="Cancelar compra" className="" confirm="¿Cancelar la compra?">{h}</ActionForm>}
          </div>
        )}
      </section>
      {receivable && (
        <section className="card">
          <h2>Registrar recepción</h2>
          <p className="small muted">Solo la recepción aumenta existencias o crea activos. Puedes recibir parcialmente; no se puede exceder lo pendiente.</p>
          <ActionForm action={A.receiveAction} submit="Registrar recepción">
            {h}<input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <Field label="Fecha de recepción" name="receivedOn" type="date" />
            {p.lines.filter((l) => new Decimal(l.quantity).gt(l.receivedQty)).map((l) => (
              <div key={l.id} className="fields">
                <input type="hidden" name="lineId" value={l.id} />
                <Field label={`L${l.lineNo} ${l.description} — pendiente ${fmtQty(new Decimal(l.quantity).sub(l.receivedQty))} ${l.unit}`} name={`qty_${l.id}`} inputMode="decimal" />
                {l.kind === "ASSET" && <Field label="Números de serie (uno por línea o separados por coma; puedes completarlos después)" name={`serials_${l.id}`} />}
              </div>
            ))}
            <Field label="Notas" name="notes" maxLength={1000} />
          </ActionForm>
        </section>
      )}
      <section className="card">
        <h2>Recepciones</h2>
        {p.receipts.length === 0 ? <Empty>Sin recepciones.</Empty> : (
          <ul>
            {p.receipts.map((r) => (
              <li key={r.id}>
                Recepción {r.number} · {fmtCivil(r.receivedOn)} · {r.lines.map((rl) => `L${p.lines.find((l) => l.id === rl.lineId)?.lineNo}: ${fmtQty(rl.quantity)}`).join(", ")}
                {assets.filter((a) => r.lines.some((rl) => rl.id === a.receiptLineId)).map((a) => <span key={a.id}> · <Link href={`/e/${companyId}/activos/${a.id}`}>{a.code}</Link>{a.serial ? ` (${a.serial})` : ""}</span>)}
                {r.reversedAt ? <Badge tone="warn">Revertida {fmtDateTime(r.reversedAt, tz)}: {r.reversalReason}</Badge> : can(ctx, "purchases.receive") && (
                  <details>
                    <summary>Revertir</summary>
                    <ActionForm action={A.reverseAction} submit="Revertir recepción" confirm="Se registrarán movimientos compensatorios. ¿Continuar?">
                      {h}<input type="hidden" name="receiptId" value={r.id} />
                      <Field label="Motivo" name="reason" required />
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>Documentos</h2>
        {docs.length ? <ul>{docs.map((d) => <li key={d.id}><Link href={`/e/${companyId}/documentos/${d.id}`}>{d.title}</Link></li>)}</ul> : <Empty>Sin documentos.</Empty>}
        {can(ctx, "purchases.manage") && (
          <ActionForm action={A.docAction} submit="Subir" reset>
            {h}<div className="fields"><Field label="Título (factura, cotización…)" name="title" required /><Field label="Archivo" name="file" type="file" accept={ACCEPT} required /></div>
          </ActionForm>
        )}
      </section>
    </>
  );
}
