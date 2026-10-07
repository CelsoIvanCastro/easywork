// PostgreSQL local embebido (binarios reales de PostgreSQL vía npm). Solo para desarrollo/pruebas.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

process.loadEnvFile(".env");
const dir = resolve(".local/pg");
const fresh = !existsSync(dir);
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  port: Number(process.env.PG_PORT ?? 54329),
  user: "postgres",
  password: process.env.PG_SUPERUSER_PASSWORD!,
  persistent: true,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "timezone=UTC"],
  onLog: () => {},
});

if (fresh) await pg.initialise();
await pg.start();
const c = pg.getPgClient();
await c.connect();
const appPw = process.env.APP_DB_PASSWORD!.replaceAll("'", "''");
const role = await c.query("select 1 from pg_roles where rolname='easywork_app'");
await c.query(
  role.rowCount
    ? `alter role easywork_app login password '${appPw}'`
    : `create role easywork_app login password '${appPw}'`,
);
for (const db of ["easywork", "easywork_test"]) {
  const r = await c.query("select 1 from pg_database where datname=$1", [db]);
  if (!r.rowCount) await c.query(`create database ${db}`);
}
await c.end();
console.log(`PostgreSQL local escuchando en 127.0.0.1:${process.env.PG_PORT ?? 54329} (Ctrl+C para detener)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
