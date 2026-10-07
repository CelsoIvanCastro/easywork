import Link from "next/link";
import { getCtx } from "@/server/web";
import { db } from "@/server/db";
import { ALERT_TYPES, listNotifications } from "@/server/services/notifications";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Empty, fmtDateTime } from "@/components/ui";
import * as A from "./actions";

export default async function Notificaciones({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const { companyId } = await params;
  const { tipo } = await searchParams;
  const ctx = await getCtx(companyId);
  const all = await listNotifications(ctx);
  const rows = tipo === "vencimientos" ? all.filter((n) => n.alertType === "doc.expiring" || n.alertType === "contract.expiring") : tipo ? all.filter((n) => n.alertType === tipo) : all;
  const muted = new Set((await db.membership.findUnique({ where: { id: ctx.membershipId }, select: { mutedAlertTypes: true } }))?.mutedAlertTypes ?? []);
  const c = <input type="hidden" name="c" value={companyId} />;
  return (
    <>
      <div className="spread"><h1>Notificaciones</h1><ActionForm action={A.allReadAction} submit="Marcar todas como leídas" className="">{c}</ActionForm></div>
      {tipo && <p><Link href="?">Ver todas</Link></p>}
      {rows.length === 0 ? <Empty>Sin notificaciones.</Empty> : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, maxWidth: "none" }}>
          {rows.map((n) => (
            <li key={n.id} className="card">
              <div className="spread">
                <span>{!n.readAt && <Badge tone="warn">Nueva</Badge>} {n.resolved && <Badge tone="ok">Resuelta</Badge>} {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</span>
                <span className="small muted">{fmtDateTime(n.createdAt, ctx.company.timezone)}</span>
              </div>
              <div className="row">
                <ActionForm action={A.opAction} submit={n.readAt ? "Marcar no leída" : "Marcar leída"} className="">{c}<input type="hidden" name="id" value={n.id} /><input type="hidden" name="op" value={n.readAt ? "unread" : "read"} /></ActionForm>
                <ActionForm action={A.opAction} submit="Posponer 7 días" className="">{c}<input type="hidden" name="id" value={n.id} /><input type="hidden" name="op" value="snooze" /></ActionForm>
                <ActionForm action={A.opAction} submit="Descartar" className="">{c}<input type="hidden" name="id" value={n.id} /><input type="hidden" name="op" value="dismiss" /></ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="card">
        <h2>Preferencias</h2>
        <p className="small muted">Elige qué alertas quieres recibir. Solo verás las de los módulos y datos a los que tienes acceso.</p>
        <ActionForm action={A.prefsAction}>
          {c}
          <div className="fields">{Object.entries(ALERT_TYPES).map(([k, l]) => <label key={k} className="inline"><input type="checkbox" name="on" value={k} defaultChecked={!muted.has(k)} /> {l}</label>)}</div>
        </ActionForm>
      </section>
    </>
  );
}
