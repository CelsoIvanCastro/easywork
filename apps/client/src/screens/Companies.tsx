import { ChevronDown, ChevronRight } from "lucide-react";
import { rpc } from "../api";
import { go, href } from "../router";
import { Async, Badge, Empty, Form, PageHead, fmtDate, useData } from "../ui";

type Mine = {
  companies: { id: string; tradeName: string; isOwner: boolean }[];
  requests: { id: string; company: string; status: string; createdAt: string; note: string | null }[];
  transfers: { id: string; company: string; expiresAt: string }[];
};
const ST: Record<string, [string, "ok" | "warn" | "bad" | undefined]> = { PENDING: ["Pendiente", "warn"], APPROVED: ["Aprobada", "ok"], REJECTED: ["Rechazada", "bad"], CANCELLED: ["Cancelada", undefined] };

export function Companies() {
  const q = useData(() => rpc<Mine>("companies.mine"), []);
  return (
    <>
      <PageHead title="Mis empresas" description="Elige una empresa para trabajar." />
      <Async q={q}>
        {(d) => (
          <>
            {d.companies.length ? (
              <ol className="agenda" aria-label="Empresas">
                {d.companies.map((c) => (
                  <li key={c.id}><a href={href(`c/${c.id}`)}><Badge tone={c.isOwner ? "ok" : undefined}>{c.isOwner ? "Propietario" : "Miembro"}</Badge><span className="what"><span>{c.tradeName}</span></span><ChevronRight className="icon go" aria-hidden="true" /></a></li>
                ))}
              </ol>
            ) : <Empty title="Aún no perteneces a ninguna empresa">Crea una o solicita unirte con el código que te comparta la empresa.</Empty>}
            {d.transfers.map((t) => (
              <section key={t.id} className="card" style={{ marginTop: 16 }}>
                <h2>Te ofrecen la propiedad de {t.company}</h2>
                <p className="small">Al aceptar serás el propietario y responderás por sus datos. Vence el {fmtDate(t.expiresAt)}.</p>
                <Form submit="Aceptar la propiedad" confirm="¿Aceptas ser el nuevo propietario?" onSubmit={async () => { await rpc("ownership.accept", { id: t.id }); q.reload(); return "Ahora eres el propietario."; }} />
              </section>
            ))}
            {d.requests.length > 0 && (
              <section className="card" style={{ marginTop: 16 }}>
                <h2>Mis solicitudes</h2>
                <ul className="stack" style={{ listStyle: "none", padding: 0, gap: 8 }}>
                  {d.requests.map((r) => <li key={r.id} className="row">{r.company} <Badge tone={ST[r.status][1]}>{ST[r.status][0]}</Badge> <span className="small muted">{fmtDate(r.createdAt)}</span></li>)}
                </ul>
              </section>
            )}
          </>
        )}
      </Async>
      <div className="choices">
        <details className="choice" open={q.data?.companies.length === 0}>
          <summary><span>Unirme con un código<small>La empresa decide si aprueba tu solicitud.</small></span><ChevronDown className="icon" aria-hidden="true" /></summary>
          <div className="body">
          <Form submit="Enviar solicitud" onSubmit={async (f) => {
            const code = String(f.get("code")).trim().toUpperCase();
            const c = await rpc<{ tradeName: string }>("join.lookup", { code });
            if (!window.confirm(`¿Solicitar unirte a ${c.tradeName}?`)) return "Cancelado.";
            await rpc("join.request", { code, message: String(f.get("message") ?? "") });
            q.reload();
            return `Solicitud enviada a ${c.tradeName}.`;
          }}>
            <label>Código<input name="code" required maxLength={10} autoCapitalize="characters" autoComplete="off" /></label>
            <label>Mensaje (opcional)<textarea name="message" maxLength={500} /></label>
          </Form>
          </div>
        </details>
        <details className="choice" open={q.data?.companies.length === 0}>
          <summary><span>Crear empresa<small>Solo lo mínimo; el resto lo completas después.</small></span><ChevronDown className="icon" aria-hidden="true" /></summary>
          <div className="body">
          <Form submit="Crear empresa" onSubmit={async (f) => {
            const r = await rpc<{ id: string }>("companies.create", Object.fromEntries(f));
            go(`c/${r.id}`);
            return "";
          }}>
            <label>Nombre comercial<input name="tradeName" required maxLength={120} /></label>
            <label>Nombre legal / razón social<input name="legalName" required maxLength={200} /></label>
          </Form>
          </div>
        </details>
      </div>
    </>
  );
}
