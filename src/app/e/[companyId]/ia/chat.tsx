"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { AiAnswer } from "@/server/ai/assistant";
import { askAction } from "./actions";

type Turn = { role: "user" | "assistant"; text: string; answer?: AiAnswer };

// La conversación vive solo en esta pantalla y en esta empresa: al cambiar de empresa se empieza de cero.
export function Chat({ companyId, examples }: { companyId: string; examples: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const send = (question: string) => {
    if (!question.trim() || pending) return;
    const history = turns.filter((t) => !t.answer || t.answer.status === "ok").map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: "user", text: question }]);
    setQ("");
    start(async () => {
      const a = await askAction(companyId, question, history);
      setTurns((t) => [...t, { role: "assistant", text: a.text, answer: a }]);
    });
  };
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div aria-live="polite" className="stack">
        {turns.map((t, i) => (
          <div key={i} className="card" style={t.role === "user" ? { background: "var(--select)" } : undefined}>
            <strong>{t.role === "user" ? "Tú" : "IA"}</strong>
            <p style={{ whiteSpace: "pre-wrap" }}>{t.text}</p>
            {t.answer?.partial && <p className="msg info small">Respuesta parcial: hay más datos o se alcanzó un límite.</p>}
            {t.answer && t.answer.links.length > 0 && (
              <p className="small">Fuentes: {t.answer.links.map((l, j) => <span key={l.href}>{j > 0 && ", "}<Link href={l.href}>{l.label}</Link></span>)}</p>
            )}
          </div>
        ))}
        {pending && <p className="muted" role="status">Consultando…</p>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="stack">
        <label>Tu pregunta<textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} rows={3} /></label>
        <div className="row">
          <button disabled={pending || !q.trim()}>Preguntar</button>
          {turns.length > 0 && <button type="button" className="secondary" onClick={() => setTurns([])}>Nueva conversación</button>}
        </div>
      </form>
      <div className="small">
        Ejemplos: {examples.map((x) => <button key={x} type="button" className="secondary" style={{ margin: 2, minHeight: 32 }} onClick={() => send(x)}>{x}</button>)}
      </div>
    </div>
  );
}
