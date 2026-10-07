import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { auth } from "@/server/auth";

const H = (ip: string) => new Headers({ "x-forwarded-for": ip, origin: "http://localhost:3000" });
const PW = "Contraseña-Segura-123";

async function account() {
  const email = `auth-${randomUUID()}@example.test`;
  await auth.api.signUpEmail({ body: { email, password: PW, name: "Ana", lastName: "Auth", phone: "5550000000", acceptTerms: true } as never, headers: H("10.9.9.9") });
  await db.user.update({ where: { email }, data: { emailVerified: true } });
  return email;
}
const status = (p: Promise<Response>) => p.then((r) => r.status, (e: { statusCode?: number }) => e.statusCode ?? 500);
const tryLogin = (email: string, password: string, ip: string) => status(auth.api.signInEmail({ body: { email, password }, headers: H(ip), asResponse: true }));

describe("autenticación: intentos por cuenta y eventos", () => {
  it("bloqueo temporal por cuenta+origen sin bloquear a la víctima desde otro origen; respuesta idéntica para cuenta inexistente", async () => {
    const email = await account();
    for (let i = 0; i < 10; i++) expect(await tryLogin(email, "mala-clave-xx", "10.1.1.1")).toBe(401);
    expect(await tryLogin(email, PW, "10.1.1.1")).toBe(429);
    expect(await tryLogin(email, PW, "10.2.2.2")).toBe(200);
    const ghost = `nadie-${randomUUID()}@example.test`;
    for (let i = 0; i < 10; i++) expect(await tryLogin(ghost, "x-mala-clave", "10.3.3.3")).toBe(401);
    expect(await tryLogin(ghost, "x-mala-clave", "10.3.3.3")).toBe(429);
  });

  it("eventos de seguridad sin correo en claro ni contraseñas", async () => {
    const email = await account();
    await tryLogin(email, "otra-mala-clave", "10.4.4.4");
    await tryLogin(email, PW, "10.4.4.4");
    const ev = await db.auditLog.findMany({ where: { module: "security", action: "auth.login" }, orderBy: { createdAt: "desc" }, take: 2 });
    expect(ev.map((e) => e.result).sort()).toEqual(["FAILED", "SUCCESS"]);
    const dump = JSON.stringify(ev);
    expect(dump).not.toContain(email);
    expect(dump).not.toContain(PW);
  });

  it("restablecimientos limitados por cuenta, misma respuesta exista o no", async () => {
    const email = await account();
    const req = (e: string) => status(auth.api.requestPasswordReset({ body: { email: e, redirectTo: "/restablecer" }, headers: H("10.5.5.5"), asResponse: true }));
    expect([await req(email), await req(email), await req(email)]).toEqual([200, 200, 200]);
    expect(await req(email)).toBe(429);
    expect(await req(`nadie-${randomUUID()}@example.test`)).toBe(200);
    // Solicitar resets no bloquea el inicio de sesión.
    expect(await tryLogin(email, PW, "10.5.5.5")).toBe(200);
  });

  it("token de recuperación: un solo uso, también con dos intentos simultáneos; cambiar contraseña revoca sesiones", async () => {
    const email = await account();
    const login = await auth.api.signInEmail({ body: { email, password: PW }, headers: H("10.6.6.6") });
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/restablecer" }, headers: H("10.6.6.6") });
    const v = await db.verification.findFirstOrThrow({ where: { identifier: { startsWith: "reset-password:" } }, orderBy: { createdAt: "desc" } });
    const token = v.identifier.split(":")[1];
    const reset = (p: string) => status(auth.api.resetPassword({ body: { newPassword: p, token }, headers: H("10.6.6.6"), asResponse: true }));
    const both = await Promise.all([reset("Nueva-Clave-12345"), reset("Otra-Clave-12345")]);
    expect(both.filter((s) => s === 200)).toHaveLength(1);
    expect(await reset("Tercera-Clave-123")).not.toBe(200);
    expect(await db.session.count({ where: { token: login.token } })).toBe(0);
  });

  it("registro exige aceptar términos; el servidor registra versión y fecha; teléfono opcional", async () => {
    const email = `t-${randomUUID()}@example.test`;
    const bad = await status(auth.api.signUpEmail({ body: { email, password: PW, name: "T", lastName: "T" } as never, headers: H("10.7.7.7"), asResponse: true }));
    expect(bad).toBe(400);
    const forged = await status(auth.api.signUpEmail({ body: { email, password: PW, name: "T", lastName: "T", acceptTerms: true, termsVersion: "falsa" } as never, headers: H("10.7.7.7"), asResponse: true }));
    expect(forged).toBe(400);
    await auth.api.signUpEmail({ body: { email, password: PW, name: "T", lastName: "T", acceptTerms: true } as never, headers: H("10.7.7.7") });
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    expect(u.termsVersion).not.toBe("falsa");
    expect(u.termsAcceptedAt).not.toBeNull();
  });
});
