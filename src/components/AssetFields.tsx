import { CURRENCIES } from "@/lib/catalogs";
import { Area, Field, Select } from "./ActionForm";

type Asset = Partial<{
  name: string; categoryId: string; serial: string | null; brand: string | null; model: string | null; year: number | null; acquiredOn: Date | null;
  supplierId: string | null; warrantyUntil: Date | null; location: string | null; usageKind: string; responsibleLabel: string | null; notes: string | null;
  costAmount: { toString(): string } | null; costCurrency: string | null;
}>;
const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");

/** Captura básica breve; el resto en "Agregar más información". */
export function AssetFields({ a = {}, cats, suppliers, costs, isNew }: { a?: Asset; cats: [string, string][]; suppliers: [string, string][]; costs: boolean; isNew?: boolean }) {
  return (
    <>
      <div className="fields">
        <Field label="Nombre" name="name" defaultValue={a.name} required maxLength={160} />
        <Select label="Categoría" name="categoryId" options={cats} defaultValue={a.categoryId} />
        <Field label="Número de serie" name="serial" defaultValue={a.serial ?? ""} maxLength={120} />
        <Select label="Tipo de uso" name="usageKind" options={[["NONE", "Sin medición"], ["KM", "Kilometraje"], ["HOURS", "Horas de uso"]]} defaultValue={a.usageKind ?? "NONE"} />
        {isNew && <Field label="Lectura inicial (si aplica)" name="initialReading" inputMode="decimal" />}
      </div>
      <details>
        <summary>Agregar más información</summary>
        <div className="fields">
          <Field label="Marca" name="brand" defaultValue={a.brand ?? ""} />
          <Field label="Modelo" name="model" defaultValue={a.model ?? ""} />
          <Field label="Año" name="year" type="number" min={1900} max={2100} defaultValue={a.year ?? ""} />
          <Field label="Fecha de compra" name="acquiredOn" type="date" defaultValue={d(a.acquiredOn)} />
          <Select label="Proveedor" name="supplierId" options={[["", "—"], ...suppliers]} defaultValue={a.supplierId ?? ""} />
          <Field label="Garantía hasta" name="warrantyUntil" type="date" defaultValue={d(a.warrantyUntil)} />
          <Field label="Ubicación general" name="location" defaultValue={a.location ?? ""} />
          <Field label="Responsable (informativo)" name="responsibleLabel" defaultValue={a.responsibleLabel ?? ""} />
          {costs && <Field label="Coste" name="costAmount" inputMode="decimal" defaultValue={a.costAmount?.toString() ?? ""} />}
          {costs && <Select label="Moneda" name="costCurrency" options={CURRENCIES.map((c) => [c, c] as [string, string])} defaultValue={a.costCurrency ?? "MXN"} />}
        </div>
        <Area label="Notas" name="notes" defaultValue={a.notes ?? ""} maxLength={2000} />
      </details>
    </>
  );
}
