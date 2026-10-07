import { allowOr404, getCtx } from "@/server/web";
import { can } from "@/server/context";
import { db } from "@/server/db";
import { providerInfo } from "@/server/ai/provider";
import { Chat } from "./chat";

const EXAMPLES = [
  "¿Quién tiene el expediente incompleto?",
  "¿Qué maquinaria necesita mantenimiento este mes?",
  "¿Qué activos vendimos este año?",
  "¿Cuánto pagamos la última vez por tornillos?",
  "¿Qué proveedor tuvo el menor precio comparable de tornillos?",
  "¿Quién ocupa el puesto de Jefe de sistemas?",
  "¿Quién modificó el Reglamento interno?",
  "¿Qué exempleados trabajaron en Sistemas?",
];

export default async function IA({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  allowOr404(ctx.modules.has("ai") && can(ctx, "ai.use"));
  const s = await db.companySettings.findUniqueOrThrow({ where: { companyId } });
  const p = providerInfo();
  return (
    <>
      <h1>IA empresarial</h1>
      <p className="small muted">Consulta datos de {ctx.company.tradeName} a los que tienes acceso. La IA solo lee: no modifica nada. Verifica las respuestas en las fuentes enlazadas.</p>
      {!p.configured ? <p className="msg info">IA no configurada en el servidor. El administrador debe definir AI_PROVIDER, AI_MODEL y la clave (ver docs/OPERACION.md).</p>
        : !s.aiEnabled ? <p className="msg info">El propietario aún no autorizó la IA para esta empresa (Configuración → IA empresarial).</p>
        : <Chat key={companyId} companyId={companyId} examples={EXAMPLES} />}
    </>
  );
}
