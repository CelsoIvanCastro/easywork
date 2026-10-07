"use client";
import { createContext, useActionState, useContext, useEffect, useRef } from "react";
import type { ActionResult } from "@/server/web";
import { reauthAction } from "@/app/actions";

type Action = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ErrCtx = createContext<Record<string, string> | undefined>(undefined);

/** Formulario conectado a una acción de servidor: evita doble envío, muestra errores y pide reautenticación si hace falta. */
export function ActionForm({
  action,
  children,
  submit = "Guardar",
  confirm,
  reset,
  className = "stack",
  danger,
  onDone,
}: {
  action: Action;
  children?: React.ReactNode;
  submit?: string;
  confirm?: string;
  reset?: boolean;
  className?: string;
  danger?: boolean;
  onDone?: (r: ActionResult) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && reset) ref.current?.reset();
    if (state?.ok && onDone) onDone(state);
  }, [state, reset, onDone]);
  return (
    <ErrCtx.Provider value={state?.fieldErrors}>
      <form
        ref={ref}
        action={formAction}
        className={className}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {children}
        <div className="row">
          <button type="submit" disabled={pending} className={danger ? "danger" : undefined}>
            {pending ? "Procesando…" : submit}
          </button>
        </div>
        {state?.message && !(state.ok && state.flash) && (
          <p className={`msg ${state.ok ? "ok" : "bad"}`} role={state.ok ? "status" : "alert"}>
            {state.message}
          </p>
        )}
      </form>
      {state?.code === "REAUTH" && <Reauth />}
    </ErrCtx.Provider>
  );
}

function Reauth() {
  const [state, formAction, pending] = useActionState(reauthAction, null);
  if (state?.ok) return <p className="msg ok" role="status">Identidad confirmada. Vuelve a enviar el formulario.</p>;
  return (
    <form action={formAction} className="card stack" aria-label="Confirmar identidad">
      <strong>Confirma tu identidad</strong>
      <label>
        Contraseña
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      <label>
        Código de verificación en dos pasos (si lo tienes activo)
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" />
      </label>
      <button disabled={pending}>{pending ? "Verificando…" : "Confirmar"}</button>
      {state?.message && !state.ok && <p className="msg bad" role="alert">{state.message}</p>}
    </form>
  );
}

export function FieldError({ name }: { name: string }) {
  const errs = useContext(ErrCtx);
  return errs?.[name] ? <span className="err" id={`${name}-err`}>{errs[name]}</span> : null;
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string };
export function Field({ label, name, hint, ...rest }: FieldProps) {
  const errs = useContext(ErrCtx);
  return (
    <label>
      {label}
      <input name={name} aria-invalid={!!errs?.[name]} aria-describedby={errs?.[name] ? `${name}-err` : undefined} {...rest} />
      {hint && <span className="muted small">{hint}</span>}
      <FieldError name={name} />
    </label>
  );
}

export function Select({ label, name, options, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; options: [string, string][] }) {
  return (
    <label>
      {label}
      <select name={name} {...rest}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <FieldError name={name} />
    </label>
  );
}

export function Area({ label, name, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string }) {
  return (
    <label>
      {label}
      <textarea name={name} {...rest} />
      <FieldError name={name} />
    </label>
  );
}
