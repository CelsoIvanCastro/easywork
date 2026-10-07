// Restauración de prueba en un entorno DESECHABLE (directorio y puerto propios). Nunca escribe sobre la base de trabajo.
// Uso: npm run restore -- .local/backups/<fecha>
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

process.loadEnvFile(".env");
const src = process.argv[2];
if (!src || !existsSync(`${src}/manifest.json`)) {
  console.error("Indica la carpeta de la copia: npm run restore -- .local/backups/<fecha>");
  process.exit(1);
}
const target = resolve(`.local/restore-${Date.now()}`);
if (target === resolve(".local/pg")) throw new Error("Destino no permitido");
const port = Number(process.env.RESTORE_PORT ?? 54399);
mkdirSync(target, { recursive: true });
const pg = new EmbeddedPostgres({ databaseDir: `${target}/pg`, port, user: "postgres", password: process.env.PG_SUPERUSER_PASSWORD!, persistent: false, onLog: (m) => process.env.DEBUG_RESTORE && console.log(String(m).trim()) });

if (existsSync(`${src}/pgdata`)) {
  cpSync(`${src}/pgdata`, `${target}/pg`, { recursive: true });
  chmodSync(`${target}/pg`, 0o700); // PostgreSQL exige permisos restrictivos del directorio de datos
} else {
  await pg.initialise();
}
await pg.start();
try {
  const url = (u: string) => process.env[u]!.replace(/@127\.0\.0\.1:\d+\//, `@127.0.0.1:${port}/`);
  if (existsSync(`${src}/db.dump`)) {
    const c = pg.getPgClient();
    await c.connect();
    await c.query("create database easywork");
    await c.end();
    execFileSync("pg_restore", ["--no-owner", "-d", url("MIGRATE_DATABASE_URL"), `${src}/db.dump`], { stdio: "inherit" });
  }
  cpSync(`${src}/storage`, `${target}/storage`, { recursive: true });
  // Opcional: probar una migración incremental sobre la copia (nunca sobre la base de trabajo).
  if (process.env.RESTORE_MIGRATE) execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, MIGRATE_DATABASE_URL: url("MIGRATE_DATABASE_URL") } });
  // Opcional: rotar a una clave nueva sobre la copia y verificar después sin la clave anterior.
  if (process.env.RESTORE_ROTATE_KEYS) {
    const rotEnv = { ...process.env, DATABASE_URL: url("DATABASE_URL"), ENCRYPTION_KEYS: process.env.RESTORE_ROTATE_KEYS, ENCRYPTION_KEY_CURRENT: process.env.RESTORE_ROTATE_CURRENT! };
    execSync("npx tsx --conditions=react-server scripts/rotate-keys.ts", { stdio: "inherit", env: rotEnv });
    process.env.ENCRYPTION_KEYS = process.env.RESTORE_ROTATE_KEYS.split(",").filter((k) => k.startsWith(process.env.RESTORE_ROTATE_CURRENT! + ":")).join(",");
    process.env.ENCRYPTION_KEY_CURRENT = process.env.RESTORE_ROTATE_CURRENT;
  }
  // Verificación con el código de la aplicación apuntando al entorno restaurado.
  execSync("npx tsx --conditions=react-server scripts/verify-restore.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url("DATABASE_URL"), STORAGE_DIR: `${target}/storage`, RESTORE_MANIFEST: `${src}/manifest.json` },
  });
} finally {
  await pg.stop();
  if (!process.env.KEEP_RESTORE) rmSync(target, { recursive: true, force: true });
}
