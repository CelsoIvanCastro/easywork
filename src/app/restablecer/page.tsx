"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authClient, authError } from "@/lib/auth-client";
import { AuthForm, AuthHead, PasswordField } from "@/lib/ui/auth";
import { WebAuth } from "@/components/WebAuth";

function Form() {
  const token = useSearchParams().get("token");
  if (!token)
    return (
      <div className="auth-status">
        <p className="msg bad" role="alert">El enlace no es válido o ya caducó.</p>
        <Link className="btn secondary" href="/recuperar">Solicitar un enlace nuevo</Link>
      </div>
    );
  return (
    <AuthForm
      submit="Guardar contraseña"
      pendingLabel="Guardando…"
      onSubmit={async (f) => {
        const newPassword = String(f.get("password"));
        if (newPassword !== f.get("password2")) return { ok: false, message: "Las contraseñas no coinciden. Escríbelas de nuevo." };
        const { error } = await authClient.resetPassword({ newPassword, token });
        if (error) return { ok: false, message: authError(error) };
        return { ok: true, message: "Contraseña actualizada. Cerramos todas las sesiones abiertas; entra de nuevo." };
      }}
    >
      <PasswordField label="Nueva contraseña" name="password" autoComplete="new-password" minLength={10} hint="Mínimo 10 caracteres." />
      <PasswordField label="Repite la contraseña" name="password2" autoComplete="new-password" minLength={10} />
    </AuthForm>
  );
}

export default function Restablecer() {
  return (
    <WebAuth>
      <AuthHead title="Nueva contraseña">Al guardarla se cerrarán todas tus sesiones.</AuthHead>
      <Suspense><Form /></Suspense>
      <div className="auth-alt"><span>¿Ya la cambiaste?</span><Link className="btn subtle" href="/entrar">Entrar</Link></div>
    </WebAuth>
  );
}
