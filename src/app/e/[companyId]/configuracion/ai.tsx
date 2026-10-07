import { providerInfo } from "@/server/ai/provider";
import { ActionForm, Field } from "@/components/ActionForm";
import { Badge, fmtDateTime } from "@/components/ui";
import { aiSettingsAction } from "./actions";

export function AiSettings({ companyId, enabled, ack, monthly, daily, tokens, moduleOn }: { companyId: string; enabled: boolean; ack: Date | null; monthly: number; daily: number; tokens: number; moduleOn: boolean }) {
  const p = providerInfo();
  return (
    <section className="card">
      <h2>IA empresarial</h2>
      <p>
        Proveedor del servidor: {p.configured ? <Badge tone="ok">{p.provider} · {p.model}</Badge> : <Badge tone="warn">IA no configurada</Badge>}{" "}
        · Módulo: {moduleOn ? "activo" : "inactivo"} · Uso en esta empresa: {enabled ? <Badge tone="ok">Autorizado</Badge> : <Badge>No autorizado</Badge>}
        {ack && <span className="small muted"> (autorizado {fmtDateTime(ack, "America/Mexico_City")})</span>}
      </p>
      <p className="small">
        Al autorizarla, las preguntas de las personas y los resultados de consultas de solo lectura que ellas mismas podrían ver (nombres, puestos,
        fechas, importes agregados, vencimientos) se envían al proveedor configurado para redactar la respuesta. No se envían archivos, CLABE completas
        ni datos personales sensibles. No se guardan las conversaciones; solo un registro de uso sin contenido. La IA no puede modificar datos.
      </p>
      <ActionForm action={aiSettingsAction}>
        <input type="hidden" name="c" value={companyId} />
        <div className="fields">
          <label>
            Estado
            <select name="enabled" defaultValue={enabled ? "1" : "0"}>
              <option value="0">No autorizada</option>
              <option value="1">Autorizada</option>
            </select>
          </label>
          <Field label="Consultas por mes (empresa)" name="monthly" type="number" min={1} defaultValue={monthly} hint="Mes calendario en la zona horaria de la empresa. Cuentan también los intentos fallidos." />
          <Field label="Consultas por día y persona" name="daily" type="number" min={1} defaultValue={daily} hint="Día calendario en la zona horaria de la empresa." />
          <Field label="Presupuesto mensual de tokens" name="tokens" type="number" min={1000} defaultValue={tokens} hint="Suma de tokens de entrada y salida informados por el proveedor." />
        </div>
        {!enabled && <label className="inline"><input type="checkbox" name="acknowledge" /> Entiendo qué datos se envían al proveedor de IA y lo autorizo.</label>}
      </ActionForm>
    </section>
  );
}
