import Link from "next/link";
import { allowOr404, getCtx } from "@/server/web";
import { db } from "@/server/db";
import { effectivePermissionsOf, listMembers } from "@/server/services/companies";
import { listDepartments, listPositions } from "@/server/services/structure";
import { GRANTABLE, PERMISSIONS, type Permission } from "@/server/permissions";
import { ActionForm, Select } from "@/components/ActionForm";
import { Badge, Empty } from "@/components/ui";
import * as A from "./actions";

const SCOPE = { OWN: "Propios", DEPARTMENTS: "Departamentos", COMPANY: "Toda la empresa" } as const;

export default async function Permisos({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ m?: string }> }) {
  const { companyId } = await params;
  const { m } = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(ctx.isOwner);
  const [members, depts, positions, grants] = await Promise.all([
    listMembers(ctx),
    listDepartments(ctx),
    listPositions(ctx),
    db.grant.findMany({ where: { companyId }, include: { membership: { include: { user: { select: { name: true, lastName: true } } } }, position: true, department: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const selected = members.find((x) => x.id === m);
  const effective = selected && !selected.isOwner ? await effectivePermissionsOf(ctx, selected.id) : null;
  const c = <input type="hidden" name="c" value={companyId} />;
  const subjectLabel = (g: (typeof grants)[number]) =>
    g.subjectType === "MEMBER" ? `${g.membership?.user.name} ${g.membership?.user.lastName}` : g.subjectType === "POSITION" ? `Puesto: ${g.position?.title}` : `Departamento: ${g.department?.name}`;
  return (
    <>
      <h1>Miembros y permisos</h1>
      <p className="small muted">
        Todo está denegado por defecto. Se suman las concesiones directas y las de su puesto y departamento actuales; las restricciones (“Denegar”)
        prevalecen siempre, incluso sobre el acceso completo. El propietario no puede ser restringido. Los cambios requieren confirmar tu identidad.
      </p>
      <section className="card">
        <h2>Miembros</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Persona</th><th>Puesto</th><th>Estado</th><th>2FA</th><th>Acceso completo</th><th></th></tr></thead>
            <tbody>
              {members.map((x) => (
                <tr key={x.id}>
                  <td>{x.user.name} {x.user.lastName}<div className="small muted">{x.user.email}</div></td>
                  <td>{x.employee?.position?.title ?? "—"} <span className="small muted">{x.employee?.department?.name}</span></td>
                  <td>{x.isOwner ? <Badge tone="ok">Propietario</Badge> : x.status === "ACTIVE" ? (x.employee?.status === "ACTIVE" || !x.employee ? "Activo" : x.employee.status) : <Badge>{x.status === "REVOKED" ? "Sin acceso" : "Suspendido"}</Badge>}</td>
                  <td>{x.user.twoFactorEnabled ? "Sí" : "No"}</td>
                  <td>
                    {x.isOwner ? "—" : x.status === "ACTIVE" && (
                      <ActionForm
                        action={A.fullAccessAction}
                        submit={x.fullAccess ? "Retirar" : "Conceder"}
                        className=""
                        confirm={x.fullAccess ? undefined : "El acceso completo operativo permite consultar y operar todos los módulos (salvo permisos y acciones de propietario). No transfiere la propiedad. ¿Continuar?"}
                      >
                        {c}<input type="hidden" name="membershipId" value={x.id} /><input type="hidden" name="enabled" value={x.fullAccess ? "0" : "1"} />
                      </ActionForm>
                    )}
                  </td>
                  <td>{!x.isOwner && <Link href={`?m=${x.id}`}>Permisos efectivos</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected && (
        <section className="card">
          <h2>Permisos efectivos de {selected.user.name} {selected.user.lastName}</h2>
          {!effective ? <p className="muted">Sin acceso activo a la empresa.</p> : effective.size === 0 ? <Empty>Sin permisos (solo su propio expediente y avisos).</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Permiso</th><th>Alcance</th><th>Origen</th></tr></thead>
                <tbody>
                  {[...effective.entries()].map(([p, e]) => (
                    <tr key={p}>
                      <td>{PERMISSIONS[p].label}</td>
                      <td>
                        {e.company ? "Toda la empresa" : [...e.departments].map((d) => deptName.get(d) ?? d).join(", ")}
                        {e.own && " · propios"}
                        {e.excluded.size > 0 && <span className="small muted"> excepto {[...e.excluded].map((d) => deptName.get(d) ?? d).join(", ")}</span>}
                      </td>
                      <td className="small">{e.origins.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted">Para retirar un acceso heredado de un puesto o departamento, elimina esa concesión del grupo o añade una restricción “Denegar” a la persona.</p>
        </section>
      )}
      <section className="card">
        <h2>Concesiones y restricciones</h2>
        {grants.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Para</th><th>Permiso</th><th>Efecto</th><th>Alcance</th><th></th></tr></thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id}>
                    <td>{subjectLabel(g)}</td>
                    <td>{PERMISSIONS[g.permission as Permission]?.label ?? g.permission}</td>
                    <td>{g.effect === "ALLOW" ? <Badge tone="ok">Permitir</Badge> : <Badge tone="bad">Denegar</Badge>}</td>
                    <td>{SCOPE[g.scope]}{g.scope === "DEPARTMENTS" && `: ${g.scopeDepartmentIds.map((d) => deptName.get(d) ?? "(archivado)").join(", ")}`}</td>
                    <td>
                      <ActionForm action={A.removeGrantAction} submit="Quitar" className="">{c}<input type="hidden" name="grantId" value={g.id} /></ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No hay concesiones. Nadie, salvo el propietario, tiene permisos administrativos.</Empty>}
        <h3>Nueva concesión</h3>
        <ActionForm action={A.addGrantAction} submit="Guardar concesión" confirm="Vas a modificar permisos. Revisa el efecto antes de confirmar.">
          {c}
          <div className="fields">
            <Select
              label="Destinatario"
              name="subject"
              options={[
                ...members.filter((x) => !x.isOwner && x.status === "ACTIVE").map((x) => [`MEMBER:${x.id}`, `Persona: ${x.user.name} ${x.user.lastName}`] as [string, string]),
                ...positions.map((p) => [`POSITION:${p.id}`, `Puesto: ${p.title}`] as [string, string]),
                ...depts.map((d) => [`DEPARTMENT:${d.id}`, `Departamento: ${d.name}`] as [string, string]),
              ]}
            />
            <Select label="Permiso" name="permission" options={GRANTABLE.map((p) => [p, `${PERMISSIONS[p].group}: ${PERMISSIONS[p].label}`] as [string, string])} />
            <Select label="Efecto" name="effect" options={[["ALLOW", "Permitir"], ["DENY", "Denegar (restricción)"]]} />
            <Select label="Alcance" name="scope" options={[["COMPANY", "Toda la empresa"], ["DEPARTMENTS", "Departamentos seleccionados"], ["OWN", "Solo sus propios datos"]]} />
          </div>
          <fieldset>
            <legend>Departamentos (si el alcance es por departamentos)</legend>
            <div className="fields">
              {depts.map((d) => <label key={d.id} className="inline"><input type="checkbox" name="scopeDepartmentIds" value={d.id} /> {d.name}</label>)}
            </div>
          </fieldset>
          <p className="small muted">El alcance solo aplica a permisos de personal y auditoría; el resto es de toda la empresa.</p>
        </ActionForm>
      </section>
    </>
  );
}
