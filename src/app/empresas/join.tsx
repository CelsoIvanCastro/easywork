"use client";
import { useActionState } from "react";
import { ActionForm, Area, Field } from "@/components/ActionForm";
import { joinAction, lookupAction } from "./actions";

export function JoinForm() {
  const [found, lookup, pending] = useActionState(lookupAction, null);
  const company = found?.ok ? (found.data as { tradeName: string; activity: string | null }) : null;
  return (
    <div className="stack">
      <form action={lookup} className="stack">
        <label>
          Código de la empresa
          <input name="code" required maxLength={10} autoCapitalize="characters" autoComplete="off" />
        </label>
        <button disabled={pending} className="secondary">{pending ? "Buscando…" : "Buscar"}</button>
        {found && !found.ok && <p className="msg bad" role="alert">{found.message}</p>}
      </form>
      {company && (
        <ActionForm action={joinAction} submit={`Solicitar unirme a ${company.tradeName}`}>
          <p>
            <strong>{company.tradeName}</strong> {company.activity && <span className="muted">· {company.activity}</span>}
          </p>
          <Field label="Confirma el código" name="code" required maxLength={10} />
          <Area label="Mensaje (opcional)" name="message" maxLength={500} />
        </ActionForm>
      )}
    </div>
  );
}
