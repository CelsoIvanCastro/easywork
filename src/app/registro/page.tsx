"use client";
import Link from "next/link";
import { authClient, authError } from "@/lib/auth-client";
import { AuthForm, AuthHead, PasswordField } from "@/lib/ui/auth";
import { WebAuth } from "@/components/WebAuth";

export default function Registro() {
  return (
    <WebAuth>
      <AuthHead title="Crear cuenta">Tu cuenta personal es independiente de las empresas. No te pediremos documentos laborales ni datos bancarios.</AuthHead>
      <AuthForm
        submit="Crear cuenta"
        pendingLabel="Creando cuenta…"
        onSubmit={async (f) => {
          const password = String(f.get("password"));
          if (password !== f.get("password2")) return { ok: false, message: "Las contraseñas no coinciden. Escríbelas de nuevo." };
          const { error } = await authClient.signUp.email({
            name: String(f.get("name")).trim(),
            lastName: String(f.get("lastName")).trim(),
            phone: String(f.get("phone") ?? "").trim(),
            acceptTerms: f.get("terms") === "on",
            email: String(f.get("email")).trim(),
            password,
            callbackURL: "/empresas",
          } as Parameters<typeof authClient.signUp.email>[0]);
          if (error) return { ok: false, message: authError(error) };
          return { ok: true, message: "Te enviamos un enlace para confirmar tu correo. Ábrelo para continuar." };
        }}
      >
        <div className="grid-2">
          <label>Nombre(s)<input name="name" required maxLength={80} autoComplete="given-name" /></label>
          <label>Apellidos<input name="lastName" required maxLength={120} autoComplete="family-name" /></label>
        </div>
        <label>Correo<input name="email" type="email" inputMode="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} /></label>
        <label>Teléfono (opcional)<input name="phone" type="tel" inputMode="tel" pattern="[0-9+ \(\)\-]{8,20}" autoComplete="tel" /></label>
        <PasswordField label="Contraseña (mínimo 10 caracteres)" name="password" autoComplete="new-password" minLength={10} />
        <PasswordField label="Repite la contraseña" name="password2" autoComplete="new-password" minLength={10} />
        <div className="inline-check">
          <label className="inline"><input type="checkbox" name="terms" required /> <span>Acepto los términos y el aviso de privacidad.</span></label>
          <p className="hint row" style={{ margin: "2px 0 0 30px", gap: 16 }}><Link href="/terminos" target="_blank">Leer términos</Link><Link href="/privacidad" target="_blank">Leer aviso de privacidad</Link></p>
        </div>
      </AuthForm>
      <div className="auth-alt">
        <span>¿Ya tienes cuenta?</span>
        <Link className="btn subtle" href="/entrar">Entrar</Link>
      </div>
    </WebAuth>
  );
}
