// Datos del operador de EasyWork (responsable). Se cambian aquí o con variables de entorno OPERATOR_*.
export const OPERATOR = {
  name: process.env.OPERATOR_NAME ?? "Celso Iván Castro Vizcarra",
  kind: process.env.OPERATOR_KIND ?? "Persona física",
  location: process.env.OPERATOR_LOCATION ?? "Sinaloa, México",
  email: process.env.OPERATOR_EMAIL ?? "celsoivan2007@gmail.com",
  // Fecha de la versión vigente de los textos legales (actualizar al modificarlos).
  legalVersion: "2026-10-06",
  // Mientras sea true, los textos se muestran como borrador pendiente de revisión legal.
  legalDraft: process.env.OPERATOR_LEGAL_REVIEWED !== "true",
};
