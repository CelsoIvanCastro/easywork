import Link from "next/link";
import { LegalPage } from "@/components/Legal";
import { OPERATOR } from "@/lib/operator";

export const metadata = { title: "Eliminar tu cuenta · EasyWork" };

export default function EliminarCuenta() {
  return (
    <LegalPage title="Eliminar tu cuenta de EasyWork">
      <h2>Cómo hacerlo</h2>
      <ol>
        <li><Link href="/entrar">Inicia sesión</Link> en la web o en la app. Si olvidaste tu contraseña, usa <Link href="/recuperar">recuperar contraseña</Link>.</li>
        <li>Ve a <strong>Mi cuenta → Eliminar mi cuenta</strong>, confirma tu identidad y escribe tu correo.</li>
        <li>La eliminación es inmediata. Te enviamos un correo de confirmación.</li>
      </ol>
      <p>Si no puedes acceder a tu correo, escribe desde la dirección registrada a <a href={`mailto:${OPERATOR.email}?subject=Eliminar%20mi%20cuenta`}>{OPERATOR.email}</a>; verificaremos tu identidad antes de actuar.</p>
      <h2>Qué se elimina</h2>
      <ul>
        <li>Tu cuenta, nombre, correo, teléfono y fotografía.</li>
        <li>Contraseña, sesiones en todos los dispositivos y verificación en dos pasos.</li>
        <li>Tus accesos a todas las empresas y tus solicitudes de ingreso.</li>
      </ul>
      <h2>Qué se conserva y por qué</h2>
      <ul>
        <li>Los <strong>expedientes laborales</strong> que conservan las empresas donde trabajaste: son responsabilidad de cada empresa y quedan desvinculados de tu cuenta. Para su eliminación o anonimización, dirígete a esa empresa.</li>
        <li>Los <strong>registros de auditoría</strong> de acciones que realizaste, con tu nombre sustituido por «Cuenta eliminada», para proteger la integridad de la información de cada empresa.</li>
        <li>Si eres <strong>propietario</strong> de una empresa activa, primero debes transferir la propiedad o cerrar la empresa.</li>
      </ul>
    </LegalPage>
  );
}
