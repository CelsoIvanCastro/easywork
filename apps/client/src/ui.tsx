import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, RefreshCw, WifiOff } from "lucide-react";
import { ApiFailure, rpc } from "./api";
import { href } from "./router";

// ───── Datos asíncronos con estados reales (carga, error, sin conexión, reintento) ─────
export function useData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: ApiFailure; loading: boolean }>({ loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then(
      (data) => n === seq.current && setState({ data, loading: false }),
      (error: ApiFailure) => n === seq.current && setState({ error, loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}

export function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="stack" style={{ maxWidth: "none" }}>
      <span className="sr-only">Cargando…</span>
      {[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}
    </div>
  );
}

export function ErrorView({ error, retry }: { error: ApiFailure; retry?: () => void }) {
  const offline = error.error.code === "OFFLINE";
  return (
    <div className={`msg ${offline ? "warn" : "bad"}`} role="alert" style={{ alignItems: "center" }}>
      {offline && <WifiOff className="icon" aria-hidden="true" />}
      <span style={{ flex: 1 }}>{error.status === 404 ? "No existe o no tienes acceso." : error.message}</span>
      {retry && <button className="secondary" onClick={retry}><RefreshCw className="icon" aria-hidden="true" />Reintentar</button>}
    </div>
  );
}

/** Muestra carga/error y, con datos, delega el render. */
export function Async<T>({ q, children }: { q: { data?: T; error?: ApiFailure; loading: boolean; reload: () => void }; children: (d: T) => React.ReactNode }) {
  if (q.error) return <ErrorView error={q.error} retry={q.reload} />;
  if (q.data === undefined) return <Loading />;
  return <>{children(q.data)}</>;
}

export function PageHead({ title, folio, status, description, back, actions }: { title: React.ReactNode; folio?: string; status?: React.ReactNode; description?: React.ReactNode; back?: { to: string; label: string }; actions?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div className="titles">
        {back && <a className="crumb" href={href(back.to)}><ChevronLeft className="icon" aria-hidden="true" />{back.label}</a>}
        <div className="row" style={{ gap: 10 }}>
          <h1>{title}</h1>
          {folio && <span className="folio" translate="no">{folio}</span>}
          {status}
        </div>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export const Badge = ({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" }) => <span className={`badge ${tone ?? ""}`}>{children}</span>;
export const Empty = ({ title, children }: { title?: string; children?: React.ReactNode }) => (
  <div className="empty" role="status">{title && <strong>{title}</strong>}{children && <span>{children}</span>}</div>
);

// ───── Formularios: un envío a la vez, errores junto al campo y mensaje accesible ─────
export function Form({ onSubmit, submit, children, danger, confirm, className = "stack" }: { onSubmit: (f: FormData) => Promise<string | void>; submit: string; children?: React.ReactNode; danger?: boolean; confirm?: string; className?: string }) {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; fields?: Record<string, string> } | null>(null);
  const [reauth, setReauth] = useState(false);
  return (
    <>
      <form
        className={className}
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending) return;
          if (confirm && !window.confirm(confirm)) return;
          const fd = new FormData(e.currentTarget);
          const formEl = e.currentTarget;
          setPending(true);
          setMsg(null);
          try {
            const text = await onSubmit(fd);
            setMsg({ ok: true, text: text ?? "Guardado." });
            formEl.reset();
          } catch (err) {
            const f = err as ApiFailure;
            if (f.error?.code === "REAUTH") setReauth(true);
            setMsg({ ok: false, text: f.error?.message ?? "No se pudo completar.", fields: f.error?.fieldErrors });
          } finally {
            setPending(false);
          }
        }}
      >
        {children}
        {msg?.fields && <ul className="err">{Object.entries(msg.fields).map(([k, v]) => <li key={k}>{v}</li>)}</ul>}
        <div className="row">
          <button disabled={pending} className={danger ? "danger" : undefined}>{pending ? "Procesando…" : submit}</button>
        </div>
        {msg && <p className={`msg ${msg.ok ? "ok" : "bad"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      </form>
      {reauth && <Reauth onDone={() => setReauth(false)} />}
    </>
  );
}

export function Reauth({ onDone }: { onDone: () => void }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <strong>Confirma tu identidad</strong>
      <Form
        submit="Confirmar"
        onSubmit={async (f) => {
          await rpc("account.reauth", { password: String(f.get("password")), code: String(f.get("code") ?? "") || undefined });
          onDone();
          return "Identidad confirmada. Vuelve a enviar el formulario.";
        }}
      >
        <label>Contraseña<input type="password" name="password" autoComplete="current-password" required /></label>
        <label>Código de verificación (si lo tienes activo)<input name="code" inputMode="numeric" autoComplete="one-time-code" /></label>
      </Form>
    </div>
  );
}

export const fmtDate = (d?: string | null) => (d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d)) : "—");
export const fmtDateTime = (d?: string | null, tz = "America/Mexico_City") => (d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(d)) : "—");
export const fmtMoney = (v?: string | null, cur = "MXN") => (v == null ? "—" : `${new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v as unknown as number)} ${cur}`);
export const fmtQty = (v?: string | null) => (v == null ? "—" : String(Number(v)));
