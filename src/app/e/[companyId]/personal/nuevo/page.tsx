import { allowOr404, getCtx } from "@/server/web";
import { can } from "@/server/context";
import { listDepartments, listPositions } from "@/server/services/structure";
import { ActionForm, Area, Field, Select } from "@/components/ActionForm";
import { createEmployeeAction } from "../actions";

export default async function Nuevo({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  allowOr404(can(ctx, "employees.create"));
  const [depts, positions] = await Promise.all([listDepartments(ctx), listPositions(ctx)]);
  const personal = can(ctx, "employees.personal.edit");
  return (
    <>
      <h1>Nuevo expediente</h1>
      <p className="muted">Puedes guardar un borrador con solo el nombre y completar el resto después. Los pendientes aparecerán en el expediente.</p>
      <ActionForm action={createEmployeeAction} submit="Guardar expediente">
        <input type="hidden" name="c" value={companyId} />
        <div className="fields">
          <Field label="Nombre(s)" name="firstName" required maxLength={80} />
          <Field label="Apellidos" name="lastName" maxLength={120} />
          <Field label="Correo" name="email" type="email" maxLength={200} />
          <Field label="Fecha de ingreso" name="hireDate" type="date" />
          <Select label="Departamento" name="departmentId" options={[["", "Sin asignar"], ...depts.map((d) => [d.id, d.name] as [string, string])]} />
          <Select label="Puesto" name="positionId" options={[["", "Sin asignar"], ...positions.map((p) => [p.id, `${p.title} (${p.department.name})`] as [string, string])]} />
        </div>
        {personal && (
          <details>
            <summary>Agregar datos personales (opcional)</summary>
            <div className="fields">
              <Field label="Fecha de nacimiento" name="birthDate" type="date" />
              <Field label="Teléfono" name="phone" type="tel" />
              <Field label="CURP" name="curp" maxLength={18} autoCapitalize="characters" />
              <Field label="RFC" name="rfc" maxLength={13} autoCapitalize="characters" />
              <Field label="NSS" name="nss" maxLength={11} inputMode="numeric" />
            </div>
            <Area label="Domicilio" name="address" maxLength={400} />
          </details>
        )}
      </ActionForm>
    </>
  );
}
