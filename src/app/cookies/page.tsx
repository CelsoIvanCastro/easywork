import { LegalPage } from "@/components/Legal";

export const metadata = { title: "Cookies y almacenamiento · EasyWork" };

const ROWS: [string, string, string][] = [
  ["better-auth.session_token", "Mantener tu sesión iniciada (httpOnly, segura en producción, SameSite=Lax).", "Hasta 14 días o hasta cerrar sesión; si no eliges «mantener sesión», termina al cerrar el navegador."],
  ["better-auth.dont_remember", "Recordar que no elegiste «mantener la sesión», para que termine al cerrar el navegador.", "Sesión del navegador."],
  ["better-auth.two_factor", "Completar el segundo paso de verificación al iniciar sesión.", "Minutos, solo durante ese paso."],
  ["better-auth.trust_device", "Recordar un dispositivo de confianza para no pedir el código cada vez (solo si lo eliges).", "30 días."],
  ["ew_flash", "Mostrar el mensaje de resultado de la última acción.", "30 segundos como máximo; se borra al mostrarse."],
];

export default function Cookies() {
  return (
    <LegalPage title="Cookies y almacenamiento">
      <p>EasyWork solo usa almacenamiento <strong>esencial</strong> para funcionar. No usa cookies de analítica, publicidad ni rastreo, por eso no muestra un banner de consentimiento.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Para qué</th><th>Duración</th></tr></thead>
          <tbody>{ROWS.map(([n, p, d]) => <tr key={n}><td><code>{n}</code></td><td>{p}</td><td>{d}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="small muted">En producción los nombres llevan el prefijo <code>__Secure-</code> y solo viajan por HTTPS.</p>
      <h2>Aplicaciones instaladas</h2>
      <p>En las apps de teléfono y escritorio la sesión se guarda en el almacén seguro del sistema (Llavero en Apple, Keystore en Android, almacén de credenciales en Windows). No se guardan expedientes ni documentos para uso sin conexión.</p>
      <p>No usamos localStorage para datos de sesión.</p>
    </LegalPage>
  );
}
