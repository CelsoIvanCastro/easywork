import Link from "next/link";
import { getCtx, load } from "@/server/web";
import { getEmployee } from "@/server/services/employees";
import { listDepartments, listPositions } from "@/server/services/structure";
import { db } from "@/server/db";
import { can } from "@/server/context";
import { DOC_TYPES, EMPLOYEE_STATUS, TERMINATION_REASONS } from "@/lib/catalogs";
import { ActionForm, Area, Field, Select } from "@/components/ActionForm";
import { Badge, Empty, fmtCivil, fmtDateTime, PageHead, Tabs } from "@/components/ui";
import { Completeness } from "@/components/Completeness";
import { ACCEPT } from "@/server/files";
import { civilStr } from "@/server/util";
import * as A from "../actions";
import { RevealClabe } from "./reveal";

type P = { params: Promise<{ companyId: string; id: string }>; searchParams: Promise<{ tab?: string; ver?: string }> };

export default async function Expediente({ params, searchParams }: P) {
  const { companyId, id } = await params;
  const { tab = "datos", ver } = await searchParams;
  const ctx = await getCtx(companyId);
  const x = await load(getEmployee(ctx, id, { revealPersonal: ver === "datos" }));
  const { access: a, employee: e } = x;
  const tz = ctx.company.timezone;
  const href = `/e/${companyId}/personal/${id}`;
  const tabs: [string, string][] = [[`${href}?tab=datos`, "Datos"]];
  if (a.docsView) tabs.push([`${href}?tab=documentos`, "Documentos"]);
  tabs.push([`${href}?tab=historial`, "Periodos e historial"]);
  if (a.bankRead) tabs.push([`${href}?tab=banco`, "Banco"]);
  if (a.notesRead) tabs.push([`${href}?tab=notas`, "Notas internas"]);
  if (a.offboard || ctx.isOwner) tabs.push([`${href}?tab=estado`, "Estado y baja"]);
  const hidden = (
    <>
      <input type="hidden" name="c" value={companyId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={e.version} />
    </>
  );
  const needsPlacement = tab === "datos" || tab === "estado";
  const [depts, positions] = needsPlacement && (a.edit || a.offboard) ? await Promise.all([listDepartments(ctx), listPositions(ctx)]) : [[], []];
  const deptOpts: [string, string][] = [["", "Sin asignar"], ...depts.map((d) => [d.id, d.name] as [string, string])];
  const posOpts: [string, string][] = [["", "Sin asignar"], ...positions.map((p) => [p.id, `${p.title} (${p.department.name})`] as [string, string])];

  return (
    <>
      <PageHead
        back={can(ctx, "employees.read") ? { href: `/e/${companyId}/personal${e.status === "FORMER" ? "?view=former" : ""}`, label: e.status === "FORMER" ? "Exempleados" : "Personal" } : undefined}
        title={`${e.firstName} ${e.lastName}`.trim()}
        folio={e.number}
        status={<Badge tone={e.status === "ACTIVE" ? "ok" : e.status === "FORMER" ? undefined : "warn"}>{EMPLOYEE_STATUS[e.status]}</Badge>}
        description={[x.position?.title, x.department?.name].filter(Boolean).join(" · ") || "Sin puesto asignado"}
      />
      <Completeness required={x.required} missing={x.missing} hrefFor={(sec) => `${href}?tab=${sec === "Documentos" ? "documentos" : sec === "Banco" ? "banco" : "datos"}`} />
      <Tabs items={tabs} current={`${href}?tab=${tab}`} />

      {tab === "datos" && (
        <>
          <section className="card">
            <h2>Datos laborales</h2>
            <dl className="kv">
              <dt>Departamento</dt><dd>{x.department?.name ?? "—"}</dd>
              <dt>Puesto</dt><dd>{x.position?.title ?? "—"}</dd>
              <dt>Supervisor(es)</dt><dd>{x.supervisors.map((s) => s.name).join(", ") || "—"} <span className="small muted">(según la jerarquía de puestos)</span></dd>
              <dt>Ingreso del periodo actual</dt><dd>{fmtCivil(e.hireDate)}</dd>
              <dt>Correo</dt><dd>{e.email ?? "—"}</dd>
              <dt>Cuenta vinculada</dt><dd>{e.hasAccount ? "Sí" : "No"}</dd>
            </dl>
            {a.edit && (
              <details>
                <summary>Editar datos básicos</summary>
                <ActionForm action={A.updateBasicAction}>
                  {hidden}
                  <div className="fields">
                    <Field label="Nombre(s)" name="firstName" defaultValue={e.firstName} required />
                    <Field label="Apellidos" name="lastName" defaultValue={e.lastName} />
                    <Field label="Correo" name="email" type="email" defaultValue={e.email ?? ""} />
                  </div>
                </ActionForm>
              </details>
            )}
            {a.edit && e.status !== "FORMER" && (
              <details>
                <summary>Cambiar puesto o departamento</summary>
                <p className="small muted">Se conserva el historial con fecha y responsable, y se recalculan los permisos heredados.</p>
                <ActionForm action={A.assignmentAction} submit="Guardar cambio">
                  {hidden}
                  <div className="fields">
                    <Select label="Departamento" name="departmentId" options={deptOpts} defaultValue={x.department?.id ?? ""} />
                    <Select label="Puesto" name="positionId" options={posOpts} defaultValue={x.position?.id ?? ""} />
                    <Field label="Motivo" name="reason" maxLength={200} />
                  </div>
                </ActionForm>
              </details>
            )}
          </section>
          <section className="card">
            <div className="panel-title">
              <h2>Datos personales</h2>
              {x.personal && !x.revealed && <Link className="small" href={`${href}?tab=datos&ver=datos`}>Mostrar datos completos</Link>}
              {x.personal && x.revealed && !a.self && <Link className="small" href={`${href}?tab=datos`}>Ocultar</Link>}
            </div>
            {x.personal && !x.revealed && <p className="small muted">Ocultos por privacidad. Mostrarlos queda registrado en la auditoría.</p>}
            {x.personal ? (
              <dl className="kv">
                <dt>Fecha de nacimiento</dt><dd>{fmtCivil(x.personal.birthDate)}</dd>
                <dt>Teléfono</dt><dd>{x.personal.phone ?? "—"}</dd>
                <dt>CURP</dt><dd>{x.personal.curp ?? "—"}</dd>
                <dt>RFC</dt><dd>{x.personal.rfc ?? "—"}</dd>
                <dt>NSS</dt><dd>{x.personal.nss ?? "—"}</dd>
                <dt>Domicilio</dt><dd>{x.personal.address ?? "—"}</dd>
              </dl>
            ) : (
              <p className="muted">No tienes permiso para ver los datos personales de este expediente.</p>
            )}
            {a.personalEdit && x.personal && x.revealed && (
              <details>
                <summary>{a.self ? "Completar mis datos" : "Editar datos personales"}</summary>
                <p className="small muted">Los campos vacíos se guardan como faltantes. CURP, RFC, NSS y domicilio se almacenan cifrados.</p>
                <ActionForm action={A.updatePersonalAction}>
                  {hidden}
                  <div className="fields">
                    <Field label="Fecha de nacimiento" name="birthDate" type="date" defaultValue={civilStr(x.personal.birthDate)} />
                    <Field label="Teléfono" name="phone" type="tel" defaultValue={x.personal.phone ?? ""} />
                    <Field label="CURP" name="curp" maxLength={18} defaultValue={x.personal.curp ?? ""} autoCapitalize="characters" />
                    <Field label="RFC" name="rfc" maxLength={13} defaultValue={x.personal.rfc ?? ""} autoCapitalize="characters" />
                    <Field label="NSS" name="nss" maxLength={11} inputMode="numeric" defaultValue={x.personal.nss ?? ""} />
                  </div>
                  <Area label="Domicilio" name="address" maxLength={400} defaultValue={x.personal.address ?? ""} />
                </ActionForm>
              </details>
            )}
          </section>
          <section className="card">
            <h2>Contratos</h2>
            {x.contracts.length ? (
              <ul>{x.contracts.map((c) => <li key={c.id}>{c.title}: {fmtCivil(c.startDate)} – {c.endDate ? fmtCivil(c.endDate) : "indefinido"}</li>)}</ul>
            ) : <Empty>Sin contratos registrados.</Empty>}
            {a.edit && (
              <details>
                <summary>Registrar contrato</summary>
                <ActionForm action={A.contractAction} reset>
                  {hidden}
                  <div className="fields">
                    <Field label="Título" name="title" required />
                    <Field label="Inicio" name="startDate" type="date" required />
                    <Field label="Fin (si aplica)" name="endDate" type="date" />
                  </div>
                  <Area label="Notas" name="notes" maxLength={1000} />
                </ActionForm>
              </details>
            )}
          </section>
        </>
      )}

      {tab === "documentos" && a.docsView && (
        <section className="card">
          <h2>Documentos del expediente</h2>
          {x.documents.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Documento</th><th>Tipo</th><th>Versión</th><th>Vence</th><th>Actualizado</th></tr></thead>
                <tbody>
                  {x.documents.map((d) => (
                    <tr key={d.id}>
                      <td><Link href={`/e/${companyId}/documentos/${d.id}`}>{d.title}</Link></td>
                      <td>{d.docType ? DOC_TYPES[d.docType as keyof typeof DOC_TYPES] : "—"}</td>
                      <td>v{d.currentVersionNo}</td>
                      <td>{fmtCivil(d.expiresOn)}</td>
                      <td>{fmtDateTime(d.updatedAt, tz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>Sin documentos.</Empty>}
          {a.docsUpload && (
            <>
              <h3>Subir documento</h3>
              <p className="small muted">PDF, JPG, PNG o WEBP de hasta 10 MB. Desde el teléfono puedes tomar una foto. Para reemplazar uno existente, ábrelo y sube una nueva versión.</p>
              <ActionForm action={A.uploadEmployeeDocAction} submit="Subir" reset>
                {hidden}
                <div className="fields">
                  <Select label="Tipo de documento" name="docType" options={Object.entries(DOC_TYPES)} />
                  <Field label="Título" name="title" required maxLength={200} />
                  <Field label="Vence (si aplica)" name="expiresOn" type="date" />
                  <Field label="Archivo" name="file" type="file" accept={ACCEPT} required />
                </div>
              </ActionForm>
            </>
          )}
        </section>
      )}

      {tab === "historial" && (
        <>
          <section className="card">
            <h2>Periodos laborales</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Ingreso</th><th>Baja</th><th>Motivo</th></tr></thead>
                <tbody>
                  {x.periods.map((p) => (
                    <tr key={p.id}>
                      <td>{p.number}</td>
                      <td>{fmtCivil(p.startDate)}</td>
                      <td>{p.endDate ? fmtCivil(p.endDate) : "Vigente"}</td>
                      <td>{p.terminationReason ? TERMINATION_REASONS[p.terminationReason] : "—"}{a.offboard && p.terminationNotes ? ` — ${p.terminationNotes}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <h2>Historial de puestos</h2>
            {x.assignments.length ? (
              <ul>
                {x.assignments.map((h) => (
                  <li key={h.id}>
                    {fmtDateTime(h.startedAt, tz)} → {h.endedAt ? fmtDateTime(h.endedAt, tz) : "actual"}: {h.position?.title ?? "sin puesto"} · {h.department?.name ?? "sin departamento"}
                    {h.reason && <span className="muted"> ({h.reason})</span>}
                  </li>
                ))}
              </ul>
            ) : <Empty>Sin movimientos.</Empty>}
            {a.audit && <p><Link href={`/e/${companyId}/auditoria?entityType=employee&entityId=${id}`}>Ver auditoría de este expediente</Link></p>}
          </section>
        </>
      )}

      {tab === "banco" && a.bankRead && (
        <section className="card">
          <h2>Información bancaria</h2>
          <p className="small muted">Validamos la estructura y el dígito verificador de la CLABE. Eso no confirma que la cuenta exista ni quién es su titular.</p>
          {x.bank.length ? (
            <ul>
              {x.bank.map((b) => (
                <li key={b.id}>
                  {b.isCurrent ? <Badge tone="ok">Vigente</Badge> : <Badge>Anterior</Badge>} {b.holderName} · {b.masked} · {b.bankName ?? `Banco no identificado (${b.bankCode})`}
                  <RevealClabe companyId={companyId} bankId={b.id} />
                </li>
              ))}
            </ul>
          ) : <Empty>Sin cuenta registrada.</Empty>}
          {a.bankEdit && (
            <details>
              <summary>{x.bank.length ? "Reemplazar cuenta" : "Registrar cuenta"}</summary>
              <ActionForm action={A.bankAction} reset>
                {hidden}
                <div className="fields">
                  <Field label="Titular" name="holderName" required maxLength={160} />
                  <Field label="CLABE (18 dígitos)" name="clabe" required inputMode="numeric" maxLength={22} autoComplete="off" />
                </div>
              </ActionForm>
            </details>
          )}
        </section>
      )}

      {tab === "notas" && a.notesRead && (
        <section className="card">
          <h2>Notas internas e incidencias</h2>
          {x.notes.length ? (
            <ul>{x.notes.map((n) => <li key={n.id}><Badge>{n.kind === "INCIDENT" ? "Incidencia" : "Nota"}</Badge> {fmtDateTime(n.createdAt, tz)}{n.occurredOn ? ` (ocurrió ${fmtCivil(n.occurredOn)})` : ""}: {n.body}</li>)}</ul>
          ) : <Empty>Sin notas.</Empty>}
          {a.notesEdit && (
            <ActionForm action={A.noteAction} reset submit="Registrar">
              {hidden}
              <div className="fields">
                <Select label="Tipo" name="kind" options={[["NOTE", "Nota"], ["INCIDENT", "Incidencia"]]} />
                <Field label="Fecha del hecho (opcional)" name="occurredOn" type="date" />
              </div>
              <Area label="Texto" name="body" required maxLength={4000} />
            </ActionForm>
          )}
        </section>
      )}

      {tab === "estado" && (a.offboard || ctx.isOwner) && (
        <StatusTab companyId={companyId} id={id} e={e} a={a} isOwner={ctx.isOwner} hidden={hidden} deptOpts={deptOpts} posOpts={posOpts} />
      )}
    </>
  );
}

async function StatusTab({ companyId, id, e, a, isOwner, hidden, deptOpts, posOpts }: {
  companyId: string; id: string; e: Awaited<ReturnType<typeof getEmployee>>["employee"]; a: Awaited<ReturnType<typeof getEmployee>>["access"];
  isOwner: boolean; hidden: React.ReactNode; deptOpts: [string, string][]; posOpts: [string, string][];
}) {
  const settings = isOwner ? await db.companySettings.findUnique({ where: { companyId } }) : null;
  return (
    <section className="card stack">
      <h2>Estado del expediente</h2>
      <p className="small">
        <strong>Activo:</strong> acceso según permisos. <strong>Suspendido:</strong> sin acceso a esta empresa; sigue en el organigrama.{" "}
        <strong>Baja en proceso:</strong> conserva acceso solo a su propio expediente. <strong>Exempleado:</strong> sin acceso, fuera del organigrama; el expediente se conserva.
      </p>
      {e.status === "FORMER" && <p className="msg info" role="status">Exempleado: sin acceso a esta empresa y fuera del organigrama. El expediente, sus documentos y su historial se conservan.</p>}
      {e.isOwnerRecord && <p className="msg info">El propietario de la empresa no puede ser suspendido ni dado de baja.</p>}
      {a.offboard && e.status !== "FORMER" && (
        <>
          <div className="row">
            {e.status !== "ACTIVE" && <ActionForm action={A.statusAction} submit="Reactivar" className="">{hidden}<input type="hidden" name="status" value="ACTIVE" /></ActionForm>}
            {e.status !== "SUSPENDED" && <ActionForm action={A.statusAction} submit="Suspender" className="" confirm="Suspender retirará de inmediato su acceso a esta empresa. ¿Continuar?">{hidden}<input type="hidden" name="status" value="SUSPENDED" /></ActionForm>}
            {e.status !== "OFFBOARDING" && <ActionForm action={A.statusAction} submit="Marcar baja en proceso" className="">{hidden}<input type="hidden" name="status" value="OFFBOARDING" /></ActionForm>}
          </div>
          <h3>Dar de baja</h3>
          <p className="small">Dar de baja cierra el periodo vigente, retira su acceso a esta empresa y lo saca del organigrama. Se conservan expediente, documentos, contratos, banco e historial. No afecta su cuenta ni otras empresas.</p>
          <ActionForm action={A.terminateAction} submit="Dar de baja" danger confirm="¿Confirmas la baja? Se retirará el acceso y se conservará el expediente.">
            {hidden}
            <div className="fields">
              <Field label="Fecha de baja" name="date" type="date" required />
              <Select label="Motivo" name="reason" options={[["", "Elige…"], ["RESIGNATION", "Renuncia"], ["DISMISSAL", "Despido"], ["CONTRACT_END", "Fin de contrato"], ["OTHER", "Otro"]]} required />
              <Field label="Documento relacionado (opcional)" name="file" type="file" accept={ACCEPT} />
            </div>
            <Area label="Notas (opcional)" name="notes" maxLength={2000} />
          </ActionForm>
        </>
      )}
      {a.offboard && e.status === "FORMER" && !e.anonymizedAt && (
        <>
          <h3>Recontratar</h3>
          <p className="small">Crea un nuevo periodo laboral en este mismo expediente. No restaura permisos ni acceso completo anteriores.</p>
          <ActionForm action={A.rehireAction} submit="Recontratar">
            {hidden}
            <div className="fields">
              <Field label="Fecha de reingreso" name="date" type="date" required />
              <Select label="Departamento" name="departmentId" options={deptOpts} />
              <Select label="Puesto" name="positionId" options={posOpts} />
            </div>
          </ActionForm>
        </>
      )}
      {isOwner && (
        <>
          <h3>Conservación y retención</h3>
          <ActionForm action={A.legalHoldAction} submit="Guardar">
            {hidden}
            <label className="inline"><input type="checkbox" name="hold" defaultChecked={!!e.legalHold} /> Bloqueo de conservación (impide anonimizar)</label>
          </ActionForm>
          {e.status === "FORMER" && !e.anonymizedAt && (
            <>
              <p className="small">
                Anonimizar elimina de forma irreversible datos personales, banco, notas y archivos del expediente, conservando un rastro mínimo.
                Política actual: {settings?.retentionYearsAfterExit ? `${settings.retentionYearsAfterExit} años tras la baja` : "no configurada (Configuración)"}.
              </p>
              <ActionForm action={A.anonymizeAction} submit="Anonimizar definitivamente" danger confirm="Esta acción es irreversible. ¿Continuar?">
                {hidden}
                <Field label={`Escribe el número ${e.number} para confirmar`} name="confirm" required autoComplete="off" />
              </ActionForm>
            </>
          )}
          {e.anonymizedAt && <p className="msg info">Expediente anonimizado.</p>}
        </>
      )}
    </section>
  );
}
