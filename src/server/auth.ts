import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { bearer } from "better-auth/plugins/bearer";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { loginBlocked, recordLoginFailure, resetBlocked, securityEvent } from "./security";
import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { OPERATOR } from "@/lib/operator";

export const auth = betterAuth({
  appName: "EasyWork",
  baseURL: process.env.BETTER_AUTH_URL ?? env.appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  user: {
    additionalFields: {
      lastName: { type: "string", required: true, input: true },
      // Teléfono opcional: la identidad global no lo necesita (minimización).
      phone: { type: "string", required: false, defaultValue: "", input: true },
      termsVersion: { type: "string", required: false, input: false },
      termsAcceptedAt: { type: "date", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 30,
    // Restablecer la contraseña cierra todas las sesiones existentes.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Restablece tu contraseña de EasyWork",
        text: `Para elegir una nueva contraseña abre este enlace (válido 30 minutos, un solo uso):\n${url}\n\nSi no lo solicitaste, ignora este mensaje.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Confirma tu correo en EasyWork",
        text: `Confirma tu correo abriendo este enlace (válido 24 horas):\n${url}`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    // Sin caché de sesión en cookie: una revocación surte efecto en la siguiente solicitud.
    cookieCache: { enabled: false },
    additionalFields: { reauthAt: { type: "date", required: false, input: false } },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 300, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/send-verification-email": { window: 300, max: 3 },
      "/two-factor/verify-totp": { window: 60, max: 6 },
      "/two-factor/verify-backup-code": { window: 60, max: 6 },
    },
  },
  advanced: { useSecureCookies: env.isProd, ipAddress: { ipAddressHeaders: [env.ipHeader] } },
  databaseHooks: {
    user: {
      create: {
        // La aceptación la registra el servidor con la versión vigente; el cliente no puede fijarla.
        before: async (user) => ({ data: { ...user, termsVersion: OPERATOR.legalVersion, termsAcceptedAt: new Date() } }),
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && ctx.body?.acceptTerms !== true)
        throw new APIError("BAD_REQUEST", { message: "Debes aceptar los términos y el aviso de privacidad." });
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      if (!email) return;
      const ip = ipOf(ctx.headers);
      if (ctx.path === "/sign-in/email" && (await loginBlocked(email, ip))) {
        await securityEvent({ action: "auth.login.throttled", result: "DENIED", email, ip });
        throw new APIError("TOO_MANY_REQUESTS", { message: "Demasiados intentos. Espera unos minutos." });
      }
      if (ctx.path === "/request-password-reset" && (await resetBlocked(email))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Demasiados intentos. Espera unos minutos." });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const action = SECURITY_PATHS[ctx.path];
      if (!action) return;
      const r = ctx.context.returned;
      const failed = isAPIError(r) || (r instanceof Response && r.status >= 400);
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : null;
      const ip = ipOf(ctx.headers);
      if (failed && ctx.path === "/sign-in/email" && email) await recordLoginFailure(email, ip);
      const userId = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id ?? null;
      await securityEvent({ action, result: failed ? "FAILED" : "SUCCESS", userId, email, ip }).catch(() => {});
    }),
  },
  // Orígenes de las apps empaquetadas (Capacitor/Tauri). Usan token bearer revocable guardado en el almacén seguro del sistema.
  trustedOrigins: (process.env.CLIENT_ORIGINS ?? "capacitor://localhost,https://localhost,tauri://localhost,http://tauri.localhost" + (env.isProd ? "" : ",http://localhost:5173")).split(",").map((s) => s.trim()).filter(Boolean),
  plugins: [twoFactor({ issuer: "EasyWork" }), bearer(), nextCookies()],
});

const SECURITY_PATHS: Record<string, string> = {
  "/sign-in/email": "auth.login",
  "/sign-up/email": "auth.signup",
  "/sign-out": "auth.logout",
  "/verify-email": "auth.email.verify",
  "/request-password-reset": "auth.reset.request",
  "/reset-password": "auth.reset.complete",
  "/change-password": "auth.password.change",
  "/two-factor/enable": "auth.2fa.enable",
  "/two-factor/disable": "auth.2fa.disable",
  "/two-factor/verify-totp": "auth.2fa.verify",
  "/two-factor/verify-backup-code": "auth.2fa.backup",
  "/revoke-session": "auth.session.revoke",
  "/revoke-other-sessions": "auth.session.revoke-others",
  "/revoke-sessions": "auth.session.revoke-all",
};

function ipOf(h: Headers | undefined | null) {
  const v = h?.get(env.ipHeader);
  if (!v) return "local";
  return env.ipHeader === "x-forwarded-for" ? (v.split(",").map((x) => x.trim()).filter(Boolean).pop() ?? "local") : v.trim();
}
