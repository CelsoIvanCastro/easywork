export {};
// Worker de tareas persistentes. Ejecutar con `npm run worker`. Puede haber varios: se coordinan por la base.
try { process.loadEnvFile(".env"); } catch {}
const { workerLoop } = await import("../server/worker-loop");
let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));
await workerLoop(() => stopping);
process.exit(0);
