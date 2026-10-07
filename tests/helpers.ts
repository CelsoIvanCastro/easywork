import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { loadCtx, type Ctx } from "@/server/context";
import { createCompany } from "@/server/services/companies";

export async function makeUser(name = "Persona") {
  const id = randomUUID();
  return db.user.create({
    data: { id, name, lastName: "Prueba", email: `${id}@example.test`, phone: "5512345678", emailVerified: true },
  });
}

const fresh = { id: "test-session", reauthAt: new Date(), twoFactorEnabled: true };
export const ctxOf = (userId: string, companyId: string, reauth = true): Promise<Ctx> =>
  loadCtx(userId, companyId, reauth ? { ...fresh, reauthAt: new Date() } : undefined);

export async function makeCompany(name = "Empresa") {
  const owner = await makeUser(`CEO ${name}`);
  const company = await createCompany(owner, { legalName: `${name} SA de CV`, tradeName: name });
  return { owner, company, ctx: await ctxOf(owner.id, company.id) };
}

export async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const got = (e as { code?: string }).code;
    if (got !== code) throw new Error(`Se esperaba ${code} y se obtuvo ${got}: ${(e as Error).message}`);
    return e as Error;
  }
  throw new Error(`Se esperaba error ${code} y la operación tuvo éxito`);
}

import sharp from "sharp";
export async function pngFile(name = "foto.png") {
  const buf = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#336699" } }).png().toBuffer();
  return new File([new Uint8Array(buf)], name, { type: "image/png" });
}
export const pdfFile = (name = "doc.pdf", body = "hola") =>
  new File([`%PDF-1.4\n1 0 obj<<>>endobj\n% ${body}\ntrailer<<>>\n%%EOF`], name, { type: "application/pdf" });

/** Agrega a un usuario como miembro aprobado con expediente en el departamento/puesto dados. */
export async function addMember(ownerCtx: Ctx, opts: { name?: string; departmentId?: string; positionId?: string } = {}) {
  const { requestJoin, approveJoinRequest } = await import("@/server/services/companies");
  const u = await makeUser(opts.name ?? "Empleado");
  const company = await db.company.findUniqueOrThrow({ where: { id: ownerCtx.companyId } });
  const r = await requestJoin(u.id, `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, company.joinCode, "");
  const { employeeId } = await approveJoinRequest(ownerCtx, r.id, { mode: "new", departmentId: opts.departmentId, positionId: opts.positionId });
  const m = await db.membership.findFirstOrThrow({ where: { companyId: ownerCtx.companyId, userId: u.id } });
  return { user: u, employeeId, membershipId: m.id, ctx: () => ctxOf(u.id, ownerCtx.companyId) };
}
