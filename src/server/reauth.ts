import "server-only";
import { auth } from "./auth";
import { db } from "./db";
import { AppError } from "./errors";
import { rateLimit } from "./util";

/** Reautenticación (contraseña + TOTP si está activo). Marca la sesión actual como reciente por 10 minutos. */
export async function reauthenticate(headers: Headers, password: string, code?: string) {
  const s = await auth.api.getSession({ headers });
  if (!s) throw new AppError("UNAUTHENTICATED", "Inicia sesión de nuevo.");
  await rateLimit(`reauth:${s.user.id}`, 6, 600);
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch {
    throw new AppError("VALIDATION", "Contraseña incorrecta.");
  }
  if (s.user.twoFactorEnabled) {
    try {
      await auth.api.verifyTOTP({ body: { code: code ?? "" }, headers });
    } catch {
      throw new AppError("VALIDATION", "Código de verificación incorrecto.");
    }
  }
  await db.session.update({ where: { id: s.session.id }, data: { reauthAt: new Date() } });
}
