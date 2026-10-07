import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { storageHealthy } from "@/server/storage";
import { providerInfo } from "@/server/ai/provider";

export const dynamic = "force-dynamic";

/**
 * Disponibilidad: 200 solo si base, almacenamiento y worker (latido < 2 min) están operativos; si no, 503.
 * Los detalles se muestran en desarrollo o con `Authorization: Bearer $HEALTH_TOKEN`.
 */
export async function GET(req: Request) {
  const dbOk = await db.$queryRaw`SELECT 1`.then(() => true, () => false);
  const storageOk = await storageHealthy().catch(() => false);
  const hb = dbOk ? await db.workerHeartbeat.findFirst({ orderBy: { seenAt: "desc" } }) : null;
  const workerOk = !!hb && Date.now() - hb.seenAt.getTime() < 2 * 60_000;
  const ready = dbOk && storageOk && workerOk;
  const token = process.env.HEALTH_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const authorized = process.env.NODE_ENV !== "production" || (!!token && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token)));
  const body = authorized
    ? { ready, db: dbOk, storage: storageOk, worker: workerOk, failedJobs: dbOk ? await db.job.count({ where: { status: "FAILED" } }) : null, ai: providerInfo().configured ? "configurada" : "no configurada" }
    : { ready };
  return Response.json(body, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
