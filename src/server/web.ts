import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "./auth";
import { loadCtx, type Ctx } from "./context";
import { AppError, toAppError } from "./errors";
import { env } from "./env";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/entrar");
  if (!s.user.emailVerified) redirect("/verificar");
  return s;
}

/** Contexto de empresa para páginas: identidad del servidor + membresía vigente. */
export const getCtx = cache(async (companyId: string): Promise<Ctx> => {
  const s = await requireUser();
  try {
    return await loadCtx(s.user.id, companyId, {
      id: s.session.id,
      reauthAt: (s.session as { reauthAt?: Date | null }).reauthAt ?? null,
      twoFactorEnabled: !!s.user.twoFactorEnabled,
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
});

/** En páginas: sin permiso → "no disponible" (no revela si el recurso existe). */
export function allowOr404(ok: boolean) {
  if (!ok) notFound();
}

/** Ejecuta una lectura de servicio en una página; NOT_FOUND/FORBIDDEN → página "no disponible". */
export async function load<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}

/**
 * IP del cliente según la cabecera del proxy de confianza (IP_HEADER). Con X-Forwarded-For se toma el ÚLTIMO
 * valor (el que añadió el proxy), nunca el primero, que el cliente puede inventar.
 */
export function ipFrom(h: Headers, header = env.ipHeader) {
  const v = h.get(header);
  if (!v) return "local";
  return header === "x-forwarded-for" ? v.split(",").map((x) => x.trim()).filter(Boolean).pop() ?? "local" : v.trim();
}
export async function clientIp() {
  return ipFrom(await headers());
}

export type ActionResult = { ok: boolean; flash?: boolean; message?: string; code?: string; fieldErrors?: Record<string, string>; data?: unknown };

/** Envoltura de acciones de servidor: errores comprensibles, sin trazas, y refresco de datos del servidor. */
export async function run(fn: () => Promise<unknown>, okMessage = "Guardado.", revalidate?: string): Promise<ActionResult> {
  try {
    const data = await fn();
    if (revalidate) {
      // El formulario puede desaparecer al refrescar la vista (p. ej. una solicitud aprobada): el mensaje se
      // entrega como aviso breve en el layout. Contiene solo texto genérico, sin datos privados.
      (await cookies()).set("ew_flash", encodeURIComponent(`${Date.now()}|${okMessage}`), { path: "/", maxAge: 30, sameSite: "lax" });
      revalidatePath(revalidate, "layout");
    }
    return { ok: true, message: okMessage, flash: !!revalidate, data: data === undefined ? undefined : JSON.parse(JSON.stringify(data)) };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) fieldErrors[String(i.path[0] ?? "_")] ??= i.message;
      return { ok: false, code: "VALIDATION", message: "Revisa los campos marcados.", fieldErrors };
    }
    const err = toAppError(e);
    return { ok: false, code: err.code, message: err.message, fieldErrors: err.fieldErrors };
  }
}

export const fd = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
