import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { db } from "./db";
import { env } from "./env";

// Huella de cuenta: identifica intentos sobre una misma cuenta sin guardar el correo en claro.
const key = Buffer.from(hkdfSync("sha256", env.blindIndexKey, "security", "account-fingerprint", 32));
export const accountFingerprint = (email: string) => createHmac("sha256", key).update(email.trim().toLowerCase()).digest("hex").slice(0, 32);

const WINDOW = 15 * 60 * 1000;

async function readCount(k: string) {
  const r = await db.rateLimit.findUnique({ where: { key: `app:${k}` } });
  return r && Number(r.lastRequest) > Date.now() - WINDOW ? r.count : 0;
}

async function bump(k: string) {
  const now = Date.now();
  await db.$executeRaw`
    INSERT INTO rate_limit (id, key, count, "lastRequest") VALUES (gen_random_uuid()::text, ${"app:" + k}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit."lastRequest" < ${now - WINDOW} THEN 1 ELSE rate_limit.count + 1 END,
      "lastRequest" = ${now}`;
}

/**
 * Límite temporal por cuenta: 10 fallos por cuenta+origen o 50 por cuenta desde cualquier origen en 15 min.
 * Aplica igual a cuentas existentes e inexistentes (no revela cuáles existen) y caduca solo (nunca permanente).
 */
export async function loginBlocked(email: string, ip: string) {
  const fp = accountFingerprint(email);
  return (await readCount(`login-fail:${fp}:${ip}`)) >= 10 || (await readCount(`login-fail:${fp}`)) >= 50;
}
export async function recordLoginFailure(email: string, ip: string) {
  const fp = accountFingerprint(email);
  await bump(`login-fail:${fp}:${ip}`);
  await bump(`login-fail:${fp}`);
}
/** Restablecimientos por cuenta: 3 cada 15 min. No afecta al inicio de sesión de la persona. */
export async function resetBlocked(email: string) {
  const k = `reset:${accountFingerprint(email)}`;
  if ((await readCount(k)) >= 3) return true;
  await bump(k);
  return false;
}

/** Evento de seguridad en la bitácora inmutable. Nunca incluye contraseñas, tokens ni el correo en claro. */
export async function securityEvent(e: { action: string; result: "SUCCESS" | "FAILED" | "DENIED"; userId?: string | null; email?: string | null; ip?: string }) {
  await db.auditLog.create({
    data: {
      companyId: null,
      actorUserId: e.userId ?? null,
      actorLabel: e.userId ? "Cuenta" : "Anónimo",
      action: e.action,
      module: "security",
      result: e.result,
      sensitive: true,
      changes: { account: e.email ? accountFingerprint(e.email) : null, ip: e.ip ?? null },
    },
  });
}
