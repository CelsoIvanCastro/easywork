import { allowOr404, getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { listAudit } from "@/server/services/auditLog";
import { Badge, Empty, fmtDateTime, Pager } from "@/components/ui";

type SP = Record<"actor" | "module" | "action" | "entityType" | "entityId" | "from" | "to" | "page", string | undefined>;
const MODULES = { core: "Núcleo", employees: "Personal", structure: "Estructura", documents: "Documentos", inventory: "Inventario", suppliers: "Proveedores", purchases: "Compras", maintenance: "Mantenimiento", announcements: "Avisos", ai: "IA" };

export default async function Auditoria({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<SP> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(can(ctx, "audit.read"));
  const list = await load(listAudit(ctx, { ...sp, page: Number(sp.page ?? 1) }));
  const qs = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;
  return (
    <>
      <h1>Auditoría</h1>
      <p className="small muted">Registro de solo lectura. Los valores protegidos (CLABE, CURP, RFC…) se muestran como “[protegido]”.</p>
      <form className="card fields" role="search">
        <label>Actor<input name="actor" defaultValue={sp.actor} /></label>
        <label>Módulo<select name="module" defaultValue={sp.module ?? ""}><option value="">Todos</option>{Object.entries(MODULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Acción contiene<input name="action" defaultValue={sp.action} placeholder="employee.terminate" /></label>
        <label>Tipo de entidad<input name="entityType" defaultValue={sp.entityType} /></label>
        <label>ID de entidad<input name="entityId" defaultValue={sp.entityId} /></label>
        <label>Desde<input type="date" name="from" defaultValue={sp.from} /></label>
        <label>Hasta<input type="date" name="to" defaultValue={sp.to} /></label>
        <div className="row"><button>Filtrar</button></div>
      </form>
      {list.rows.length === 0 ? <Empty>Sin eventos.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.createdAt, ctx.company.timezone)}</td>
                  <td>{r.actorLabel}</td>
                  <td>{r.action} {r.result !== "SUCCESS" && <Badge tone="bad">{r.result}</Badge>} {r.sensitive && <Badge tone="warn">Sensible</Badge>}</td>
                  <td className="small">{r.entityType ?? "—"} {r.entityId && <code>{r.entityId.slice(0, 8)}</code>}</td>
                  <td className="small">{r.redacted ? <span className="muted">Detalle oculto (sin acceso al módulo)</span> : <>{r.summary}{r.changes && Object.keys(r.changes).length > 0 && <code style={{ display: "block", whiteSpace: "pre-wrap" }}>{JSON.stringify(r.changes)}</code>}</>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={list.page} total={list.total} pageSize={list.pageSize} href={qs} />
    </>
  );
}
