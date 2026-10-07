import Link from "next/link";
import { Brand } from "@/lib/ui/auth";
import { db } from "@/server/db";
import { requireUser } from "@/server/web";
import { ActionForm, Field } from "@/components/ActionForm";
import { fmtDateTime } from "@/components/ui";
import { deleteAccountAction, photoAction, revokeOthers, revokeSession, updateProfile } from "./actions";
import { deletionPreview } from "@/server/services/accounts";
import { PasswordChange, TwoFactorSetup, SignOut } from "./client";

export default async function Cuenta() {
  const s = await requireUser();
  const sessions = await db.session.findMany({
    where: { userId: s.user.id, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  const u = s.user as typeof s.user & { lastName: string; phone: string };
  const preview = await deletionPreview(u.id);
  return (
    <main className="standalone stack" style={{ maxWidth: 760 }}>
      <div className="standalone-top"><Brand href="/empresas" /><Link href="/empresas">Mis empresas</Link></div>
      <h1>Mi cuenta</h1>
      <section className="card">
        <h2>Perfil personal</h2>
        <p className="small muted">Correo: {u.email}. Cambiar estos datos no modifica los expedientes que cada empresa conserva.</p>
        <ActionForm action={updateProfile}>
          <div className="fields">
            <Field label="Nombre(s)" name="name" defaultValue={u.name} required />
            <Field label="Apellidos" name="lastName" defaultValue={u.lastName} required />
            <Field label="Teléfono" name="phone" defaultValue={u.phone} required />
          </div>
        </ActionForm>
      </section>
      <section className="card">
        <h2>Fotografía (opcional)</h2>
        {u.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/foto/${u.id}`} alt="Tu fotografía de perfil" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: "50%" }} />
        )}
        <ActionForm action={photoAction} submit="Subir fotografía" reset>
          <Field label="Imagen (JPG, PNG o WEBP; se eliminan sus metadatos)" name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
        </ActionForm>
      </section>
      <section className="card">
        <h2>Contraseña</h2>
        <PasswordChange />
      </section>
      <section className="card">
        <h2>Verificación en dos pasos (TOTP)</h2>
        <TwoFactorSetup enabled={!!u.twoFactorEnabled} />
      </section>
      <section className="card">
        <h2>Sesiones activas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Dispositivo</th><th>Inicio</th><th>Caduca</th><th></th></tr></thead>
            <tbody>
              {sessions.map((x) => (
                <tr key={x.id}>
                  <td className="small">{x.userAgent?.slice(0, 80) ?? "Desconocido"} {x.id === s.session.id && <strong>(esta sesión)</strong>}</td>
                  <td>{fmtDateTime(x.createdAt, "America/Mexico_City")}</td>
                  <td>{fmtDateTime(x.expiresAt, "America/Mexico_City")}</td>
                  <td>
                    {x.id !== s.session.id && (
                      <ActionForm action={revokeSession} submit="Cerrar" className="">
                        <input type="hidden" name="id" value={x.id} />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ActionForm action={revokeOthers} submit="Cerrar todas las demás sesiones" />
      </section>
      <section className="card danger-zone" aria-labelledby="eliminar">
        <h2 id="eliminar">Eliminar mi cuenta</h2>
        <p className="small">Se eliminan tu cuenta, tus sesiones en todos los dispositivos, tu verificación en dos pasos, tu fotografía y tus accesos{preview.memberships.length ? ` a ${preview.memberships.join(", ")}` : ""}. No se puede deshacer.</p>
        <p className="small">
          Se conservan: {preview.employmentRecords ? `${preview.employmentRecords} expediente(s) laboral(es) que cada empresa guarda bajo su responsabilidad (quedan desvinculados de tu cuenta) y ` : ""}
          los registros de auditoría de tus acciones con tu nombre sustituido por «Cuenta eliminada». <Link href="/eliminar-cuenta">Más detalles</Link>.
        </p>
        {preview.blockingCompanies.length > 0 ? (
          <p className="msg warn" role="status">
            Eres propietario de {preview.blockingCompanies.map((c) => c.tradeName).join(", ")}. Antes de eliminar tu cuenta, transfiere la propiedad o cierra la empresa desde su Configuración.
          </p>
        ) : (
          <ActionForm action={deleteAccountAction} submit="Eliminar mi cuenta definitivamente" danger confirm="Tu cuenta se eliminará de inmediato. ¿Continuar?">
            <Field label={`Escribe tu correo (${u.email}) para confirmar`} name="confirm" type="email" required autoComplete="off" />
          </ActionForm>
        )}
      </section>
      <SignOut />
    </main>
  );
}
