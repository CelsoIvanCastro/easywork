import { allowOr404, getCtx } from "@/server/web";
import { can } from "@/server/context";
import { listDepartments, listPositions } from "@/server/services/structure";
import { ActionForm, Field, Select } from "@/components/ActionForm";
import { Empty } from "@/components/ui";
import * as A from "./actions";

export default async function Estructura({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  allowOr404(can(ctx, "structure.manage"));
  const [depts, positions] = await Promise.all([listDepartments(ctx), listPositions(ctx)]);
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const posName = new Map(positions.map((p) => [p.id, p.title]));
  const c = <input type="hidden" name="c" value={companyId} />;
  const deptOpts: [string, string][] = [["", "Ninguno"], ...depts.map((d) => [d.id, d.name] as [string, string])];
  const posOpts: [string, string][] = [["", "Ninguno (nivel superior)"], ...positions.map((p) => [p.id, `${p.title} (${p.department.name})`] as [string, string])];
  return (
    <>
      <h1>Departamentos y puestos</h1>
      <p className="muted">La jerarquía de puestos define quién supervisa a quién: el supervisor de una persona son los ocupantes del puesto superior. Los títulos no otorgan permisos; las concesiones se configuran en Miembros y permisos.</p>
      <section className="card">
        <h2>Departamentos</h2>
        {depts.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Depende de</th><th>Orden</th><th>Acciones</th></tr></thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.parentId ? deptName.get(d.parentId) : "—"}</td>
                    <td>{d.sortOrder}</td>
                    <td>
                      <details>
                        <summary>Editar</summary>
                        <ActionForm action={A.saveDeptAction}>
                          {c}<input type="hidden" name="id" value={d.id} /><input type="hidden" name="version" value={d.version} />
                          <Field label="Nombre" name="name" defaultValue={d.name} required />
                          <Select label="Depende de" name="parentId" options={deptOpts.filter(([v]) => v !== d.id)} defaultValue={d.parentId ?? ""} />
                          <Field label="Orden" name="sortOrder" type="number" min={0} defaultValue={d.sortOrder} />
                        </ActionForm>
                        <ActionForm action={A.archiveDeptAction} submit="Archivar" confirm="Archivar el departamento lo oculta de la estructura actual sin borrar su historial.">
                          {c}<input type="hidden" name="id" value={d.id} />
                        </ActionForm>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Aún no hay departamentos.</Empty>}
        <h3>Nuevo departamento</h3>
        <ActionForm action={A.saveDeptAction} submit="Crear" reset>
          {c}
          <div className="fields">
            <Field label="Nombre" name="name" required maxLength={120} />
            <Select label="Depende de" name="parentId" options={deptOpts} />
            <Field label="Orden" name="sortOrder" type="number" min={0} defaultValue={0} />
          </div>
        </ActionForm>
      </section>
      <section className="card">
        <h2>Puestos</h2>
        {positions.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Puesto</th><th>Departamento</th><th>Reporta a</th><th>Plazas</th><th>Acciones</th></tr></thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.department.name}</td>
                    <td>{p.parentPositionId ? posName.get(p.parentPositionId) : "—"}</td>
                    <td>{p.headcount ?? "Sin límite"}</td>
                    <td>
                      <details>
                        <summary>Editar</summary>
                        <ActionForm action={A.savePosAction}>
                          {c}<input type="hidden" name="id" value={p.id} /><input type="hidden" name="version" value={p.version} />
                          <Field label="Título" name="title" defaultValue={p.title} required />
                          <Select label="Departamento" name="departmentId" options={deptOpts.slice(1)} defaultValue={p.departmentId} />
                          <Select label="Reporta a" name="parentPositionId" options={posOpts.filter(([v]) => v !== p.id)} defaultValue={p.parentPositionId ?? ""} />
                          <Field label="Plazas previstas" name="headcount" type="number" min={1} defaultValue={p.headcount ?? ""} />
                        </ActionForm>
                        <ActionForm action={A.archivePosAction} submit="Archivar" confirm="¿Archivar este puesto?">
                          {c}<input type="hidden" name="id" value={p.id} />
                        </ActionForm>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Aún no hay puestos.</Empty>}
        <h3>Nuevo puesto</h3>
        {depts.length ? (
          <ActionForm action={A.savePosAction} submit="Crear" reset>
            {c}
            <div className="fields">
              <Field label="Título" name="title" required maxLength={120} />
              <Select label="Departamento" name="departmentId" options={deptOpts.slice(1)} />
              <Select label="Reporta a" name="parentPositionId" options={posOpts} />
              <Field label="Plazas previstas (opcional)" name="headcount" type="number" min={1} />
            </div>
          </ActionForm>
        ) : <p className="muted">Crea primero un departamento.</p>}
      </section>
    </>
  );
}
