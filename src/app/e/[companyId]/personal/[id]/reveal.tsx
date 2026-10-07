"use client";
import { useActionState } from "react";
import { revealAction } from "../actions";

/** Muestra la CLABE completa bajo demanda; el servidor registra el acceso. */
export function RevealClabe({ companyId, bankId }: { companyId: string; bankId: string }) {
  const [state, action, pending] = useActionState(revealAction, null);
  if (state?.ok) return <code> {String(state.data)}</code>;
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="c" value={companyId} />
      <input type="hidden" name="bankId" value={bankId} />
      <button className="secondary" disabled={pending}>Mostrar CLABE</button>
      {state && !state.ok && <span className="err"> {state.message}</span>}
    </form>
  );
}
