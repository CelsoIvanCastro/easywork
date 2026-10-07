"use client";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authClient, authError } from "@/lib/auth-client";
import { AuthForm, AuthHead, PasswordField } from "@/lib/ui/auth";
import { WebAuth } from "@/components/WebAuth";

function Notice() {
  const deleted = useSearchParams().get("eliminada");
  return deleted ? <p className="msg ok" role="status" style={{ marginBottom: 24 }}>Tu cuenta fue eliminada.</p> : null;
}

export default function Entrar() {
  return (
    <WebAuth>
      <AuthHead title="Entrar">Accede a las empresas en las que trabajas.</AuthHead>
      <Suspense><Notice /></Suspense>
      <AuthForm
        submit="Entrar"
        pendingLabel="Entrando…"
        onSubmit={async (f) => {
          const { data, error } = await authClient.signIn.email({ email: String(f.get("email")).trim(), password: String(f.get("password")), rememberMe: f.get("remember") === "on" });
          if (error) return { ok: false, message: authError(error) };
          if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
          window.location.assign("/empresas");
        }}
      >
        <label>Correo<input name="email" type="email" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
        <PasswordField label="Contraseña" name="password" autoComplete="current-password" aside={<Link href="/recuperar">¿Olvidaste tu contraseña?</Link>} />
        <label className="inline"><input type="checkbox" name="remember" /> <span>Mantener la sesión en este dispositivo de confianza</span></label>
      </AuthForm>
      <div className="auth-alt">
        <span>¿Es tu primera vez en EasyWork?</span>
        <Link className="btn secondary" href="/registro">Crear cuenta</Link>
      </div>
    </WebAuth>
  );
}
