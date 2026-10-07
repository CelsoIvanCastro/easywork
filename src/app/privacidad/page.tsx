import { LegalPage } from "@/components/Legal";
import { OPERATOR } from "@/lib/operator";

export const metadata = { title: "Aviso de privacidad · EasyWork" };

export default function Privacidad() {
  return (
    <LegalPage title="Aviso de privacidad">
      <h2>Quién trata tus datos</h2>
      <p>
        <strong>Datos de tu cuenta</strong> (nombre, apellidos, correo, teléfono opcional, fotografía opcional, sesiones y verificación en dos pasos):
        el responsable es {OPERATOR.name}. <strong>Datos laborales</strong> (expedientes, documentos, banco, notas, inventario, compras y demás
        información que registra cada empresa): el responsable es la empresa que los registra; EasyWork los trata por cuenta de ella como encargado.
      </p>
      <h2>Para qué</h2>
      <ul>
        <li>Darte acceso seguro: registro, verificación de correo, inicio de sesión, recuperación, sesiones y verificación en dos pasos.</li>
        <li>Permitir a cada empresa administrar su información con permisos, historial y auditoría.</li>
        <li>Seguridad: límites de intentos, registro de eventos de seguridad (sin contraseñas ni tokens) y prevención de abusos.</li>
        <li>Enviar correos transaccionales (verificación, recuperación, confirmaciones). No enviamos publicidad.</li>
      </ul>
      <h2>Qué no hacemos</h2>
      <ul>
        <li>No vendemos datos ni usamos analítica, publicidad o rastreo de terceros.</li>
        <li>No pedimos documentos laborales ni datos bancarios para crear una cuenta.</li>
      </ul>
      <h2>Proveedores y transferencias</h2>
      <ul>
        <li>Alojamiento, base de datos, almacenamiento de archivos y correo: proveedores de infraestructura por definir antes de la publicación; se listarán aquí con su país.</li>
        <li>IA empresarial (opcional): solo si el propietario de una empresa la activa expresamente. Las preguntas y los resultados de consultas de solo lectura se envían al proveedor configurado (por ejemplo, Anthropic). No se envían archivos, CLABE completas ni datos personales sensibles, y no se guardan las conversaciones.</li>
      </ul>
      <h2>Seguridad</h2>
      <p>Cifrado en tránsito, cifrado de campos sensibles (CURP, RFC, NSS, domicilio, CLABE), almacenamiento privado de archivos, permisos por empresa y auditoría. Ningún sistema es infalible; te avisaremos de incidentes que te afecten conforme a la ley.</p>
      <h2>Conservación</h2>
      <p>Tu cuenta se conserva mientras la uses o hasta que la elimines. Los expedientes laborales los conserva cada empresa según su política de retención; al cumplirse, la empresa puede anonimizarlos. Los registros de seguridad y auditoría se conservan para proteger la integridad del servicio.</p>
      <h2>Tus derechos</h2>
      <p>
        Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos (derechos ARCO) y eliminar tu cuenta desde <a href="/cuenta">Mi cuenta</a> o
        siguiendo <a href="/eliminar-cuenta">estas instrucciones</a>. Para datos laborales, dirígete a la empresa correspondiente; también puedes escribir a{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> y te orientaremos.
      </p>
      <h2>Menores de edad</h2>
      <p>EasyWork está dirigido a personas mayores de edad y a empresas. Si una empresa registra información de una persona menor, es responsable de contar con la base legal y el consentimiento necesarios.</p>
      <h2>Cambios</h2>
      <p>Publicaremos aquí cualquier cambio con su fecha de versión.</p>
    </LegalPage>
  );
}
