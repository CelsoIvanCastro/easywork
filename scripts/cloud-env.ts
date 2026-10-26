// Genera secretos NUEVOS para la versión en la nube (distintos de los locales) en .local/nube-variables.txt (permisos 600).
// Nunca sobrescribe: las claves de cifrado no pueden cambiar una vez que hay datos.
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
const out = ".local/nube-variables.txt";
if (existsSync(out)) { console.log(`${out} ya existe; no se modifica.`); process.exit(0); }
const rnd = (n = 32) => randomBytes(n).toString("base64");
const app = randomBytes(24).toString("base64url");
const lines = [
  "# Copia cada línea como variable de entorno en Render (Environment). NO compartas este archivo.",
  "# Generados al azar:",
  `APP_DB_PASSWORD=${app}`,
  `BETTER_AUTH_SECRET=${rnd()}`,
  `ENCRYPTION_KEYS=k1:${rnd()}`,
  "ENCRYPTION_KEY_CURRENT=k1",
  `BLIND_INDEX_KEY=${rnd()}`,
  `HEALTH_TOKEN=${randomBytes(24).toString("base64url")}`,
  "",
  "# PostgreSQL remoto (Aiven u otro proveedor): usar TLS y guardar el certificado CA por separado cuando corresponda.",
  "MIGRATE_DATABASE_URL=<cadena del proveedor con sslmode=require o verify-full>",
  `DATABASE_URL=<la misma cadena, cambiando el usuario por easywork_app y la contraseña por ${app}>`,
  "",
  "# Render (tu dirección, p. ej. https://easywork-prueba.onrender.com):",
  "APP_URL=<https://...onrender.com>",
  "BETTER_AUTH_URL=<la misma que APP_URL>",
  "",
  "# Backblaze B2:",
  "S3_ENDPOINT=<https://s3.us-east-005.backblazeb2.com (el Endpoint de tu bucket)>",
  "S3_REGION=<us-east-005 (la parte de la región del endpoint)>",
  "S3_BUCKET=<nombre del bucket>",
  "S3_ACCESS_KEY_ID=<keyID>",
  "S3_SECRET_ACCESS_KEY=<applicationKey>",
  "",
  "# Brevo (API Keys, NO la clave SMTP; Render gratis bloquea puertos SMTP):",
  "MAIL_DRIVER=brevo",
  "BREVO_API_KEY=<clave API de Brevo>",
  "MAIL_FROM=EasyWork <tu-correo-verificado-en-brevo>",
  "",
  "# Responsable (aparece en el aviso de privacidad):",
  "OPERATOR_NAME=Celso Iván Castro Vizcarra",
  "OPERATOR_KIND=Persona física",
  "OPERATOR_LOCATION=Sinaloa, México",
  "OPERATOR_EMAIL=<tu correo de contacto>",
];
mkdirSync(".local", { recursive: true });
writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
console.log(`Creado ${out} (permisos 600).`);
