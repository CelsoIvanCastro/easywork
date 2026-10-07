import "server-only";
import { db, type Tx } from "./db";
import { AppError } from "./errors";

/** Siguiente código visible por empresa (EMP-0001...). Atómico bajo concurrencia. */
export async function nextCode(tx: Tx, companyId: string, key: string, prefix: string, pad = 4): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO counter ("companyId", key, value) VALUES (${companyId}, ${key}, 1)
    ON CONFLICT ("companyId", key) DO UPDATE SET value = counter.value + 1
    RETURNING value`;
  return `${prefix}-${String(rows[0].value).padStart(pad, "0")}`;
}

/** Límite de frecuencia persistente (válido con varias instancias). Ventana fija desde la primera petición. */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit (id, key, count, "lastRequest") VALUES (gen_random_uuid()::text, ${"app:" + key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit."lastRequest" < ${now - windowSec * 1000} THEN 1 ELSE rate_limit.count + 1 END,
      "lastRequest" = CASE WHEN rate_limit."lastRequest" < ${now - windowSec * 1000} THEN ${now} ELSE rate_limit."lastRequest" END
    RETURNING count`;
  if (rows[0].count > max) throw new AppError("RATE_LIMIT", "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.");
}

/** Fecha civil (YYYY-MM-DD) → Date UTC a medianoche, sin desplazamiento de zona. */
export function civilDate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new AppError("VALIDATION", "Fecha inválida.");
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new AppError("VALIDATION", "Fecha inválida.");
  return d;
}
export const civilStr = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** "Hoy" como fecha civil en la zona horaria de la empresa. */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };
export const PAGE_SIZE = 25;
export const pageArgs = (page: number, size = PAGE_SIZE) => ({ skip: (Math.max(1, page) - 1) * size, take: size });

/** Instante UTC en que empieza el día (o el mes) civil actual en la zona horaria dada. */
export function zonedStart(tz: string, unit: "day" | "month", now = new Date()): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]));
  const y = Number(parts.year), m = Number(parts.month), d = unit === "day" ? Number(parts.day) : 1;
  const guess = Date.UTC(y, m - 1, d);
  // Desfase de la zona en ese instante (positivo al este de UTC).
  const local = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(guess));
  const lp = Object.fromEntries(local.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(lp.year), Number(lp.month) - 1, Number(lp.day), Number(lp.hour), Number(lp.minute), Number(lp.second));
  return new Date(guess - (asUtc - guess));
}
