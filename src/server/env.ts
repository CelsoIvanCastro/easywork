import "server-only";

// Configuración validada. En producción, una configuración insegura falla al arrancar.
const isProd = process.env.NODE_ENV === "production";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

function parseKeys(raw: string): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [id, b64] = part.split(":");
    const key = Buffer.from(b64 ?? "", "base64");
    if (!id || key.length !== 32) throw new Error(`Clave de cifrado inválida: ${id ?? "(sin id)"}`);
    map.set(id, key);
  }
  return map;
}

export const env = {
  isProd,
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  databaseUrl: required("DATABASE_URL"),
  databasePoolMax: Number(process.env.PG_POOL_MAX ?? 5),
  encryptionKeys: parseKeys(required("ENCRYPTION_KEYS")),
  encryptionKeyCurrent: required("ENCRYPTION_KEY_CURRENT"),
  blindIndexKey: Buffer.from(required("BLIND_INDEX_KEY"), "base64"),
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
  storageDir: process.env.STORAGE_DIR ?? ".local/storage",
  fileScan: (process.env.FILE_SCAN ?? "off") as "off" | "clamav",
  fileScanRequired: process.env.FILE_SCAN_REQUIRED === "true",
  mailDriver: (process.env.MAIL_DRIVER ?? "local") as "local" | "smtp" | "brevo",
  mailFrom: process.env.MAIL_FROM ?? "EasyWork <no-reply@example.test>",
  requirePrivileged2fa: process.env.REQUIRE_PRIVILEGED_2FA !== "false",
  // Cabecera con la IP real que fija el proxy de confianza (debe sobrescribirla, no añadirla).
  ipHeader: (process.env.IP_HEADER ?? "x-forwarded-for").toLowerCase(),
  hstsIncludeSubdomains: process.env.HSTS_INCLUDE_SUBDOMAINS === "true",
};

if (!env.encryptionKeys.has(env.encryptionKeyCurrent)) throw new Error("ENCRYPTION_KEY_CURRENT no está en ENCRYPTION_KEYS");
if (env.blindIndexKey.length !== 32) throw new Error("BLIND_INDEX_KEY debe tener 32 bytes en base64");
if (!["local", "smtp", "brevo"].includes(env.mailDriver)) throw new Error("MAIL_DRIVER debe ser local, smtp o brevo");
if (!Number.isInteger(env.databasePoolMax) || env.databasePoolMax < 1 || env.databasePoolMax > 10) throw new Error("PG_POOL_MAX debe ser un entero entre 1 y 10");
// Se valida al ejecutar en producción (no durante `next build`, que usa el .env local).
if (isProd && process.env.NEXT_PHASE !== "phase-production-build") {
  if (!env.appUrl.startsWith("https://")) throw new Error("APP_URL debe usar https en producción");
  if (env.storageDriver === "local") throw new Error("STORAGE_DRIVER=local no está permitido en producción");
  if (env.mailDriver === "local") throw new Error("MAIL_DRIVER=local no está permitido en producción");
  if (env.mailDriver === "brevo" && !process.env.BREVO_API_KEY) throw new Error("Falta BREVO_API_KEY");
  if (env.mailDriver === "smtp" && !process.env.SMTP_URL) throw new Error("Falta SMTP_URL");
  if ((process.env.BETTER_AUTH_SECRET ?? "").length < 32) throw new Error("BETTER_AUTH_SECRET demasiado corto");
  // DEPLOY_STAGE=beta (versión de prueba en plan gratuito, sin memoria para ClamAV): los archivos quedan
  // "sin analizar" y la interfaz lo indica; tipo, tamaño y contenido se siguen validando. Nunca en el lanzamiento.
  const beta = process.env.DEPLOY_STAGE === "beta";
  if (!beta && (env.fileScan !== "clamav" || !env.fileScanRequired)) throw new Error("En producción se exige FILE_SCAN=clamav y FILE_SCAN_REQUIRED=true");
  if (!process.env.IP_HEADER || env.ipHeader === "x-forwarded-for") throw new Error("Define IP_HEADER con la cabecera de IP que sobrescribe tu proxy (p. ej. x-real-ip)");
}
