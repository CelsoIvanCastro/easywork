// Verifica la configuración antes de desplegar/compartir. Nunca muestra valores secretos.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

export function publicServiceUrl(raw) {
  const url = new URL(raw ?? '');
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Usa el origen HTTPS público, sin credenciales, ruta, parámetros ni fragmento.');
  }
  if (!host.includes('.') || /[<>\s]/.test(raw) || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.test') || host.endsWith('.invalid') ||
      host === 'example.com' || host.endsWith('.example.com') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    throw new Error('La dirección debe ser un dominio público real; no localhost, IP ni un ejemplo.');
  }
  return url.origin;
}

async function main() {
  const args = process.argv.slice(2);
  const fileAt = args.indexOf('--env-file');
  const config = fileAt >= 0 ? parseEnv(readFileSync(args[fileAt + 1], 'utf8')) : process.env;
  const urlAt = args.indexOf('--url');
  let origin;
  if (urlAt >= 0) {
    origin = publicServiceUrl(args[urlAt + 1]);
  } else {
    const required = ['APP_URL', 'BETTER_AUTH_URL', 'DATABASE_URL', 'MIGRATE_DATABASE_URL', 'APP_DB_PASSWORD',
      'BETTER_AUTH_SECRET', 'ENCRYPTION_KEYS', 'ENCRYPTION_KEY_CURRENT', 'BLIND_INDEX_KEY',
      'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
      'MAIL_FROM', 'HEALTH_TOKEN', 'OPERATOR_NAME', 'OPERATOR_EMAIL'];
    const brevo = config.MAIL_DRIVER === 'brevo' || !!config.BREVO_API_KEY;
    required.push(brevo ? 'BREVO_API_KEY' : 'SMTP_URL');
    const missing = required.filter(k => !config[k]?.trim() || (k === 'MAIL_FROM'
      ? !/^(?:[^<>]*<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(config[k])
      : /[<>]/.test(config[k])));
    if (missing.length) throw new Error(`Faltan valores reales: ${missing.join(', ')}.`);
    origin = publicServiceUrl(config.APP_URL);
    if (publicServiceUrl(config.BETTER_AUTH_URL) !== origin) throw new Error('APP_URL y BETTER_AUTH_URL deben coincidir.');
    for (const k of ['DATABASE_URL', 'MIGRATE_DATABASE_URL']) {
      const u = new URL(config[k]);
      if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.password || !['require', 'verify-ca', 'verify-full'].includes(u.searchParams.get('sslmode')) ||
          ['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error(`${k}: se requiere PostgreSQL remoto con contraseña y sslmode.`);
    }
    if (new URL(config.DATABASE_URL).username !== 'easywork_app') throw new Error('DATABASE_URL debe utilizar el rol easywork_app.');
    if (!config.S3_ENDPOINT.startsWith('https://')) throw new Error('S3_ENDPOINT debe usar HTTPS.');
    if (!brevo && !/^smtps?:$/.test(new URL(config.SMTP_URL).protocol)) throw new Error('SMTP_URL debe ser una conexión SMTP válida.');
    if (config.BETTER_AUTH_SECRET.length < 32 || config.APP_DB_PASSWORD.length < 24) throw new Error('Los secretos de autenticación/base de datos son demasiado cortos.');
    if (Buffer.from(config.BLIND_INDEX_KEY, 'base64').length !== 32) throw new Error('BLIND_INDEX_KEY debe contener 32 bytes.');
    const keys = config.ENCRYPTION_KEYS.split(',').map(k => k.split(':'));
    if (!keys.every(([id, key]) => id && Buffer.from(key ?? '', 'base64').length === 32) ||
        !keys.some(([id]) => id === config.ENCRYPTION_KEY_CURRENT)) throw new Error('Las claves de cifrado no son válidas.');
  }
  console.log(`Configuración válida para ${origin}.`);
  if (args.includes('--online')) {
    for (const path of ['/entrar', '/api/salud/listo']) {
      const res = await fetch(origin + path, { redirect: 'error', signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`${path} respondió HTTP ${res.status}.`);
      if (path.endsWith('/listo') && (await res.json()).ready !== true) throw new Error('Base, almacenamiento o worker todavía no disponibles.');
      console.log(`${path}: correcto.`);
    }
    console.log('Disponibilidad comprobada. Falta comprobar registro/correo y operaciones desde otro dispositivo.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // No imprimir mensajes de parsers/servicios que puedan incluir credenciales.
    console.error(error instanceof TypeError || error.code ? 'No se pudo validar: revisa el archivo, los formatos y la conexión.' : error.message);
    process.exitCode = 1;
  });
}
