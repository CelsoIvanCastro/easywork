import { CheckCircle2, CircleDashed } from "lucide-react";

const SECTION_OF = (item: string) =>
  item.startsWith("Documento:") ? "Documentos" : item.startsWith("Cuenta bancaria") ? "Banco" : ["Departamento", "Puesto"].includes(item) ? "Datos laborales" : "Datos personales";

/** Completitud del expediente agrupada por sección, con el detalle de lo que falta a un clic. */
export function Completeness({ required, missing, hrefFor }: { required: string[]; missing: string[]; hrefFor: (section: string) => string }) {
  const sections = ["Datos personales", "Datos laborales", "Banco", "Documentos"]
    .map((name) => {
      const req = required.filter((r) => SECTION_OF(r) === name);
      const miss = missing.filter((m) => SECTION_OF(m) === name);
      return { name, total: req.length, done: req.length - miss.length, miss };
    })
    .filter((s) => s.total > 0);
  if (!sections.length) return null;
  return (
    <ul className="complete" aria-label="Completitud del expediente">
      {sections.map((s) => {
        const full = s.done === s.total;
        return (
          <li key={s.name}>
            <div className="head">
              <span className="row" style={{ gap: 6 }}>
                {full ? <CheckCircle2 className="icon" style={{ color: "var(--ok)" }} aria-hidden="true" /> : <CircleDashed className="icon" style={{ color: "var(--warn)" }} aria-hidden="true" />}
                {s.name}
              </span>
              <span className="small muted num">{s.done} de {s.total}</span>
            </div>
            <div className="bar" aria-hidden="true"><i className={full ? "full" : ""} style={{ width: `${Math.round((s.done / s.total) * 100)}%` }} /></div>
            {!full && (
              <details>
                <summary>Falta {s.miss.length}</summary>
                <ul>{s.miss.map((m) => <li key={m}>{m.replace(/^Documento: /, "")}</li>)}</ul>
                <a className="small" href={hrefFor(s.name)}>Completar</a>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
