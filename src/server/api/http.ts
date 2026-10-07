import "server-only";
import { ZodError } from "zod";
import { auth } from "../auth";
import { loadCtx } from "../context";
import { AppError, toAppError } from "../errors";
import { ipFrom } from "../web";
import type { UserCtx } from "./ops";

const STATUS: Record<string, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422, CONFLICT: 409, RATE_LIMIT: 429, REAUTH: 428, UNAVAILABLE: 503, TOO_LARGE: 413 };

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } });

export function errorResponse(e: unknown) {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[String(i.path.join(".") || "_")] ??= i.message;
    return new Response(JSON.stringify({ error: { code: "VALIDATION", message: "Revisa los campos marcados.", fieldErrors } }), { status: 422, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  const err = e instanceof AppError ? e : toAppError(e);
  return new Response(JSON.stringify({ error: { code: err.code, message: err.message, fieldErrors: err.fieldErrors } }), { status: STATUS[err.code] ?? 400, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** Lee el cuerpo con un límite real (cuenta bytes del flujo; no confía solo en Content-Length). */
export async function readLimited(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) throw new AppError("TOO_LARGE" as never, "La petición es demasiado grande.");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AppError("TOO_LARGE" as never, "La petición es demasiado grande.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) (out.set(c, o), (o += c.byteLength));
  return out;
}

/** Identidad desde cookie (web) o Authorization: Bearer (apps). Nunca desde el cuerpo. */
export async function userFrom(req: Request): Promise<UserCtx> {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) throw new AppError("UNAUTHENTICATED", "Inicia sesión.");
  if (!s.user.emailVerified) throw new AppError("FORBIDDEN", "Confirma tu correo para continuar.");
  return {
    userId: s.user.id,
    headers: req.headers,
    ip: ipFrom(req.headers),
    session: { id: s.session.id, reauthAt: (s.session as { reauthAt?: Date | null }).reauthAt ?? null, twoFactorEnabled: !!s.user.twoFactorEnabled },
  };
}

export const companyCtx = (u: UserCtx, companyId: string) => loadCtx(u.userId, companyId, u.session);
