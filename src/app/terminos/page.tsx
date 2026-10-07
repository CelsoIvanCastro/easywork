import { LegalPage } from "@/components/Legal";
import { OPERATOR } from "@/lib/operator";

export const metadata = { title: "Términos del servicio · EasyWork" };

export default function Terminos() {
  return (
    <LegalPage title="Términos del servicio">
      <h2>El servicio</h2>
      <p>EasyWork es una herramienta para administrar empresas: personas, estructura, documentos, inventario, compras, mantenimiento, avisos y consultas. Actualmente no tiene costo y no incluye pagos, nómina ni contabilidad.</p>
      <h2>Cuentas</h2>
      <p>Eres responsable de la información que registras y de mantener segura tu contraseña. Debes ser mayor de edad. Puedes eliminar tu cuenta en cualquier momento desde Mi cuenta.</p>
      <h2>Datos de cada empresa</h2>
      <p>La información que registra una empresa le pertenece. Su propietario decide quién accede y con qué permisos, y es responsable de contar con la base legal para tratar los datos de su personal. La propiedad de una empresa solo cambia si su propietario la transfiere y la otra persona la acepta.</p>
      <h2>Uso aceptable</h2>
      <p>No uses EasyWork para fines ilícitos, para acceder a información sin autorización ni para interferir con el servicio.</p>
      <h2>Disponibilidad</h2>
      <p>Trabajamos para mantener el servicio disponible y respaldado, pero no podemos garantizar que esté libre de interrupciones o errores. Las funciones de IA pueden equivocarse: verifica sus respuestas en las fuentes enlazadas.</p>
      <h2>Cierre</h2>
      <p>El propietario puede cerrar su empresa; sus datos se conservan según la política de retención configurada. Si EasyWork deja de operar, avisaremos con anticipación razonable para que puedas obtener tu información.</p>
      <h2>Contacto y soporte</h2>
      <p>{OPERATOR.name} · {OPERATOR.location} · <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a></p>
    </LegalPage>
  );
}
