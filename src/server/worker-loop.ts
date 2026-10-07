import "server-only";
import { hostname } from "node:os";
import { claim, heartbeat, recoverStale, runJob, schedule } from "./jobs";

/** Ciclo del worker: tareas persistentes coordinadas por la base (puede haber varios). */
export async function workerLoop(shouldStop: () => boolean = () => false) {
  const workerId = `${hostname()}:${process.pid}`;
  console.log(`[worker] ${workerId} iniciado`);
  let lastSchedule = 0;
  while (!shouldStop()) {
    try {
      await heartbeat(workerId);
      if (Date.now() - lastSchedule > 60_000) {
        await recoverStale();
        await schedule();
        lastSchedule = Date.now();
      }
      let job;
      while (!shouldStop() && (job = await claim(workerId))) {
        try {
          const r = await runJob(job);
          console.log(`[worker] ${job.type} ok`, JSON.stringify(r ?? {}));
        } catch (e) {
          console.error(`[worker] ${job.type} falló (intento ${job.attempts}):`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e) {
      console.error("[worker] error de ciclo:", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("[worker] detenido");
}
