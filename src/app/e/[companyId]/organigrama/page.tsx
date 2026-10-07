import Link from "next/link";
import { getCtx } from "@/server/web";
import { orgChart, type OrgNode } from "@/server/services/structure";
import { EMPLOYEE_STATUS } from "@/lib/catalogs";
import { Empty } from "@/components/ui";

export default async function Organigrama({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  const { roots, unassigned, openable } = await orgChart(ctx);
  const person = (o: { id: string; name: string; status: string }) => (
    <span key={o.id}>
      {openable.has(o.id) ? <Link href={`/e/${companyId}/personal/${o.id}`}>{o.name}</Link> : o.name}
      {o.status !== "ACTIVE" && <span className="small muted"> ({EMPLOYEE_STATUS[o.status as keyof typeof EMPLOYEE_STATUS]})</span>}
    </span>
  );
  const Node = ({ n }: { n: OrgNode }) => {
    const vacant = n.headcount ? Math.max(0, n.headcount - n.occupants.length) : n.occupants.length ? 0 : 1;
    return (
      <li>
        <details open>
          <summary className="node">
            <strong>{n.title}</strong> <span className="small muted">· {n.department}</span>
            <div className="small">
              {n.occupants.length ? n.occupants.map((o, i) => <span key={o.id}>{i > 0 && ", "}{person(o)}</span>) : null}
              {vacant > 0 && <span className="badge warn">{vacant} vacante{vacant > 1 ? "s" : ""}</span>}
            </div>
          </summary>
          {n.children.length > 0 && <ul>{n.children.map((c) => <Node key={c.id} n={c} />)}</ul>}
        </details>
      </li>
    );
  };
  return (
    <>
      <h1>Organigrama</h1>
      <p className="muted small">Se genera a partir de los puestos y sus ocupantes actuales. No incluye exempleados.</p>
      {roots.length ? <div className="tree card"><ul>{roots.map((n) => <Node key={n.id} n={n} />)}</ul></div> : <Empty>Aún no hay puestos definidos.</Empty>}
      {unassigned.length > 0 && (
        <section className="card">
          <h2>Personas sin puesto asignado</h2>
          <ul>{unassigned.map((u) => <li key={u.id}>{person(u)} {u.department && <span className="muted small">· {u.department}</span>}</li>)}</ul>
        </section>
      )}
    </>
  );
}
