import Link from "next/link";
import { getCtx } from "@/server/web";
import { universalSearch } from "@/server/services/search";
import { Empty } from "@/components/ui";

export default async function Buscar({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ q?: string }> }) {
  const { companyId } = await params;
  const { q = "" } = await searchParams;
  const ctx = await getCtx(companyId);
  const r = await universalSearch(ctx, q);
  return (
    <>
      <h1>Búsqueda: “{r.q}”</h1>
      {r.q.length < 2 && <p className="muted">Escribe al menos 2 caracteres.</p>}
      {r.restricted && <p className="msg info">No tienes permiso para buscar por datos personales sensibles.</p>}
      {r.q.length >= 2 && r.sections.length === 0 && <Empty>Sin resultados que puedas ver.</Empty>}
      {r.sections.map((s) => (
        <section key={s.title} className="card">
          <h2>{s.title}</h2>
          <ul>{s.hits.map((h) => <li key={h.href}><Link href={h.href}>{h.label}</Link>{h.detail && <span className="muted small"> · {h.detail}</span>}</li>)}</ul>
          {s.more && <p className="small muted">Hay más resultados: afina la búsqueda o usa el listado del módulo.</p>}
        </section>
      ))}
    </>
  );
}
