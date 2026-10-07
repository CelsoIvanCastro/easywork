import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ASSET_STATUS, MOVEMENT_TYPES, PURCHASE_STATUS } from "@shared/catalogs";
import { idemKey, rpc } from "../api";
import { href } from "../router";
import { Async, Badge, Empty, Form, PageHead, fmtDate, fmtDateTime, fmtMoney, fmtQty, useData } from "../ui";
import { useCompany } from "./company";

function List<T>({ rows, render, empty }: { rows: T[]; render: (r: T) => React.ReactNode; empty: string }) {
  return rows.length ? <ol className="agenda">{rows.map(render)}</ol> : <Empty title={empty} />;
}

type Item = { id: string; code: string; name: string; unit: string; quantity: string; minQuantity: string | null; category: { name: string } };
export function Inventory({ base }: { base: string }) {
  const { c } = useCompany();
  const [low, setLow] = useState(false);
  const q = useData(() => rpc<{ rows: Item[] }>("inventory.items", { low }, c.id), [c.id, low]);
  return (
    <>
      <PageHead title="Inventario" description="Existencias por cantidad. El saldo cambia solo con movimientos registrados." actions={<label className="inline"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Solo stock bajo</label>} />
      <Async q={q}>
        {(d) => <List rows={d.rows} empty="Sin artículos" render={(i) => (
          <li key={i.id}><a href={href(`${base}/inventario/${i.id}`)}><span className="folio" translate="no">{i.code}</span><span className="what"><span>{i.name}</span><small>{fmtQty(i.quantity)} {i.unit} · {i.category.name}</small></span>{i.minQuantity && Number(i.quantity) <= Number(i.minQuantity) ? <Badge tone="warn">Stock bajo</Badge> : <ChevronRight className="icon go" aria-hidden="true" />}</a></li>
        )} />}
      </Async>
    </>
  );
}

type ItemFull = { item: Item & { location: string | null }; movements: { id: string; type: keyof typeof MOVEMENT_TYPES; quantity: string; balanceAfter: string; reason: string | null; createdAt: string; actor: string }[]; prices: { last: { supplier: string; unitPrice: string; currency: string; unit: string } | null } | null };
export function ItemView({ id, base }: { id: string; base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<ItemFull>("inventory.item", { id }, c.id), [c.id, id]);
  // Una clave por intento de formulario: si la red falla y se reenvía, el servidor devuelve el mismo movimiento.
  const key = useMemo(idemKey, [q.data]);
  return (
    <Async q={q}>
      {(d) => (
        <>
          <PageHead back={{ to: `${base}/inventario`, label: "Inventario" }} title={d.item.name} folio={d.item.code} description={`Disponible: ${fmtQty(d.item.quantity)} ${d.item.unit}`} />
          {c.can["inventory.move"] && (
            <section className="card">
              <h2>Registrar movimiento</h2>
              <Form submit="Registrar" onSubmit={async (f) => {
                const r = await rpc<{ duplicate: boolean }>("inventory.move", { id, data: { ...Object.fromEntries(f), idempotencyKey: key } }, c.id);
                q.reload();
                return r.duplicate ? "Ya estaba registrado (no se duplicó)." : "Movimiento registrado.";
              }}>
                <label>Tipo<select name="type"><option value="OUT">Salida</option><option value="IN">Entrada</option><option value="ADJUST">Ajuste</option></select></label>
                <label>Cantidad ({d.item.unit})<input name="quantity" inputMode="decimal" required /></label>
                <label>Sentido (solo ajustes)<select name="direction"><option value="+">Aumenta</option><option value="-">Disminuye</option></select></label>
                <label>Motivo<input name="reason" maxLength={300} /></label>
              </Form>
            </section>
          )}
          {d.prices?.last && <p className="card">Último precio: <strong>{fmtMoney(d.prices.last.unitPrice, d.prices.last.currency)}</strong> por {d.prices.last.unit} · {d.prices.last.supplier}</p>}
          <section className="card">
            <h2>Movimientos</h2>
            <ul>{d.movements.map((m) => <li key={m.id}>{fmtDateTime(m.createdAt, c.timezone)} · {MOVEMENT_TYPES[m.type]} {Number(m.quantity) > 0 ? "+" : ""}{fmtQty(m.quantity)} → {fmtQty(m.balanceAfter)} · {m.actor}{m.reason ? ` · ${m.reason}` : ""}</li>)}</ul>
          </section>
        </>
      )}
    </Async>
  );
}

