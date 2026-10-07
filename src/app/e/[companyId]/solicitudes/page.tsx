import { allowOr404, getCtx } from "@/server/web";
import { can } from "@/server/context";
import { db } from "@/server/db";
import { listJoinRequests } from "@/server/services/companies";
import { listDepartments, listPositions } from "@/server/services/structure";
import { ActionForm, Field, Select } from "@/components/ActionForm";
import { Empty, fmtDateTime, Tabs } from "@/components/ui";
import * as A from "./actions";

export default async function Solicitudes({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ status?: string }> }) {
  const { companyId } = await params;
  const { status = "PENDING" } = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(can(ctx, "joinRequests.review"));
  const st = (["PENDING", "APPROVED", "REJECTED"].includes(status) ? status : "PENDING") as "PENDING";
  const [reqs, depts, positions, unlinked] = await Promise.all([
    listJoinRequests(ctx, st),
    listDepartments(ctx),
    listPositions(ctx),
    db.employee.findMany({ where: { companyId, userId: null, status: { not: "FORMER" } }, select: { id: true, number: true, firstName: true, lastName: true }, take: 200, orderBy: { lastName: "asc" } }),
  ]);
  const b = `/e/${companyId}/solicitudes`;
  return (
    <>
      <h1>Solicitudes de ingreso</h1>
      <Tabs items={[[`${b}?status=PENDING`, "Pendientes"], [`${b}?status=APPROVED`, "Aprobadas"], [`${b}?status=REJECTED`, "Rechazadas"]]} current={`${b}?status=${st}`} />
      {reqs.length === 0 && <Empty>No hay solicitudes.</Empty>}
      {reqs.map((r) => (
        <section key={r.id} className="card">
          <strong>{r.user.name} {r.user.lastName}</strong> <span className="muted">· {r.user.email} · {r.user.phone}</span>
          <div className="small muted">{fmtDateTime(r.createdAt, ctx.company.timezone)}</div>
          {r.message && <p>“{r.message}”</p>}
          {st === "PENDING" && (
            <div className="grid">
              <ActionForm action={A.approveAction} submit="Aprobar">
                <input type="hidden" name="c" value={companyId} />
                <input type="hidden" name="id" value={r.id} />
                <Select label="Expediente" name="mode" options={[["new", "Crear expediente nuevo"], ["link", "Vincular a expediente existente sin cuenta"]]} />
                <Select label="Expediente existente (si vinculas)" name="employeeId" options={[["", "—"], ...unlinked.map((e) => [e.id, `${e.number} ${e.firstName} ${e.lastName}`] as [string, string])]} />
                <Select label="Departamento" name="departmentId" options={[["", "Sin asignar"], ...depts.map((d) => [d.id, d.name] as [string, string])]} />
                <Select label="Puesto" name="positionId" options={[["", "Sin asignar"], ...positions.map((p) => [p.id, `${p.title} (${p.department.name})`] as [string, string])]} />
                <Field label="Fecha de ingreso" name="hireDate" type="date" />
                <p className="small muted">La vinculación nunca es automática por coincidencia de nombre: elige el expediente correcto.</p>
              </ActionForm>
              <ActionForm action={A.rejectAction} submit="Rechazar">
                <input type="hidden" name="c" value={companyId} />
                <input type="hidden" name="id" value={r.id} />
                <Field label="Motivo (visible para la persona)" name="note" maxLength={300} />
              </ActionForm>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
