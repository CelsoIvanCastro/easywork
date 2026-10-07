import Link from "next/link";
import { allowOr404, getCtx, load } from "@/server/web";
import { can } from "@/server/context";
import { listRecords, MAINTENANCE_POLICY, planBoard } from "@/server/services/maintenance";
import { MAINT_STATUS } from "@/lib/catalogs";
import { Badge, Empty, fmtCivil, fmtMoney, fmtQty, Pager, Tabs } from "@/components/ui";

const STATE = { overdue: ["Vencido", "bad"], soon: ["Próximo", "warn"], unknown: ["Sin confirmar", "warn"], ok: ["Al corriente", "ok"] } as const;
type SP = { view?: string; state?: string; status?: string; from?: string; to?: string; page?: string };

export default async function Mantenimiento({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<SP> }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const ctx = await getCtx(companyId);
  allowOr404(ctx.modules.has("maintenance") && can(ctx, "maintenance.read"));
  const b = `/e/${companyId}/mantenimiento`;
  const view = sp.view === "registros" ? "registros" : "planes";
  return (
    <>
      <h1>Mantenimiento</h1>
      <Tabs items={[[`${b}`, "Planes y vencimientos"], [`${b}?view=registros`, "Registros"]]} current={view === "planes" ? b : `${b}?view=registros`} />
      {view === "planes" ? <Board companyId={companyId} state={sp.state} /> : <Records companyId={companyId} sp={sp} />}
    </>
  );

  async function Board({ companyId, state }: { companyId: string; state?: string }) {
    const rows = await load(planBoard(ctx, (["overdue", "soon", "unknown", "ok"] as const).find((s) => s === state)));
    return (
      <>
        <p className="small muted">{MAINTENANCE_POLICY} Un activo sin lectura reciente aparece como “sin confirmar”.</p>
        <div className="row">
          <Link href={b}>Todos</Link>
          {Object.entries(STATE).map(([k, [l]]) => <Link key={k} href={`${b}?state=${k}`}>{l}</Link>)}
        </div>
        {rows.length === 0 ? <Empty>No hay planes en este estado.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Estado</th><th>Activo</th><th>Plan</th><th>Último servicio</th><th>Siguiente</th><th>Detalle</th></tr></thead>
              <tbody>
                {rows.map(({ plan: p, eval: e }) => (
                  <tr key={p.id}>
                    <td><Badge tone={STATE[e.state][1]}>{STATE[e.state][0]}</Badge></td>
                    <td><Link href={`/e/${companyId}/activos/${p.asset.id}`}>{p.asset.code} {p.asset.name}</Link></td>
                    <td>{p.name}</td>
                    <td>{fmtCivil(p.lastServiceOn)}{p.lastServiceReading ? ` · ${fmtQty(p.lastServiceReading)}` : ""}</td>
                    <td>{p.nextDueOn ? fmtCivil(p.nextDueOn) : ""}{p.nextDueReading ? ` · ${fmtQty(p.nextDueReading)} ${p.asset.usageKind === "KM" ? "km" : "h"}` : ""}</td>
                    <td className="small">{e.reasons.join("; ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  async function Records({ companyId, sp }: { companyId: string; sp: SP }) {
    const list = await load(listRecords(ctx, { status: sp.status, from: sp.from, to: sp.to, page: Number(sp.page ?? 1) }));
    const qs = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;
    return (
      <>
        <form className="card fields" role="search">
          <input type="hidden" name="view" value="registros" />
          <label>Estado<select name="status" defaultValue={sp.status ?? ""}><option value="">Todos</option>{Object.entries(MAINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Desde<input type="date" name="from" defaultValue={sp.from} /></label>
          <label>Hasta<input type="date" name="to" defaultValue={sp.to} /></label>
          <div className="row"><button>Filtrar</button></div>
        </form>
        {list.rows.length === 0 ? <Empty>Sin registros.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Activo</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th>Coste</th></tr></thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/e/${companyId}/mantenimiento/${r.id}`}>{r.code}</Link></td>
                    <td>{r.asset.code} {r.asset.name}</td>
                    <td>{r.type === "PREVENTIVE" ? "Preventivo" : "Correctivo"}</td>
                    <td>{MAINT_STATUS[r.status]}</td>
                    <td>{fmtCivil(r.performedOn ?? r.scheduledOn)}</td>
                    <td>{r.costAmount ? fmtMoney(r.costAmount, r.costCurrency ?? "MXN") : "—"}</td>
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
}
