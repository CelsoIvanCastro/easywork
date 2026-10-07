// Al arrancar en la nube: habilita el rol de la app (permisos mínimos, creado por las migraciones) con su contraseña.
// Idempotente. Usa la conexión de migraciones (propietaria); la app se conecta después como easywork_app.
export {};
const { Client } = await import("pg");
const pw = process.env.APP_DB_PASSWORD ?? "";
if (pw.length < 24) { console.error("APP_DB_PASSWORD debe tener al menos 24 caracteres."); process.exit(1); }
const c = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
await c.connect();
const { rows } = await c.query("select format('ALTER ROLE easywork_app LOGIN PASSWORD %L', $1::text) as sql", [pw]);
await c.query(rows[0].sql);
await c.end();
console.log("[nube] rol easywork_app habilitado");
