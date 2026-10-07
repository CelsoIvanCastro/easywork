// Copia de seguridad coherente de base + archivos privados en .local/backups/<fecha>/.
// - Con pg_dump disponible (PATH o PG_BIN): copia lógica en caliente (formato custom).
// - Sin pg_dump (entorno local embebido): copia en frío del directorio de datos; requiere detener `npm run db`.
// Las claves (ENCRYPTION_KEYS, BLIND_INDEX_KEY, BETTER_AUTH_SECRET) NO se incluyen: guárdalas aparte, son necesarias para restaurar.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { join } from "node:path";

process.loadEnvFile(".env");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = `.local/backups/${stamp}`;
const storageDir = process.env.STORAGE_DIR ?? ".local/storage";

const pgDump = [process.env.PG_BIN && join(process.env.PG_BIN, "pg_dump"), "pg_dump"].filter(Boolean).find((p) => {
  try {
    execFileSync(p!, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
const portOpen = (port: number) =>
  new Promise<boolean>((r) => {
    const s = createConnection({ port, host: "127.0.0.1" }, () => (s.end(), r(true)));
    s.on("error", () => r(false));
  });

mkdirSync(out, { recursive: true, mode: 0o700 });
let mode: string;
if (pgDump) {
  execFileSync(pgDump, ["-Fc", "-f", `${out}/db.dump`, process.env.MIGRATE_DATABASE_URL!], { stdio: "inherit" });
  mode = "pg_dump";
} else {
  if (await portOpen(Number(process.env.PG_PORT ?? 54329))) {
    console.error("pg_dump no está disponible y PostgreSQL local está en ejecución. Detén `npm run db` y repite (copia en frío coherente).");
    process.exit(1);
  }
  cpSync(".local/pg", `${out}/pgdata`, { recursive: true });
  mode = "cold-copy";
}
// Archivos privados + sumas de verificación para comprobar integridad al restaurar.
const files: Record<string, string> = {};
if (existsSync(`${storageDir}/objects`)) {
  cpSync(`${storageDir}/objects`, `${out}/storage/objects`, { recursive: true });
  for (const d of readdirSync(`${out}/storage/objects`))
    for (const f of readdirSync(`${out}/storage/objects/${d}`)) {
      const p = `${out}/storage/objects/${d}/${f}`;
      if (statSync(p).isFile()) files[f] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
}
writeFileSync(`${out}/manifest.json`, JSON.stringify({ createdAt: new Date().toISOString(), mode, files: Object.keys(files).length, sha256: files, keyIds: (process.env.ENCRYPTION_KEYS ?? "").split(",").map((k) => k.split(":")[0]) }, null, 2));
console.log(`Copia creada en ${out} (${mode}, ${Object.keys(files).length} archivos). Recuerda resguardar las claves por separado.`);
