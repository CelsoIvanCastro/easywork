import { Area, Field } from "./ActionForm";

type S = Partial<Record<"name" | "legalName" | "rfc" | "email" | "phone" | "contactName" | "address" | "categories" | "notes", string | null>>;
export function SupplierFields({ s = {} }: { s?: S }) {
  return (
    <>
      <div className="fields">
        <Field label="Nombre" name="name" defaultValue={s.name ?? ""} required maxLength={160} />
        <Field label="Razón social" name="legalName" defaultValue={s.legalName ?? ""} />
        <Field label="RFC" name="rfc" defaultValue={s.rfc ?? ""} maxLength={13} />
        <Field label="Contacto" name="contactName" defaultValue={s.contactName ?? ""} />
        <Field label="Correo" name="email" type="email" defaultValue={s.email ?? ""} />
        <Field label="Teléfono" name="phone" defaultValue={s.phone ?? ""} />
        <Field label="Productos o servicios" name="categories" defaultValue={s.categories ?? ""} />
      </div>
      <Area label="Domicilio" name="address" defaultValue={s.address ?? ""} maxLength={300} />
      <Area label="Notas" name="notes" defaultValue={s.notes ?? ""} maxLength={2000} />
    </>
  );
}
