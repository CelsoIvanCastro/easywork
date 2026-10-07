import { execSync } from "node:child_process";

export default function setup() {
  try { process.loadEnvFile(".env"); } catch {}
  const url = process.env.TEST_MIGRATE_DATABASE_URL ?? "";
  if (!/\/[a-z0-9_]+_test(\?|$)/.test(url)) throw new Error("TEST_MIGRATE_DATABASE_URL debe apuntar a una base *_test");
  // No destructivo: aplica migraciones pendientes. Cada prueba crea sus propias empresas con datos únicos.
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, MIGRATE_DATABASE_URL: url } });
}
