import { useRef, useState } from "react";
import { rpc } from "../api";
import { href } from "../router";
import { Async, Badge, Empty, Form, PageHead, fmtDateTime, useData } from "../ui";
import { toClient, useCompany } from "./company";

type Member = { id: string; status: string; fullAccess: boolean; isOwner: boolean; user: { name: string; lastName: string; email: string; twoFactorEnabled: boolean | null }; employee: { position: { title: string } | null } | null };
type Grant = { id: string; permission: string; effect: string; scope: string; subjectType: string };
export function Members() {
  const { c } = useCompany();
  const members = useData(() => rpc<Member[]>("members.list", {}, c.id), [c.id]);
  const grants = useData(() => rpc<Grant[]>("grants.list", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Miembros y permisos" description="Todo está denegado por defecto. Los cambios requieren confirmar tu identidad y verificación en dos pasos." />
      <Async q={members}>
        {(list) => (
          <ol className="agenda">
            {list.map((m) => (
              <li key={m.id}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "12px 16px", alignItems: "center" }}>
                  <span className="what"><span>{m.user.name} {m.user.lastName} {m.isOwner && <Badge tone="ok">Propietario</Badge>} {m.fullAccess && <Badge tone="warn">Acceso completo</Badge>}</span><small>{m.user.email}{m.employee?.position ? ` · ${m.employee.position.title}` : ""}</small></span>
                  {!m.isOwner && m.status === "ACTIVE" && (
                    <Form className="" submit={m.fullAccess ? "Retirar acceso completo" : "Dar acceso completo"} confirm={m.fullAccess ? undefined : "El acceso completo permite operar todos los módulos (no permisos ni propiedad). ¿Continuar?"}
                      onSubmit={async () => { await rpc("members.fullAccess", { membershipId: m.id, enabled: !m.fullAccess }, c.id); members.reload(); return "Actualizado."; }} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Async>
      <h2>Concesiones y restricciones</h2>
      <Async q={grants}>
        {(list) => list.length ? (
          <ul className="stack" style={{ listStyle: "none", padding: 0, maxWidth: "none", gap: 8 }}>
            {list.map((g) => (
              <li key={g.id} className="spread card" style={{ marginBottom: 0 }}>
                <span>{g.effect === "ALLOW" ? <Badge tone="ok">Permitir</Badge> : <Badge tone="bad">Denegar</Badge>} {g.permission} · {g.scope} · {g.subjectType}</span>
                <Form className="" submit="Quitar" onSubmit={async () => { await rpc("grants.remove", { id: g.id }, c.id); grants.reload(); return "Quitada."; }} />
              </li>
            ))}
          </ul>
        ) : <Empty>No hay concesiones.</Empty>}
      </Async>
    </>
  );
}

export function Modules() {
  const { c, reload } = useCompany();
  const labels: Record<string, string> = { documents: "Documentos", inventory: "Inventario y activos", suppliers: "Proveedores", purchases: "Compras", maintenance: "Mantenimiento", announcements: "Avisos", ai: "IA empresarial" };
  return (
    <>
      <PageHead title="Módulos" description="Desactivar un módulo oculta sus funciones y pausa sus alertas; nunca borra datos." />
      <ol className="agenda">
        {Object.entries(labels).map(([k, l]) => (
          <li key={k}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "12px 16px", alignItems: "center" }}>
              <span className="what"><span>{l}</span></span>
              <Form className="" submit={c.modules[k] ? "Desactivar" : "Activar"} onSubmit={async () => { await rpc("modules.set", { module: k, enabled: !c.modules[k] }, c.id); reload(); return ""; }} />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

type AuditRow = { id: string; createdAt: string; actorLabel: string; action: string; summary: string | null; redacted: boolean; result: string };
export function Audit() {
  const { c } = useCompany();
  const q = useData(() => rpc<{ rows: AuditRow[] }>("audit.list", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Auditoría" description="Registro de solo lectura." />
      <Async q={q}>
        {(d) => d.rows.length ? (
          <ul className="stack" style={{ listStyle: "none", padding: 0, maxWidth: "none", gap: 6 }}>
            {d.rows.map((r) => <li key={r.id} className="small">{fmtDateTime(r.createdAt, c.timezone)} · {r.actorLabel} · {r.action}{r.result !== "SUCCESS" && ` (${r.result})`}{r.redacted ? " · detalle oculto" : r.summary ? ` — ${r.summary}` : ""}</li>)}
          </ul>
        ) : <Empty>Sin eventos.</Empty>}
      </Async>
    </>
  );
}

type Ann = { id: string; title: string; body: string; authorLabel: string; publishedAt: string; allCompany: boolean };
export function Announcements() {
  const { c } = useCompany();
  const q = useData(() => rpc<{ rows: Ann[]; publisher: boolean }>("announcements.list", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Avisos" />
      <Async q={q}>
        {(d) => (
          <>
            {d.rows.length ? d.rows.map((a) => (
              <article key={a.id} className="card">
                <h2>{a.title}</h2>
                <p className="small muted">{a.authorLabel} · {fmtDateTime(a.publishedAt, c.timezone)}</p>
                <p style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
              </article>
            )) : <Empty title="No hay avisos para ti" />}
            {d.publisher && (
              <section className="card">
                <h2>Publicar aviso para toda la empresa</h2>
                <Form submit="Publicar" onSubmit={async (f) => { await rpc("announcements.publish", { title: f.get("title"), body: f.get("body"), audience: "all" }, c.id); q.reload(); return "Aviso publicado."; }}>
                  <label>Título<input name="title" required maxLength={160} /></label>
                  <label>Contenido<textarea name="body" required maxLength={10000} /></label>
                </Form>
              </section>
            )}
          </>
        )}
      </Async>
    </>
  );
}

type Answer = { status: string; text: string; links: { label: string; href: string }[]; partial: boolean };
export function Assistant({ base }: { base: string }) {
  const { c } = useCompany();
  const [turns, setTurns] = useState<{ q: string; a?: Answer }[]>([]);
  const [pending, setPending] = useState(false);
  const cancelled = useRef(false);
  void base;
  const ask = async (question: string) => {
    if (!question.trim() || pending) return;
    cancelled.current = false;
    setPending(true);
    setTurns((t) => [...t, { q: question }]);
    try {
      const history = turns.map((t) => ({ role: "user" as const, text: t.q }));
      const a = await rpc<Answer>("ai.ask", { question, history }, c.id);
      if (!cancelled.current) setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "No disponible.";
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: { status: "unavailable", text: msg, links: [], partial: false } } : x)));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <PageHead title="Consultas con IA" description={`Responde con datos de ${c.tradeName} a los que tienes acceso. Solo consulta; verifica en las fuentes.`} />
      <div className="stack" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className="card" style={{ marginBottom: 0 }}>
            <p><strong>Tú:</strong> {t.q}</p>
            {t.a ? (
              <>
                <p style={{ whiteSpace: "pre-wrap" }}>{t.a.text}</p>
                {t.a.partial && <p className="msg info small">Respuesta parcial.</p>}
                {t.a.links.length > 0 && <p className="small">Fuentes: {t.a.links.map((l, j) => <span key={l.href}>{j > 0 && ", "}<a href={href(toClient(l.href))}>{l.label}</a></span>)}</p>}
              </>
            ) : <p className="muted">Consultando…</p>}
          </div>
        ))}
      </div>
      <form className="stack" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); e.currentTarget.reset(); ask(String(f.get("q"))); }}>
        <label>Tu pregunta<textarea name="q" maxLength={1000} rows={3} required /></label>
        <div className="row">
          <button disabled={pending}>{pending ? "Consultando…" : "Preguntar"}</button>
          {pending && <button type="button" className="secondary" onClick={() => { cancelled.current = true; setPending(false); }}>Cancelar</button>}
          {turns.length > 0 && !pending && <button type="button" className="secondary" onClick={() => setTurns([])}>Nueva conversación</button>}
        </div>
      </form>
    </>
  );
}
