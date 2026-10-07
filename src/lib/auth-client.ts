"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [twoFactorClient({ onTwoFactorRedirect: () => window.location.assign("/entrar/2fa") })],
});

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  EMAIL_NOT_VERIFIED: "Confirma tu correo antes de entrar. Te enviamos un enlace.",
  USER_ALREADY_EXISTS: "No se pudo crear la cuenta con esos datos.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "No se pudo crear la cuenta con esos datos.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 10 caracteres.",
  INVALID_TOKEN: "El enlace no es válido o ya caducó. Solicita uno nuevo.",
  INVALID_CODE: "Código incorrecto.",
  INVALID_PASSWORD: "Contraseña incorrecta.",
};
export function authError(e: { code?: string; status?: number; message?: string } | null | undefined): string {
  if (!e) return "Ocurrió un error.";
  if (e.status === 429) return "Demasiados intentos. Espera un momento.";
  return (e.code && MESSAGES[e.code]) || "No se pudo completar la operación.";
}
