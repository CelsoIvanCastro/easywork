import "server-only";
import { z } from "zod";
import { auth } from "../auth";
import { AppError } from "../errors";
import { rateLimit } from "../util";
import { ipFrom } from "../web";

const fwd = (req: Request) => {
  const h = new Headers();
  for (const k of ["origin", "user-agent", "x-forwarded-for", "x-real-ip"]) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  return h;
};

/** Cookie del reto de 2FA emitida por Better Auth, devuelta a la app como token opaco de corta duración. */
function challengeFrom(res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const c = raw.find((x) => /(^|\.)two_factor=/.test(x.split(";")[0]));
  return c ? c.split(";")[0] : null;
}

export async function nativeLogin(req: Request, body: unknown) {
  const b = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(128) }).parse(body);
  await rateLimit(`native-login:${ipFrom(req.headers)}`, 20, 300);
  const res = await auth.api.signInEmail({ body: { email: b.email, password: b.password, rememberMe: true }, headers: fwd(req), asResponse: true });
  if (res.status === 429) throw new AppError("RATE_LIMIT", "Demasiados intentos. Espera unos minutos.");
  if (res.status === 403) throw new AppError("FORBIDDEN", "Confirma tu correo antes de entrar.");
  if (!res.ok) throw new AppError("UNAUTHENTICATED", "Correo o contraseña incorrectos.");
  const data = (await res.json()) as { twoFactorRedirect?: boolean };
  if (data.twoFactorRedirect) {
    const challenge = challengeFrom(res);
    if (!challenge) throw new AppError("UNAVAILABLE", "No se pudo iniciar la verificación en dos pasos.");
    return { twoFactor: true as const, challenge };
  }
  return { twoFactor: false as const, token: res.headers.get("set-auth-token")! };
}

export async function nativeTwoFactor(req: Request, body: unknown) {
  const b = z.object({ challenge: z.string().max(2000).regex(/two_factor=/), code: z.string().trim().min(6).max(20), backup: z.boolean().optional() }).parse(body);
  const h = fwd(req);
  h.set("cookie", b.challenge);
  const res = b.backup
    ? await auth.api.verifyBackupCode({ body: { code: b.code }, headers: h, asResponse: true })
    : await auth.api.verifyTOTP({ body: { code: b.code }, headers: h, asResponse: true });
  if (!res.ok) throw new AppError("UNAUTHENTICATED", res.status === 429 ? "Demasiados intentos." : "Código incorrecto.");
  return { token: res.headers.get("set-auth-token")! };
}

export async function nativeLogout(req: Request) {
  await auth.api.signOut({ headers: req.headers }).catch(() => {});
  return { ok: true };
}

export async function nativeForgot(req: Request, body: unknown) {
  const b = z.object({ email: z.string().email().max(200) }).parse(body);
  await auth.api.requestPasswordReset({ body: { email: b.email, redirectTo: "/restablecer" }, headers: fwd(req) }).catch((e) => {
    if ((e as { statusCode?: number }).statusCode === 429) throw new AppError("RATE_LIMIT", "Demasiados intentos. Espera unos minutos.");
  });
  // Respuesta neutra exista o no la cuenta.
  return { ok: true };
}
