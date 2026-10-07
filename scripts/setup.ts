// Crea .env con secretos aleatorios la primera vez. Nunca sobrescribe un .env existente.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env")) {
  console.log(".env ya existe; no se modifica.");
  process.exit(0);
}
const rnd = (n = 32) => randomBytes(n).toString("base64");
const pw = () => randomBytes(18).toString("base64url");
const su = pw();
const app = pw();
let env = readFileSync(".env.example", "utf8");
const set = (k: string, v: string) => {
  env = env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
};
set("PG_SUPERUSER_PASSWORD", su);
set("APP_DB_PASSWORD", app);
set("DATABASE_URL", `postgresql://easywork_app:${app}@127.0.0.1:54329/easywork`);
set("MIGRATE_DATABASE_URL", `postgresql://postgres:${su}@127.0.0.1:54329/easywork`);
set("TEST_DATABASE_URL", `postgresql://easywork_app:${app}@127.0.0.1:54329/easywork_test`);
set("TEST_MIGRATE_DATABASE_URL", `postgresql://postgres:${su}@127.0.0.1:54329/easywork_test`);
set("BETTER_AUTH_SECRET", rnd());
set("ENCRYPTION_KEYS", `k1:${rnd()}`);
set("BLIND_INDEX_KEY", rnd());
mkdirSync(".local", { recursive: true });
writeFileSync(".env", env, { mode: 0o600 });
console.log(".env creado con secretos locales (permisos 600).");
