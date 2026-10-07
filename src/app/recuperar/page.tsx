"use client";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { AuthForm, AuthHead } from "@/lib/ui/auth";
import { WebAuth } from "@/components/WebAuth";

export default function Recuperar() {
  return (
    <WebAuth>
      <AuthHead title="Recuperar contraseña">Te enviaremos un enlace válido por 30 minutos para elegir una nueva.</AuthHead>
      <AuthForm
        submit="Enviar enlace"
        pendingLabel="Enviando…"
        onSubmit={async (f) => {
          const { error } = await authClient.requestPasswordReset({ email: String(f.get("email")).trim(), redirectTo: "/restablecer" });
          if (error?.status === 429) return { ok: false, message: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." };
          // Mismo mensaje exista o no la cuenta.
          return { ok: true, message: "Si existe una cuenta con ese correo, recibirás un enlace válido por 30 minutos." };
        }}
      >
        <label>Correo<input name="email" type="email" inputMode="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} /></label>
      </AuthForm>
      <div className="auth-alt">
        <span>¿Recordaste tu contraseña?</span>
        <Link className="btn subtle" href="/entrar">Volver a entrar</Link>
      </div>
    </WebAuth>
  );
}
