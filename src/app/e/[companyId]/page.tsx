import Link from "next/link";
import { AlertTriangle, ChevronRight, CircleAlert, Info } from "lucide-react";
import { getCtx } from "@/server/web";
import { can } from "@/server/context";
import { db } from "@/server/db";
import { dashboard } from "@/server/services/dashboard";
import { getCompany } from "@/server/services/companies";
import { ALERT_TYPES } from "@/server/services/notifications";
import { PURCHASE_STATUS } from "@/lib/catalogs";
import { Badge, Empty, Folio, PageHead, fmtCivil } from "@/components/ui";

const SETUP_LABELS: Record<string, string> = { rfc: "RFC", fiscalAddress: "Domicilio fiscal", activity: "Giro o actividad", email: "Correo empresarial" };
const SEVERITY = { danger: { label: "Urgente", tone: "bad", Icon: AlertTriangle }, warning: { label: "Revisar", tone: "warn", Icon: CircleAlert }, info: { label: "Aviso", tone: undefined, Icon: Info } } as const;

export default async function Inicio({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  const [d, co] = await Promise.all([dashboard(ctx), getCompany(ctx)]);
  const b = `/e/${companyId}`;
  const order = { danger: 0, warning: 1, info: 2 } as Record<string, number>;
  const alerts = [...d.alerts].sort((x, y) => (order[x.severity] ?? 3) - (order[y.severity] ?? 3));
  // Primeros pasos para una empresa nueva, calculados con su estado real.
  const steps =
    ctx.isOwner || can(ctx, "structure.manage")
      ? await Promise.all([db.department.count({ where: { companyId, archivedAt: null } }), db.employee.count({ where: { companyId } })]).then(([depts, emps]) =>
          [
            { done: co.setupMissing.length === 0, label: "Completa los datos de la empresa", href: `${b}/configuracion` },
            { done: depts > 0, label: "Crea departamentos y puestos", href: `${b}/estructura` },
            { done: emps > 1, label: "Invita a tu equipo con el código de ingreso o da de alta expedientes", href: `${b}/configuracion#codigo` },
          ],
        )
      : [];
  const pendingSteps = steps.filter((s) => !s.done);
  const first = ctx.userLabel.split(" ")[0];
  return (
    <>
      <PageHead title={`Hola, ${first}`} description={`Esto es lo que requiere atención en ${ctx.company.tradeName}.`} />

      {pendingSteps.length > 0 && (
        <section className="card" aria-labelledby="pasos">
          <div className="panel-title"><h2 id="pasos">Primeros pasos</h2><span className="small muted">{steps.length - pendingSteps.length} de {steps.length} listos</span></div>
          <ol className="stack" style={{ margin: 0, paddingLeft: 20, gap: 6 }}>
            {steps.map((s) => (
              <li key={s.label}>{s.done ? <span className="muted"><s>{s.label}</s> · listo</span> : <Link href={s.href}>{s.label}</Link>}</li>
            ))}
          </ol>
          {co.setupMissing.length > 0 && <p className="small muted" style={{ marginTop: 12 }}>Falta: {co.setupMissing.map((k) => SETUP_LABELS[k] ?? k).join(", ")}.</p>}
        </section>
      )}

      <div className="split">
        <section aria-labelledby="atencion">
          <div className="panel-title"><h2 id="atencion">Requiere atención</h2>{alerts.length > 0 && <Link className="small" href={`${b}/notificaciones`}>Ver todo</Link>}</div>
          {alerts.length ? (
            <ol className="agenda">
              {alerts.map((a) => {
                const sv = SEVERITY[a.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
                return (
                  <li key={a.id}>
                    <Link href={a.link}>
                      <Badge tone={sv.tone}>{sv.label}</Badge>
                      <span className="what"><span>{a.title}</span><small>{ALERT_TYPES[a.type as keyof typeof ALERT_TYPES] ?? a.type}</small></span>
                      <ChevronRight className="icon go" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty title="Todo al día">No hay pendientes que puedas ver. Las alertas aparecen aquí cuando algo vence, falta o necesita revisión.</Empty>
          )}
        </section>

        <div className="stack" style={{ maxWidth: "none" }}>
          {d.kpis.length > 0 && (
            <section aria-labelledby="resumen">
              <h2 id="resumen" style={{ marginTop: 0 }}>Resumen</h2>
              <div className="kpis">
                {d.kpis.map((k) => (
                  <Link key={k.label} href={k.href} className="kpi">
                    <strong>{k.value}</strong>
                    <span>{k.label}</span>
                    {k.tone === "bad" && k.value > 0 && <Badge tone="bad">Atender</Badge>}
                    {k.tone === "warn" && k.value > 0 && <Badge tone="warn">Revisar</Badge>}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {d.purchases && (
            <section aria-labelledby="compras">
              <div className="panel-title"><h2 id="compras">Compras recientes</h2><Link className="small" href={`${b}/compras`}>Ver compras</Link></div>
              {d.purchases.length ? (
                <ol className="agenda">
                  {d.purchases.map((p) => (
                    <li key={p.id}>
                      <Link href={`${b}/compras/${p.id}`}>
                        <Folio>{p.code}</Folio>
                        <span className="what"><span>{p.supplierName}</span><small>{fmtCivil(p.orderedOn)} · {PURCHASE_STATUS[p.status]}</small></span>
                        <ChevronRight className="icon go" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : <Empty>Aún no hay compras.</Empty>}
            </section>
          )}
          {!d.kpis.length && ctx.employee && (
            <Empty title="Tu espacio" action={<Link className="btn secondary" href={`${b}/personal/${ctx.employee.id}`}>Ver mi expediente</Link>}>
              Consulta y completa tu expediente, sube tus documentos y lee los avisos de la empresa.
            </Empty>
          )}
        </div>
      </div>
    </>
  );
}
