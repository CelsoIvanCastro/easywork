import "server-only";
import { db, Prisma } from "./db";
import { scanCompany } from "./services/alerts";
import { cleanupOrphans } from "./services/documents";
import { clamdScan } from "./files";
import { env } from "./env";
import { storage } from "./storage";

const STALE_MS = 10 * 60 * 1000;

/** Encola sin duplicar: la clave de deduplicación es única en la tabla. */
export async function enqueue(type: string, opts: { companyId?: string; payload?: Prisma.InputJsonValue; dedupeKey?: string; runAt?: Date } = {}) {
  try {
    await db.job.create({ data: { type, companyId: opts.companyId, payload: opts.payload ?? {}, dedupeKey: opts.dedupeKey, runAt: opts.runAt ?? new Date() } });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

/** Reclama una tarea con FOR UPDATE SKIP LOCKED: varios workers nunca toman la misma. */
export async function claim(workerId: string) {
  const rows = await db.$queryRaw<{ id: string; type: string; companyId: string | null; payload: unknown; attempts: number; maxAttempts: number }[]>`
    UPDATE job SET status = 'RUNNING', "lockedBy" = ${workerId}, "lockedAt" = now(), attempts = attempts + 1
    WHERE id = (SELECT id FROM job WHERE status = 'QUEUED' AND "runAt" <= now() ORDER BY "runAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, type, "companyId", payload, attempts, "maxAttempts"`;
  return rows[0] ?? null;
}

/** Tareas abandonadas por un worker caído vuelven a la cola. */
export async function recoverStale() {
  return db.$executeRaw`UPDATE job SET status = 'QUEUED', "lockedBy" = NULL WHERE status = 'RUNNING' AND "lockedAt" < ${new Date(Date.now() - STALE_MS)}`;
}

export async function runJob(job: NonNullable<Awaited<ReturnType<typeof claim>>>) {
  try {
    let result: unknown;
    if (job.type === "alerts.scan") result = await scanCompany(job.companyId!);
    else if (job.type === "storage.cleanup") result = await cleanupOrphans();
    else if (job.type === "file.scan") result = await rescanPending();
    else if (job.type === "storage.delete") result = await storage.remove(String((job.payload as { key: string }).key)).then(() => ({ deleted: true }));
    else throw new Error(`Tipo de tarea desconocido: ${job.type}`);
    await db.job.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: new Date(), lastError: null } });
    return result;
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    const retry = job.attempts < job.maxAttempts;
    // Reintento con espera exponencial; al agotar intentos queda FAILED para revisión manual.
    await db.job.update({
      where: { id: job.id },
      data: { status: retry ? "QUEUED" : "FAILED", lastError: msg, runAt: new Date(Date.now() + 2 ** job.attempts * 30_000), lockedBy: null },
    });
    throw e;
  }
}

/** Archivos en cuarentena: se analizan cuando el analizador está disponible. */
export async function rescanPending() {
  if (env.fileScan !== "clamav") return { skipped: "sin analizador" };
  const pending = await db.documentVersion.findMany({ where: { scanStatus: "PENDING", purgedAt: null }, take: 50 });
  for (const v of pending) {
    const r = await clamdScan(await storage.get(v.storageKey));
    await db.documentVersion.update({ where: { id: v.id }, data: { scanStatus: r === "CLEAN" ? "CLEAN" : "INFECTED" } });
  }
  return { scanned: pending.length };
}

/** Programa tareas periódicas con claves por intervalo: aunque se llame muchas veces, se encola una vez. */
export async function schedule() {
  const now = Date.now();
  const bucket10 = Math.floor(now / 600_000);
  const companies = await db.company.findMany({ select: { id: true } });
  for (const c of companies) await enqueue("alerts.scan", { companyId: c.id, dedupeKey: `alerts.scan:${c.id}:${bucket10}` });
  await enqueue("storage.cleanup", { dedupeKey: `storage.cleanup:${Math.floor(now / 3_600_000)}` });
  if (await db.documentVersion.count({ where: { scanStatus: "PENDING" } })) await enqueue("file.scan", { dedupeKey: `file.scan:${Math.floor(now / 300_000)}` });
}

export async function heartbeat(workerId: string) {
  await db.workerHeartbeat.upsert({ where: { workerId }, create: { workerId }, update: { seenAt: new Date() } });
}

/** Reintento manual de una tarea fallida (desde salud/operación). */
export async function retryJob(id: string) {
  await db.job.updateMany({ where: { id, status: "FAILED" }, data: { status: "QUEUED", attempts: 0, runAt: new Date() } });
}
