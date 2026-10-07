"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient, authError } from "@/lib/auth-client";
import { AuthForm, AuthHead } from "@/lib/ui/auth";
import { WebAuth } from "@/components/WebAuth";

export default function SegundoPaso() {
  const [backup, setBackup] = useState(false);
  return (
    <WebAuth>
      <AuthHead title="Verificación en dos pasos">{backup ? "Escribe uno de tus códigos de respaldo. Cada código sirve una sola vez." : "Escribe el código de 6 dígitos de tu aplicación de autenticación."}</AuthHead>
      <AuthForm
        key={backup ? "b" : "t"}
        submit="Verificar"
        pendingLabel="Verificando…"
        onSubmit={async (f) => {
          const code = String(f.get("code")).trim();
          const trustDevice = f.get("trust") === "on";
          const { error } = backup ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice }) : await authClient.twoFactor.verifyTotp({ code, trustDevice });
          if (error) return { ok: false, message: authError(error) };
          window.location.assign("/empresas");
        }}
      >
        <label>{backup ? "Código de respaldo" : "Código de verificación"}<input name="code" required autoComplete="one-time-code" inputMode={backup ? "text" : "numeric"} spellCheck={false} autoCapitalize="none" /></label>
        <label className="inline"><input type="checkbox" name="trust" /> <span>Confiar en este dispositivo durante 30 días</span></label>
      </AuthForm>
      <div className="auth-alt">
        <button type="button" className="subtle" onClick={() => setBackup(!backup)}>{backup ? "Usar el código de la aplicación" : "Usar un código de respaldo"}</button>
        <Link className="btn subtle" href="/entrar">Cancelar</Link>
      </div>
    </WebAuth>
  );
}
