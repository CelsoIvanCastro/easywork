"use client";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { AuthForm, AuthHead } from "@/lib/ui/auth";
import { WebAuth } from "@/components/WebAuth";

export default function Verificar() {
  return (
    <WebAuth>
      <AuthHead title="Confirma tu correo">Para usar EasyWork abre el enlace que te enviamos. Si no lo encuentras, te enviamos otro.</AuthHead>
      <AuthForm
        submit="Reenviar enlace"
        pendingLabel="Enviando…"
        onSubmit={async (f) => {
          await authClient.sendVerificationEmail({ email: String(f.get("email")), callbackURL: "/empresas" });
          return { ok: true, message: "Si la cuenta existe y no está confirmada, te enviamos un nuevo enlace." };
        }}
      >
        <label>Correo<input name="email" type="email" inputMode="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} /></label>
      </AuthForm>
      <div className="auth-alt"><span>¿Ya lo confirmaste?</span><Link className="btn subtle" href="/entrar">Entrar</Link></div>
    </WebAuth>
  );
}
