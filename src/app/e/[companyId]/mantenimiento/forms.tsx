import { ActionForm, Area, Field, Select } from "@/components/ActionForm";
import { MAINTENANCE_POLICY } from "@/server/services/maintenance";
import { readingAction, planAction, recordAction } from "./actions";

const hidden = (c: string, a: string) => (<><input type="hidden" name="c" value={c} /><input type="hidden" name="assetId" value={a} /></>);

export function ReadingForm({ companyId, assetId, unit }: { companyId: string; assetId: string; unit: string }) {
  return (
    <div>
      <h3>Registrar lectura</h3>
      <ActionForm action={readingAction} submit="Registrar" reset>
        {hidden(companyId, assetId)}
        <Field label={`Lectura del medidor (${unit})`} name="value" required inputMode="decimal" />
        <Select label="Tipo" name="kind" options={[["NORMAL", "Lectura normal"], ["CORRECTION", "Corrección de un error"], ["METER_REPLACEMENT", "Cambio de medidor (lectura del nuevo)"]]} />
        <Field label="Motivo (obligatorio en correcciones y cambios)" name="notes" maxLength={300} />
      </ActionForm>
    </div>
  );
}

export function PlanForm({ companyId, assetId, usage, unit }: { companyId: string; assetId: string; usage: boolean; unit: string }) {
  return (
    <div>
      <h3>Nuevo plan preventivo</h3>
      <p className="small muted">{MAINTENANCE_POLICY}</p>
      <ActionForm action={planAction} submit="Crear plan" reset>
        {hidden(companyId, assetId)}
        <Field label="Nombre" name="name" required placeholder="Cambio de aceite" />
        <Field label="Cada cuántos días" name="intervalDays" type="number" min={1} />
        {usage && <Field label={`Cada cuántos ${unit}`} name="intervalReading" inputMode="decimal" />}
        {usage && <Field label={`Avisar cuando falten (${unit}, opcional)`} name="leadReading" inputMode="decimal" />}
        <Field label="Último servicio (fecha, opcional)" name="lastServiceOn" type="date" />
        {usage && <Field label={`Último servicio (lectura, opcional)`} name="lastServiceReading" inputMode="decimal" />}
      </ActionForm>
    </div>
  );
}

export function RecordForm({ companyId, assetId, plans, costs }: { companyId: string; assetId: string; plans: [string, string][]; costs: boolean }) {
  void costs;
  return (
    <div>
      <h3>Programar o registrar mantenimiento</h3>
      <ActionForm action={recordAction} submit="Guardar" reset>
        {hidden(companyId, assetId)}
        <Select label="Tipo" name="type" options={[["PREVENTIVE", "Preventivo"], ["CORRECTIVE", "Correctivo"]]} />
        <Select label="Plan (si es preventivo)" name="planId" options={[["", "—"], ...plans]} />
        <Field label="Fecha programada" name="scheduledOn" type="date" />
        <Field label="Taller (texto)" name="workshop" maxLength={160} />
        <Area label="Trabajo a realizar" name="description" required maxLength={2000} />
      </ActionForm>
    </div>
  );
}
