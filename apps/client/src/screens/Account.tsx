import { useState } from "react";
import { API_URL, WEB_URL } from "../config";
import { rpc, ApiFailure } from "../api";
import { openExternal, platformName, tokenStore } from "../platform";
import { useSession } from "../App";
import { Async, Badge, Form, PageHead, fmtDateTime, useData } from "../ui";

type Sess = { id: string; userAgent: string | null; createdAt: string; expiresAt: string; current: boolean };
type Preview = { blockingCompanies: { tradeName: string }[]; memberships: string[]; employmentRecords: number };

async function twoFactor(path: string, body: unknown) {
  const t = await tokenStore.get();
  const r = await fetch(`${API_URL}/api/auth/two-factor/${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiFailure(r.status, { code: "AUTH", message: r.status === 400 || r.status === 401 ? "Contraseña o código incorrecto." : "No se pudo completar." });
  return j;
}

export function Account() {
  const { me, signOut } = useSession();
  const sessions = useData(() => rpc<Sess[]>("sessions.list"), []);
  const preview = useData(() => rpc<Preview>("account.deletionPreview"), []);
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(null);
  return (
    <>
      <PageHead title="Mi cuenta" description={`${me.name} ${me.lastName} · ${me.email}`} actions={<button className="secondary" onClick={signOut}>Cerrar sesión</button>} />
      <section className="card">
        <h2>Verificación en dos pasos</h2>
        {me.twoFactorEnabled ? <p><Badge tone="ok">Activa</Badge></p> : setup ? (
          <Form submit="Confirmar código" onSubmit={async (f) => { await twoFactor("verify-totp", { code: String(f.get("code")).trim() }); setSetup(null); return "Activada. Vuelve a entrar para verla reflejada."; }}>
            <p className="small">Agrega esta clave en tu aplicación de autenticación:</p>
            <code>{setup.uri}</code>
            <p className="small">Guarda tus códigos de respaldo: <code>{setup.codes.join("  ")}</code></p>
            <label>Código de 6 dígitos<input name="code" inputMode="numeric" required autoComplete="one-time-code" /></label>
          </Form>
        ) : (
          <Form submit="Activar" onSubmit={async (f) => { const r = await twoFactor("enable", { password: String(f.get("password")) }); setSetup({ uri: r.totpURI, codes: r.backupCodes }); return ""; }}>
            <label>Contraseña<input name="password" type="password" required autoComplete="current-password" /></label>
          </Form>
        )}
      </section>
      <section className="card">
        <h2>Sesiones</h2>
        <Async q={sessions}>
          {(list) => (
            <ul className="agenda">
              {list.map((s) => (
                <li key={s.id}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "12px 16px", alignItems: "center" }}>
                    <span className="what"><span>{(s.userAgent ?? "Dispositivo").slice(0, 70)} {s.current && <Badge tone="ok">Esta</Badge>}</span><small>Desde {fmtDateTime(s.createdAt)}</small></span>
                    {!s.current && <button className="secondary" onClick={async () => { await rpc("sessions.revoke", { id: s.id }); sessions.reload(); }}>Cerrar</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Async>
        <p style={{ marginTop: 12 }}><button className="secondary" onClick={async () => { await rpc("sessions.revokeOthers"); sessions.reload(); }}>Cerrar todas las demás sesiones</button></p>
        <p className="small muted">Para cambiar tu contraseña o tu perfil usa <a href="#" onClick={(e) => { e.preventDefault(); openExternal(`${WEB_URL}/cuenta`); }}>EasyWork en la web</a>; al hacerlo se cerrarán tus otras sesiones.</p>
      </section>
      <section className="card danger-zone">
        <h2>Eliminar mi cuenta</h2>
        <Async q={preview}>
          {(p) => (
            <>
              <p className="small">Se eliminan tu cuenta, sesiones, verificación en dos pasos, fotografía y accesos{p.memberships.length ? ` a ${p.memberships.join(", ")}` : ""}. No se puede deshacer.</p>
              <p className="small">Se conservan {p.employmentRecords ? `${p.employmentRecords} expediente(s) laboral(es) bajo responsabilidad de cada empresa y ` : ""}los registros de auditoría con tu nombre sustituido por «Cuenta eliminada».</p>
              {p.blockingCompanies.length ? (
                <p className="msg warn">Eres propietario de {p.blockingCompanies.map((c) => c.tradeName).join(", ")}: transfiere la propiedad o cierra la empresa antes de eliminar tu cuenta.</p>
              ) : (
                <Form submit="Eliminar mi cuenta definitivamente" danger confirm="Tu cuenta se eliminará de inmediato. ¿Continuar?" onSubmit={async (f) => {
                  await rpc("account.delete", { confirm: String(f.get("confirm")) });
                  await tokenStore.clear();
                  location.hash = "#/entrar";
                  location.reload();
                  return "";
                }}>
                  <label>Escribe tu correo ({me.email}) para confirmar<input name="confirm" type="email" required autoComplete="off" /></label>
                </Form>
              )}
            </>
          )}
        </Async>
      </section>
      <p className="small muted">Aplicación {platformName} · servicio {API_URL.replace(/^https?:\/\//, "")}</p>
    </>
  );
}
