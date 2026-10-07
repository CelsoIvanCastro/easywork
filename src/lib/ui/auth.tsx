"use client";
// Componentes de acceso compartidos por la web (Next) y el cliente empaquetado (Vite).
// Solo React: sin dependencias de Next ni del servidor. Estilos en src/app/globals.css (.auth-*).
import { useId, useState, type ReactNode } from "react";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 4h10M3 8h7M3 12h10" /></svg>
    </span>
  );
}

export const Brand = ({ href }: { href?: string }) =>
  href ? (
    <a className="brand" href={href} translate="no"><BrandMark />EasyWork</a>
  ) : (
    <span className="brand" translate="no"><BrandMark />EasyWork</span>
  );

/** Composición geométrica discreta (sin datos ni imágenes). */
function Figure() {
  return (
    <svg className="figure" viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeOpacity="0.28">
        <rect x="40" y="40" width="320" height="320" rx="28" />
        <rect x="90" y="90" width="220" height="220" rx="20" />
        <path d="M40 200h320M200 40v320" strokeOpacity="0.16" />
      </g>
      <rect x="140" y="140" width="120" height="120" rx="16" fill="currentColor" fillOpacity="0.08" />
      <circle cx="260" cy="140" r="6" fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}

/** Marco de acceso: zona de identidad (escritorio amplio) + zona de formulario. Se desplaza; nunca corta el contenido. */
export function AuthShell({ children, legal, homeHref }: { children: ReactNode; legal: ReactNode; homeHref?: string }) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="aside-inner">
          <Brand href={homeHref} />
          <div className="statement">
            <p>Personal, documentos y operación de tu empresa, en un solo lugar.</p>
            <p className="small">Permisos por persona y departamento, historial de cada cambio y documentos privados con sus versiones.</p>
          </div>
          <Figure />
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-panel">
          <Brand href={homeHref} />
          {children}
          <nav className="auth-legal" aria-label="Información legal">{legal}</nav>
        </div>
      </main>
    </div>
  );
}

export function AuthHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="auth-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

/** Campo de contraseña con mostrar/ocultar. El botón nunca envía el formulario. */
export function PasswordField({ label, name, autoComplete, minLength, maxLength = 128, aside, hint }: { label: string; name: string; autoComplete: string; minLength?: number; maxLength?: number; aside?: ReactNode; hint?: string }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <div className="field-top">
        <label htmlFor={id} style={{ display: "inline" }}>{label}</label>
        {aside}
      </div>
      <div className="password">
        <input id={id} name={name} type={shown ? "text" : "password"} required autoComplete={autoComplete} minLength={minLength} maxLength={maxLength} aria-describedby={hint ? `${id}-h` : undefined} spellCheck={false} autoCapitalize="none" />
        <button type="button" className="reveal" aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={shown} onClick={() => setShown(!shown)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {shown ? (
              <><path d="M3 3l18 18" /><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>
            ) : (
              <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>
            )}
          </svg>
        </button>
      </div>
      {hint && <span className="hint" id={`${id}-h`}>{hint}</span>}
    </div>
  );
}

export type AuthResult = { ok: boolean; message: string } | void;

/**
 * Formulario de acceso: un envío a la vez, botón principal de ancho completo que conserva su tamaño
 * mientras envía, y mensaje anunciado (status/alert) que permanece hasta la siguiente acción.
 */
export function AuthForm({ onSubmit, submit, pendingLabel = "Procesando…", children }: { onSubmit: (f: FormData) => Promise<AuthResult>; submit: string; pendingLabel?: string; children: ReactNode }) {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <form
      className="auth-form"
      noValidate={false}
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        setPending(true);
        setMsg(null);
        try {
          const r = await onSubmit(new FormData(e.currentTarget));
          if (r) setMsg(r);
        } catch {
          setMsg({ ok: false, message: "No se pudo conectar. Revisa tu red e inténtalo de nuevo." });
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
      <div className="submit">
        <button className="block" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? <><span className="spinner" aria-hidden="true" />{pendingLabel}</> : submit}
        </button>
        <div aria-live="polite">
          {msg && <p className={`msg ${msg.ok ? "ok" : "bad"}`} role={msg.ok ? "status" : "alert"}>{msg.message}</p>}
        </div>
      </div>
    </form>
  );
}
