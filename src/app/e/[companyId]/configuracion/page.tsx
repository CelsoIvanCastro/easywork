import { allowOr404, getCtx } from "@/server/web";
import { can, MODULE_DEPS, MODULE_LABELS, TOGGLEABLE_MODULES } from "@/server/context";
import { getCompany } from "@/server/services/companies";
import { DOC_TYPES, EMPLOYEE_FIELDS } from "@/lib/catalogs";
import { ActionForm, Area, Field } from "@/components/ActionForm";
import { Badge } from "@/components/ui";
import { AiSettings } from "./ai";
import * as A from "./actions";

export default async function Configuracion({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  const manage = can(ctx, "settings.manage");
  allowOr404(ctx.isOwner || manage || can(ctx, "alerts.manage"));
  const co = await getCompany(ctx);
  const c = <input type="hidden" name="c" value={companyId} />;
  const s = co.settings;
  return (
    <>
      <h1>Configuración</h1>
      {co.setupMissing.length > 0 && <p className="msg info">Para completar la configuración falta: {co.setupMissing.map((k) => ({ rfc: "RFC", fiscalAddress: "Domicilio fiscal", activity: "Giro o actividad", email: "Correo empresarial" })[k] ?? k).join(", ")}.</p>}
      {manage && (
        <section className="card">
          <h2>Datos de la empresa</h2>
          <p className="small muted">Código visible: {co.code}</p>
          <ActionForm action={A.companyAction}>
            {c}<input type="hidden" name="version" value={co.version} />
            <div className="fields">
              <Field label="Nombre comercial" name="tradeName" defaultValue={co.tradeName} required />
              <Field label="Nombre legal" name="legalName" defaultValue={co.legalName} required />
              <Field label="RFC" name="rfc" defaultValue={co.rfc ?? ""} maxLength={13} />
              <Field label="Giro / actividad" name="activity" defaultValue={co.activity ?? ""} />
              <Field label="Correo empresarial" name="email" type="email" defaultValue={co.email ?? ""} />
              <Field label="Teléfono (opcional)" name="phone" defaultValue={co.phone ?? ""} />
              <Field label="Zona horaria" name="timezone" defaultValue={co.timezone} hint="Ej. America/Mexico_City" />
            </div>
            <Area label="Domicilio fiscal" name="fiscalAddress" defaultValue={co.fiscalAddress ?? ""} maxLength={300} />
            <Area label="Descripción u objetivo" name="description" defaultValue={co.description ?? ""} maxLength={1000} />
          </ActionForm>
        </section>
      )}
      {manage && (
        <section className="card">
          <h2>Logotipo</h2>
          {co.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/logo/${companyId}`} alt={`Logotipo de ${co.tradeName}`} style={{ maxHeight: 80, maxWidth: 240 }} />
          ) : <p className="small muted">Aún no hay logotipo.</p>}
          <ActionForm action={A.logoAction} submit="Subir logotipo" reset>
            {c}
            <Field label="Imagen (JPG, PNG o WEBP)" name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          </ActionForm>
        </section>
      )}
      {co.joinCode && (
        <section className="card" id="codigo">
          <h2>Código para unirse</h2>
          <p>
            <code style={{ fontSize: "1.3rem" }}>{co.joinCode}</code>
          </p>
          <p className="small muted">Solo permite enviar una solicitud; no da acceso ni muestra datos internos.</p>
          {ctx.isOwner && <ActionForm action={A.joinCodeAction} submit="Regenerar código" confirm="El código actual dejará de funcionar. ¿Continuar?">{c}</ActionForm>}
        </section>
      )}
      {ctx.isOwner && (
        <section className="card">
          <h2>Módulos</h2>
          <p className="small muted">Desactivar un módulo oculta sus funciones y pausa sus alertas; nunca borra datos.</p>
          <ul>
            {TOGGLEABLE_MODULES.map((m) => {
              const on = ctx.modules.has(m);
              return (
                <li key={m} className="row">
                  <strong>{MODULE_LABELS[m]}</strong> <Badge tone={on ? "ok" : undefined}>{on ? "Activo" : "Inactivo"}</Badge>
                  {MODULE_DEPS[m] && <span className="small muted">requiere {MODULE_DEPS[m]!.map((d) => MODULE_LABELS[d]).join(" y ")}</span>}
                  <ActionForm action={A.moduleAction} submit={on ? "Desactivar" : "Activar"} className="">
                    {c}<input type="hidden" name="module" value={m} /><input type="hidden" name="enabled" value={on ? "0" : "1"} />
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {s && can(ctx, "alerts.manage") && (
        <section className="card">
          <h2>Alertas y expediente completo</h2>
          <ActionForm action={A.settingsAction}>
            {c}
            <div className="fields">
              <Field label="Avisar documentos por vencer (días antes)" name="docExpiryLeadDays" type="number" min={1} max={365} defaultValue={s.docExpiryLeadDays} />
              <Field label="Avisar contratos por vencer (días antes)" name="contractExpiryLeadDays" type="number" min={1} max={365} defaultValue={s.contractExpiryLeadDays} />
              <Field label="Avisar mantenimiento por fecha (días antes)" name="maintenanceLeadDays" type="number" min={0} max={365} defaultValue={s.maintenanceLeadDays} />
            </div>
            <fieldset>
              <legend>Campos requeridos para considerar completo un expediente</legend>
              <div className="fields">
                {Object.entries(EMPLOYEE_FIELDS).map(([k, l]) => (
                  <label key={k} className="inline"><input type="checkbox" name="requiredEmployeeFields" value={k} defaultChecked={s.requiredEmployeeFields.includes(k)} /> {l}</label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Documentos requeridos</legend>
              <div className="fields">
                {Object.entries(DOC_TYPES).map(([k, l]) => (
                  <label key={k} className="inline"><input type="checkbox" name="requiredDocTypes" value={k} defaultChecked={s.requiredDocTypes.includes(k)} /> {l}</label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        </section>
      )}
      {ctx.isOwner && s && (
        <section className="card">
          <h2>Retención de datos de exempleados</h2>
          <p className="small">
            Define cuántos años tras la baja deben conservarse los expedientes antes de permitir su anonimización. Los plazos legales dependen de tu
            situación: consulta a tu asesor. Sin política configurada no se puede anonimizar.
          </p>
          <ActionForm action={A.retentionAction}>
            {c}
            <Field label="Años tras la baja (vacío = sin política)" name="years" type="number" min={1} max={100} defaultValue={s.retentionYearsAfterExit ?? ""} />
          </ActionForm>
        </section>
      )}
      {ctx.isOwner && <OwnerZone companyId={companyId} tradeName={co.tradeName} />}
      {ctx.isOwner && s && <AiSettings companyId={companyId} enabled={s.aiEnabled} ack={s.aiAcknowledgedAt} monthly={s.aiMonthlyRequestLimit} daily={s.aiDailyUserLimit} tokens={s.aiMonthlyTokenLimit} moduleOn={ctx.modules.has("ai")} />}
    </>
  );
}

async function OwnerZone({ companyId, tradeName }: { companyId: string; tradeName: string }) {
  const { db } = await import("@/server/db");
  const [members, pending] = await Promise.all([
    db.membership.findMany({ where: { companyId, status: "ACTIVE", company: { ownerId: { not: null } } }, include: { user: { select: { id: true, name: true, lastName: true } }, company: { select: { ownerId: true } } } }),
    db.ownershipTransfer.findFirst({ where: { companyId, status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);
  const candidates = members.filter((m) => m.userId !== m.company.ownerId);
  const c = <input type="hidden" name="c" value={companyId} />;
  return (
    <section className="card danger-zone" aria-labelledby="propiedad">
      <h2 id="propiedad">Propiedad y cierre</h2>
      <h3>Transferir la propiedad</h3>
      <p className="small">La otra persona debe aceptarla desde «Mis empresas». Hasta entonces sigues siendo el propietario. Al aceptar, tú quedas como miembro sin privilegios especiales.</p>
      {pending ? (
        <ActionForm action={A.cancelTransferAction} submit="Cancelar la propuesta pendiente">{c}</ActionForm>
      ) : candidates.length ? (
        <ActionForm action={A.transferAction} submit="Proponer transferencia" confirm="Vas a proponer transferir la propiedad de la empresa. ¿Continuar?">
          {c}
          <label>Nuevo propietario<select name="membershipId">{candidates.map((m) => <option key={m.id} value={m.id}>{m.user.name} {m.user.lastName}</option>)}</select></label>
        </ActionForm>
      ) : <p className="small muted">No hay otros miembros activos a quienes transferirla.</p>}
      <h3>Cerrar la empresa</h3>
      <p className="small">Nadie podrá volver a operar en ella. Sus datos se conservan según la política de retención; no se borran. Esta acción no se puede deshacer desde la aplicación.</p>
      <ActionForm action={A.closeCompanyAction} submit="Cerrar la empresa" danger confirm="La empresa quedará cerrada para todas las personas. ¿Continuar?">
        {c}
        <Field label={`Escribe «${tradeName}» para confirmar`} name="confirm" required autoComplete="off" />
        <Area label="Motivo" name="reason" required maxLength={500} />
      </ActionForm>
    </section>
  );
}