type Asset = { id: string; code: string; name: string; serial: string | null; status: keyof typeof ASSET_STATUS; usageKind: string; currentReading: string | null; category: { name: string } };
export function Assets({ base }: { base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<{ rows: Asset[] }>("assets.list", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Activos" description="Unidades individuales con su historial de vida." />
      <Async q={q}>
        {(d) => <List rows={d.rows} empty="Sin activos" render={(a) => (
          <li key={a.id}><a href={href(`${base}/activos/${a.id}`)}><span className="folio" translate="no">{a.code}</span><span className="what"><span>{a.name}</span><small>{[a.serial, a.category.name].filter(Boolean).join(" · ")}</small></span><Badge tone={a.status === "ACTIVE" ? "ok" : a.status === "SOLD" || a.status === "DISPOSED" ? undefined : "warn"}>{ASSET_STATUS[a.status]}</Badge></a></li>
        )} />}
      </Async>
    </>
  );
}

type AssetFull = { asset: Asset & { readingAt: string | null; costAmount: string | null; costCurrency: string | null }; costsVisible: boolean; events: { id: string; type: string; notes: string | null; createdAt: string }[]; plans: { id: string; name: string; nextDueOn: string | null; nextDueReading: string | null; active: boolean }[] };
export function AssetView({ id, base }: { id: string; base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<AssetFull>("assets.get", { id }, c.id), [c.id, id]);
  return (
    <Async q={q}>
      {(d) => {
        const unit = d.asset.usageKind === "KM" ? "km" : "h";
        return (
          <>
            <PageHead back={{ to: `${base}/activos`, label: "Activos" }} title={d.asset.name} folio={d.asset.code} status={<Badge>{ASSET_STATUS[d.asset.status]}</Badge>} description={d.asset.serial ?? undefined} />
            {d.asset.usageKind !== "NONE" && (
              <section className="card">
                <h2>Lectura de uso</h2>
                <p>{d.asset.currentReading ? `${fmtQty(d.asset.currentReading)} ${unit} (${fmtDateTime(d.asset.readingAt, c.timezone)})` : <Badge tone="warn">Sin lectura registrada</Badge>}</p>
                {c.can["maintenance.manage"] && c.modules.maintenance && (
                  <Form submit="Registrar lectura" onSubmit={async (f) => { await rpc("maintenance.reading", { assetId: id, data: Object.fromEntries(f) }, c.id); q.reload(); return "Lectura registrada."; }}>
                    <label>Lectura del medidor ({unit})<input name="value" inputMode="decimal" required /></label>
                  </Form>
                )}
              </section>
            )}
            {d.plans.length > 0 && <section className="card"><h2>Planes</h2><ul>{d.plans.map((p) => <li key={p.id}>{p.name}: siguiente {p.nextDueOn ? fmtDate(p.nextDueOn) : ""}{p.nextDueReading ? ` / ${fmtQty(p.nextDueReading)} ${unit}` : ""}{!p.active && " (inactivo)"}</li>)}</ul></section>}
            <section className="card"><h2>Historial</h2><ul>{d.events.map((e) => <li key={e.id}>{fmtDateTime(e.createdAt, c.timezone)} · {e.type}{e.notes ? ` — ${e.notes}` : ""}</li>)}</ul></section>
          </>
        );
      }}
    </Async>
  );
}

type Plan = { plan: { id: string; name: string; nextDueOn: string | null; asset: { id: string; code: string; name: string } }; eval: { state: "overdue" | "soon" | "unknown" | "ok"; reasons: string[] } };
const ST = { overdue: ["Vencido", "bad"], soon: ["Próximo", "warn"], unknown: ["Sin confirmar", "warn"], ok: ["Al corriente", "ok"] } as const;
export function Maintenance({ base }: { base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<Plan[]>("maintenance.board", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Mantenimiento" description="Vence al cumplirse cualquiera de sus umbrales; sin lectura reciente aparece como «sin confirmar»." />
      <Async q={q}>
        {(rows) => <List rows={rows} empty="Sin planes activos" render={(r) => (
          <li key={r.plan.id}><a href={href(`${base}/activos/${r.plan.asset.id}`)}><Badge tone={ST[r.eval.state][1]}>{ST[r.eval.state][0]}</Badge><span className="what"><span>{r.plan.asset.code} {r.plan.asset.name} · {r.plan.name}</span><small>{r.eval.reasons.join("; ") || (r.plan.nextDueOn ? `Siguiente ${fmtDate(r.plan.nextDueOn)}` : "")}</small></span><ChevronRight className="icon go" aria-hidden="true" /></a></li>
        )} />}
      </Async>
    </>
  );
}

type Purchase = { id: string; code: string; supplierName: string; orderedOn: string; status: keyof typeof PURCHASE_STATUS; total: string | null; currency: string };
export function Purchases({ base }: { base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<{ rows: Purchase[] }>("purchases.list", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Compras" />
      <Async q={q}>
        {(d) => <List rows={d.rows} empty="Sin compras" render={(p) => (
          <li key={p.id}><a href={href(`${base}/compras/${p.id}`)}><span className="folio" translate="no">{p.code}</span><span className="what"><span>{p.supplierName}</span><small>{fmtDate(p.orderedOn)}{p.total ? ` · ${fmtMoney(p.total, p.currency)}` : ""}</small></span><Badge>{PURCHASE_STATUS[p.status]}</Badge></a></li>
        )} />}
      </Async>
    </>
  );
}

type PurchaseFull = { purchase: Purchase & { lines: { id: string; lineNo: number; kind: string; description: string; unit: string; quantity: string; receivedQty: string; amount: string | null }[]; receipts: { id: string; number: number; receivedOn: string; reversedAt: string | null }[] }; costsVisible: boolean };
export function PurchaseView({ id, base }: { id: string; base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<PurchaseFull>("purchases.get", { id }, c.id), [c.id, id]);
  const key = useMemo(idemKey, [q.data]);
  return (
    <Async q={q}>
      {(d) => {
        const p = d.purchase;
        const pending = p.lines.filter((l) => Number(l.quantity) > Number(l.receivedQty));
        return (
          <>
            <PageHead back={{ to: `${base}/compras`, label: "Compras" }} title={p.supplierName} folio={p.code} status={<Badge>{PURCHASE_STATUS[p.status]}</Badge>} description={p.total ? `Total ${fmtMoney(p.total, p.currency)} (calculado por el servidor)` : undefined} />
            <section className="card">
              <h2>Líneas</h2>
              <ul>{p.lines.map((l) => <li key={l.id}>L{l.lineNo} {l.description}: {fmtQty(l.receivedQty)} de {fmtQty(l.quantity)} {l.unit} recibidos{l.amount ? ` · ${fmtMoney(l.amount, p.currency)}` : ""}</li>)}</ul>
            </section>
            {c.can["purchases.receive"] && ["CONFIRMED", "PARTIAL"].includes(p.status) && pending.length > 0 && (
              <section className="card">
                <h2>Registrar recepción</h2>
                <p className="small muted">Solo lo recibido suma a existencias. Si la red falla y reenvías, no se duplica.</p>
                <Form submit="Registrar recepción" onSubmit={async (f) => {
                  const r = await rpc<{ duplicate: boolean }>("purchases.receive", { id, data: { idempotencyKey: key, lines: pending.map((l) => ({ lineId: l.id, quantity: String(f.get(`q_${l.id}`) ?? ""), serials: String(f.get(`s_${l.id}`) ?? "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean) })) } }, c.id);
                  q.reload();
                  return r.duplicate ? "Esta recepción ya estaba registrada." : "Recepción registrada.";
                }}>
                  {pending.map((l) => (
                    <div key={l.id} className="fields">
                      <label>L{l.lineNo} {l.description} (pendiente {fmtQty(String(Number(l.quantity) - Number(l.receivedQty)))} {l.unit})<input name={`q_${l.id}`} inputMode="decimal" /></label>
                      {l.kind === "ASSET" && <label>Números de serie<input name={`s_${l.id}`} /></label>}
                    </div>
                  ))}
                </Form>
              </section>
            )}
            <section className="card"><h2>Recepciones</h2>{p.receipts.length ? <ul>{p.receipts.map((r) => <li key={r.id}>#{r.number} · {fmtDate(r.receivedOn)}{r.reversedAt && " · revertida"}</li>)}</ul> : <Empty>Sin recepciones.</Empty>}</section>
          </>
        );
      }}
    </Async>
  );
}

type Supplier = { id: string; code: string; name: string; contactName: string | null; phone: string | null; email: string | null; categories: string | null };
export function Suppliers() {
  const { c } = useCompany();
  const q = useData(() => rpc<{ rows: Supplier[] }>("suppliers.list", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Proveedores" />
      <Async q={q}>
        {(d) => <List rows={d.rows} empty="Sin proveedores" render={(s) => (
          <li key={s.id}><div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, padding: "12px 16px", alignItems: "center" }}><span className="folio" translate="no">{s.code}</span><span className="what"><span>{s.name}</span><small>{[s.contactName, s.phone, s.email, s.categories].filter(Boolean).join(" · ") || "—"}</small></span></div></li>
        )} />}
      </Async>
    </>
  );
}
