import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { POST as rpc } from "@/app/api/v1/rpc/route";
import { POST as upload } from "@/app/api/v1/upload/route";
import { createCompany } from "@/server/services/companies";
import { POST as nLogin } from "@/app/api/v1/auth/login/route";
import { POST as n2fa } from "@/app/api/v1/auth/2fa/route";
import { POST as nLogout } from "@/app/api/v1/auth/logout/route";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";

const ORIGIN = "capacitor://localhost";
const PW = "Contraseña-App-123";

async function nativeLogin() {
  const email = `app-${randomUUID()}@example.test`;
  await auth.api.signUpEmail({ body: { email, password: PW, name: "App", lastName: "Movil", acceptTerms: true } as never, headers: new Headers({ origin: ORIGIN }) });
  const u = await db.user.update({ where: { email }, data: { emailVerified: true } });
  const r = await auth.api.signInEmail({ body: { email, password: PW }, headers: new Headers({ origin: ORIGIN }), asResponse: true });
  return { user: u, email, token: r.headers.get("set-auth-token")! };
}
const call = (token: string, body: unknown) =>
  rpc(new Request("http://localhost/api/v1/rpc", { method: "POST", headers: { authorization: `Bearer ${token}`, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("API v1 para apps (bearer)", () => {
  it("sesión con token bearer, contexto de empresa y aislamiento", async () => {
    const { user, token } = await nativeLogin();
    expect(token).toBeTruthy();
    const company = await createCompany(user, { legalName: "App SA", tradeName: "AppCo" });
    const ctx = await (await call(token, { op: "company.context", companyId: company.id })).json();
    expect(ctx.data.isOwner).toBe(true);
    const other = await nativeLogin();
    const foreign = await call(other.token, { op: "employees.list", companyId: company.id });
    expect(foreign.status).toBe(404);
    expect((await call("token-falso", { op: "me" })).status).toBe(401);
  });

  it("revocar la sesión (web) o cambiar la contraseña invalida el token de la app en la siguiente petición", async () => {
    const a = await nativeLogin();
    expect((await call(a.token, { op: "me" })).status).toBe(200);
    await db.session.deleteMany({ where: { userId: a.user.id } });
    expect((await call(a.token, { op: "me" })).status).toBe(401);
    const b = await nativeLogin();
    const second = await auth.api.signInEmail({ body: { email: b.email, password: PW }, headers: new Headers({ origin: ORIGIN }), asResponse: true });
    const keep = second.headers.get("set-auth-token")!;
    await auth.api.changePassword({ body: { currentPassword: PW, newPassword: "Otra-Contraseña-456", revokeOtherSessions: true }, headers: new Headers({ authorization: `Bearer ${keep}` }) });
    expect((await call(b.token, { op: "me" })).status).toBe(401);
  });

  it("límites de tamaño reales en RPC y carga; validación de entrada", async () => {
    const { user, token } = await nativeLogin();
    const company = await createCompany(user, { legalName: "Lim SA", tradeName: "Lim" });
    const big = await call(token, { op: "search", companyId: company.id, input: { q: "x".repeat(300_000) } });
    expect(big.status).toBe(413);
    const bad = await call(token, { op: "search", companyId: company.id, input: { q: 5 } });
    expect(bad.status).toBe(422);
    const form = new FormData();
    form.set("companyId", company.id);
    form.set("title", "Enorme");
    form.set("file", new File([new Uint8Array(11 * 1024 * 1024)], "x.pdf", { type: "application/pdf" }));
    const r = await upload(new Request("http://localhost/api/v1/upload", { method: "POST", headers: { authorization: `Bearer ${token}`, origin: ORIGIN }, body: form }));
    expect(r.status).toBe(413);
  });

  it("carga desde la app: archivo válido aceptado y auditado", async () => {
    const { user, token } = await nativeLogin();
    const company = await createCompany(user, { legalName: "Up SA", tradeName: "Up" });
    const form = new FormData();
    form.set("companyId", company.id);
    form.set("title", "Foto de factura");
    form.set("file", new File(["%PDF-1.4\n% app\n%%EOF"], "factura.pdf", { type: "application/pdf" }));
    const r = await upload(new Request("http://localhost/api/v1/upload", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form }));
    expect(r.status).toBe(200);
    const id = (await r.json()).data.id;
    expect(await db.auditLog.count({ where: { entityId: id, action: "document.upload" } })).toBe(1);
  });

  it("login nativo con verificación en dos pasos, token utilizable y cierre de sesión", async () => {
    const { email, token } = await nativeLogin();
    const h = new Headers({ authorization: `Bearer ${token}` });
    const en = await auth.api.enableTwoFactor({ body: { password: PW }, headers: h });
    const secret = new TextDecoder().decode(base32.decode(new URL((en as { totpURI: string }).totpURI).searchParams.get("secret")!));
    await auth.api.verifyTOTP({ body: { code: await createOTP(secret).totp() }, headers: h });
    const post = (fn: typeof nLogin, body: unknown, extra: Record<string, string> = {}) =>
      fn(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...extra }, body: JSON.stringify(body) }));
    const bad = await post(nLogin, { email, password: "mala-contraseña" });
    expect(bad.status).toBe(401);
    const step1 = (await (await post(nLogin, { email, password: PW })).json()).data;
    expect(step1.twoFactor).toBe(true);
    expect((await post(n2fa, { challenge: step1.challenge, code: "000000" })).status).toBe(401);
    const step2 = (await (await post(n2fa, { challenge: step1.challenge, code: await createOTP(secret).totp() })).json()).data;
    expect((await call(step2.token, { op: "me" })).status).toBe(200);
    await post(nLogout, {}, { authorization: `Bearer ${step2.token}` });
    expect((await call(step2.token, { op: "me" })).status).toBe(401);
  });
});
