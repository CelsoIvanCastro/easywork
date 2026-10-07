import Link from "next/link";
import { getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { listEmployees } from "@/server/services/employees";
import { listDepartments, listPositions } from "@/server/services/structure";
import { EMPLOYEE_STATUS, TERMINATION_REASONS } from "@/lib/catalogs";
import { Badge, Empty, Folio, PageHead, fmtCivil, Pager } from "@/components/ui";

type SP = Record<string, string | undefined>;

export default async function Personal({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<SP> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  const view = sp.view === "former" ? "former" : "active";
  const [list, depts, positions] = await Promise.all([
    load(listEmployees(ctx, { view, q: sp.q, departmentId: sp.dept, positionId: sp.pos, status: sp.status, from: sp.from, to: sp.to, page: Number(sp.page ?? 1) })),
    listDepartments(ctx),
    listPositions(ctx),
  ]);
  const qs = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(p) })}`;
  return (
    <>
      <PageHead
        title={view === "former" ? "Exempleados" : "Personal activo"}
        description={view === "former" ? "Personas dadas de baja. Sus expedientes, documentos e historial se conservan." : "Personas con periodo laboral vigente."}
        actions={
          <>
            <Link className="btn secondary" href={view === "former" ? "?" : "?view=former"}>{view === "former" ? "Ver activos" : "Ver exempleados"}</Link>
            {can(ctx, "employees.create") && <Link className="btn" href={`/e/${companyId}/personal/nuevo`}>Nuevo expediente</Link>}
          </>
        }
      />
      <form className="filters" role="search" aria-label="Filtrar personal">
        {view === "former" && <input type="hidden" name="view" value="former" />}
        <label>Buscar<span className="hint">Con permiso también por RFC, CURP, NSS o teléfono exactos.</span><input name="q" defaultValue={sp.q} placeholder="Nombre, folio o correo" /></label>
        <div><button>Buscar</button></div>
        <details className="more" open={!!(sp.dept || sp.pos || sp.status || sp.from || sp.to)}>
          <summary>Más filtros</summary>
          <div className="fields">
        <label>Departamento<select name="dept" defaultValue={sp.dept ?? ""}><option value="">Todos</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Puesto<select name="pos" defaultValue={sp.pos ?? ""}><option value="">Todos</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        {view === "active" && (
          <label>Estado<select name="status" defaultValue={sp.status ?? ""}><option value="">Todos</option>{(["ACTIVE", "SUSPENDED", "OFFBOARDING"] as const).map((s) => <option key={s} value={s}>{EMPLOYEE_STATUS[s]}</option>)}</select></label>
        )}
        <label>{view === "former" ? "Baja desde" : "Ingreso desde"}<input type="date" name="from" defaultValue={sp.from} /></label>
        <label>{view === "former" ? "Baja hasta" : "Ingreso hasta"}<input type="date" name="to" defaultValue={sp.to} /></label>
            <div><button className="secondary">Aplicar filtros</button></div>
          </div>
        </details>
      </form>
      {list.restricted && <p className="msg info">No tienes permiso para buscar por datos personales sensibles.</p>}
      {list.rows.length === 0 ? (
        <Empty title="Sin resultados">Cambia los filtros o la búsqueda.</Empty>
      ) : (
        <div className="table-wrap stackable">
          <table>
            <thead><tr><th>Folio</th><th>Nombre</th><th>Departamento</th><th>Puesto</th><th>Estado</th><th>{view === "former" ? "Baja" : "Ingreso"}</th></tr></thead>
            <tbody>
              {list.rows.map((e) => (
                <tr key={e.id}>
                  <td data-label="Folio"><Folio>{e.number}</Folio></td>
                  <td data-label="Nombre"><Link href={`/e/${companyId}/personal/${e.id}`}>{e.firstName} {e.lastName}</Link></td>
                  <td data-label="Departamento">{e.department?.name ?? "—"}</td>
                  <td data-label="Puesto">{e.position?.title ?? "—"}</td>
                  <td data-label="Estado"><Badge tone={e.status === "ACTIVE" ? "ok" : e.status === "FORMER" ? undefined : "warn"}>{EMPLOYEE_STATUS[e.status]}</Badge></td>
                  <td data-label={view === "former" ? "Baja" : "Ingreso"}>
                    {view === "former"
                      ? `${fmtCivil(e.periods[0]?.endDate)} · ${e.periods[0]?.terminationReason ? TERMINATION_REASONS[e.periods[0].terminationReason] : ""}`
                      : fmtCivil(e.hireDate)}
                  </td>
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
