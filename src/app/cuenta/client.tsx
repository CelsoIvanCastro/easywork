"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, authError } from "@/lib/auth-client";
import { AuthForm } from "@/lib/ui/auth";

export function PasswordChange() {
  return (
    <AuthForm
      submit="Cambiar contraseña"
      onSubmit={async (f) => {
        const newPassword = String(f.get("new"));
        if (newPassword !== f.get("new2")) return { ok: false, message: "Las contraseñas no coinciden." };
        // Cambiar la contraseña cierra las demás sesiones.
        const { error } = await authClient.changePassword({ currentPassword: String(f.get("current")), newPassword, revokeOtherSessions: true });
        if (error) return { ok: false, message: authError(error) };
        return { ok: true, message: "Contraseña cambiada. Se cerraron tus otras sesiones." };
      }}
    >
      <label>Contraseña actual<input name="current" type="password" required autoComplete="current-password" /></label>
      <label>Nueva contraseña<input name="new" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label>
      <label>Repite la nueva<input name="new2" type="password" required minLength={10} autoComplete="new-password" /></label>
    </AuthForm>
  );
}

export function TwoFactorSetup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(null);
  if (enabled)
    return (
      <AuthForm
        submit="Desactivar verificación en dos pasos"
        onSubmit={async (f) => {
          const { error } = await authClient.twoFactor.disable({ password: String(f.get("password")) });
          if (error) return { ok: false, message: authError(error) };
          router.refresh();
          return { ok: true, message: "Desactivada." };
        }}
      >
        <p className="badge ok">Activa</p>
        <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
      </AuthForm>
    );
  if (setup)
    return (
      <AuthForm
        submit="Confirmar código"
        onSubmit={async (f) => {
          const { error } = await authClient.twoFactor.verifyTotp({ code: String(f.get("code")).trim() });
          if (error) return { ok: false, message: authError(error) };
          setSetup(null);
          router.refresh();
          return { ok: true, message: "Verificación en dos pasos activada." };
        }}
      >
        <p>Agrega esta clave en tu aplicación de autenticación (Google Authenticator, 1Password, etc.):</p>
        <code style={{ overflowWrap: "anywhere" }}>{setup.uri}</code>
        <p>Guarda tus códigos de respaldo en un lugar seguro (cada uno sirve una vez):</p>
        <code>{setup.codes.join("  ")}</code>
        <label>Código de 6 dígitos<input name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code" /></label>
      </AuthForm>
    );
  return (
    <AuthForm
      submit="Activar"
      onSubmit={async (f) => {
        const { data, error } = await authClient.twoFactor.enable({ password: String(f.get("password")) });
        if (error || !data || data.method !== "totp") return { ok: false, message: authError(error) };
        setSetup({ uri: data.totpURI, codes: data.backupCodes });
      }}
    >
      <p className="small muted">Obligatoria para propietarios y cuentas con acceso privilegiado al realizar acciones sensibles.</p>
      <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
    </AuthForm>
  );
}

export function SignOut() {
  return (
    <button className="secondary" onClick={async () => { await authClient.signOut(); window.location.assign("/entrar"); }}>
      Cerrar sesión
    </button>
  );
}
