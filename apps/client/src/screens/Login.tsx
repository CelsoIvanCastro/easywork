import { useState } from "react";
import { AuthForm, AuthHead, AuthShell, PasswordField } from "@shared/ui/auth";
import { ApiFailure, authCall, rpc, signUp } from "../api";
import { WEB_URL } from "../config";
import { openExternal, tokenStore } from "../platform";
import type { Me } from "../App";

type View = "login" | "register" | "forgot" | "2fa";
const fail = (e: unknown) => ({ ok: false, message: (e as ApiFailure).error?.message ?? "No se pudo completar." });

/** Acceso del cliente instalado: mismo marcado y estilos que la web; sesión bearer en el almacén seguro. */
export function Login({ onSignedIn }: { onSignedIn: (m: Me) => void }) {
  const [view, setView] = useState<View>("login");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [backup, setBackup] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const openLink = (path: string) => openExternal(`${WEB_URL}${path}`).catch(() => setLinkError(`No se pudo abrir el navegador. Visita ${WEB_URL}${path}`));
  const finish = async (token: string) => {
    await tokenStore.set(token);
    onSignedIn(await rpc<Me>("me"));
  };
  const legal = (
    <>
      <a href="#" onClick={(e) => { e.preventDefault(); openLink("/privacidad"); }}>Privacidad</a>
      <a href="#" onClick={(e) => { e.preventDefault(); openLink("/terminos"); }}>Términos</a>
      <a href="#" onClick={(e) => { e.preventDefault(); openLink("/eliminar-cuenta"); }}>Eliminar cuenta</a>
    </>
  );
  return (
    <AuthShell legal={legal}>
      {linkError && <p className="msg warn" role="alert" style={{ marginBottom: 24 }}>{linkError}</p>}

      {view === "login" && (
        <>
          <AuthHead title="Entrar">Accede a las empresas en las que trabajas.</AuthHead>
          <AuthForm submit="Entrar" pendingLabel="Entrando…" onSubmit={async (f) => {
            try {
              const r = await authCall<{ twoFactor: boolean; token?: string; challenge?: string }>("login", { email: String(f.get("email")).trim(), password: String(f.get("password")) });
              if (r.twoFactor) {
                setChallenge(r.challenge!);
                setView("2fa");
              } else await finish(r.token!);
            } catch (e) {
              return fail(e);
            }
          }}>
            <label>Correo<input name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label>
            <PasswordField label="Contraseña" name="password" autoComplete="current-password" aside={<a href="#" onClick={(e) => { e.preventDefault(); setView("forgot"); }}>¿Olvidaste tu contraseña?</a>} />
          </AuthForm>
          <div className="auth-alt">
            <span>¿Es tu primera vez en EasyWork?</span>
            <button type="button" className="secondary" onClick={() => setView("register")}>Crear cuenta</button>
          </div>
        </>
      )}

      {view === "register" && (
        <>
          <AuthHead title="Crear cuenta">Tu cuenta personal es independiente de las empresas. No te pediremos documentos laborales ni datos bancarios.</AuthHead>
          <AuthForm submit="Crear cuenta" pendingLabel="Creando cuenta…" onSubmit={async (f) => {
            const password = String(f.get("password"));
            if (password !== f.get("password2")) return { ok: false, message: "Las contraseñas no coinciden. Escríbelas de nuevo." };
            try {
              await signUp({ name: String(f.get("name")).trim(), lastName: String(f.get("lastName")).trim(), email: String(f.get("email")).trim(), phone: String(f.get("phone") ?? "").trim(), password, acceptTerms: f.get("terms") === "on" });
              return { ok: true, message: "Te enviamos un enlace a tu correo para confirmarlo. Después vuelve aquí y entra." };
            } catch (e) {
              return fail(e);
            }
          }}>
            <div className="grid-2">
              <label>Nombre(s)<input name="name" required maxLength={80} autoComplete="given-name" /></label>
              <label>Apellidos<input name="lastName" required maxLength={120} autoComplete="family-name" /></label>
            </div>
            <label>Correo<input name="email" type="email" inputMode="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} /></label>
            <label>Teléfono (opcional)<input name="phone" type="tel" inputMode="tel" autoComplete="tel" /></label>
            <PasswordField label="Contraseña (mínimo 10 caracteres)" name="password" autoComplete="new-password" minLength={10} />
            <PasswordField label="Repite la contraseña" name="password2" autoComplete="new-password" minLength={10} />
            <div>
              <label className="inline"><input type="checkbox" name="terms" required /> <span>Acepto los términos y el aviso de privacidad.</span></label>
              <p className="hint row" style={{ margin: "2px 0 0 30px", gap: 16 }}>
                <a href="#" onClick={(e) => { e.preventDefault(); openLink("/terminos"); }}>Leer términos</a>
                <a href="#" onClick={(e) => { e.preventDefault(); openLink("/privacidad"); }}>Leer aviso de privacidad</a>
              </p>
            </div>
          </AuthForm>
          <div className="auth-alt"><span>¿Ya tienes cuenta?</span><button type="button" className="subtle" onClick={() => setView("login")}>Entrar</button></div>
        </>
      )}

      {view === "forgot" && (
        <>
          <AuthHead title="Recuperar contraseña">Te enviaremos un enlace válido por 30 minutos para elegir una nueva.</AuthHead>
          <AuthForm submit="Enviar enlace" pendingLabel="Enviando…" onSubmit={async (f) => {
            try {
              await authCall("forgot", { email: String(f.get("email")).trim() });
              return { ok: true, message: "Si existe una cuenta con ese correo, recibirás el enlace." };
            } catch (e) {
              return fail(e);
            }
          }}>
            <label>Correo<input name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required /></label>
          </AuthForm>
          <div className="auth-alt"><span>¿Recordaste tu contraseña?</span><button type="button" className="subtle" onClick={() => setView("login")}>Volver a entrar</button></div>
        </>
      )}

      {view === "2fa" && (
        <>
          <AuthHead title="Verificación en dos pasos">{backup ? "Escribe uno de tus códigos de respaldo. Cada código sirve una sola vez." : "Escribe el código de 6 dígitos de tu aplicación de autenticación."}</AuthHead>
          <AuthForm key={backup ? "b" : "t"} submit="Verificar" pendingLabel="Verificando…" onSubmit={async (f) => {
            try {
              const r = await authCall<{ token: string }>("2fa", { challenge, code: String(f.get("code")).trim(), backup });
              await finish(r.token);
            } catch (e) {
              return fail(e);
            }
          }}>
            <label>{backup ? "Código de respaldo" : "Código de verificación"}<input name="code" required autoComplete="one-time-code" inputMode={backup ? "text" : "numeric"} spellCheck={false} autoCapitalize="none" /></label>
          </AuthForm>
          <div className="auth-alt">
            <button type="button" className="subtle" onClick={() => setBackup(!backup)}>{backup ? "Usar el código de la aplicación" : "Usar un código de respaldo"}</button>
            <button type="button" className="subtle" onClick={() => { setChallenge(null); setView("login"); }}>Cancelar</button>
          </div>
        </>
      )}
    </AuthShell>
  );
}
