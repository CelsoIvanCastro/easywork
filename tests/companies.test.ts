import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { can, loadCtx } from "@/server/context";
import * as companies from "@/server/services/companies";
import { ctxOf, expectError, makeCompany, makeUser } from "./helpers";

describe("empresas, membresías y propiedad", () => {
  it("crear empresa convierte solo al creador en propietario y crea su expediente", async () => {
    const { owner, company, ctx } = await makeCompany("Alfa");
    expect(ctx.isOwner).toBe(true);
    expect(company.ownerId).toBe(owner.id);
    const ms = await db.membership.findMany({ where: { companyId: company.id } });
    expect(ms).toHaveLength(1);
    const emp = await db.employee.findFirst({ where: { companyId: company.id, userId: owner.id }, include: { periods: true } });
    expect(emp?.periods).toHaveLength(1);
    expect(await db.auditLog.count({ where: { companyId: company.id, action: "company.create" } })).toBe(1);
  });

  it("el código solo genera solicitud; aprobaciones simultáneas no duplican", async () => {
    const { company, ctx } = await makeCompany("Beta");
    const u = await makeUser("Aspirante");
    const pub = await companies.lookupJoinCode(u.id, "1.1.1.1", company.joinCode);
    expect(Object.keys(pub).sort()).toEqual(["activity", "tradeName"]);
    await expectError(loadCtx(u.id, company.id), "NOT_FOUND");
    const req = await companies.requestJoin(u.id, "1.1.1.1", company.joinCode, "hola");
    await expectError(companies.requestJoin(u.id, "1.1.1.1", company.joinCode, ""), "CONFLICT");
    const results = await Promise.allSettled([1, 2, 3].map(() => companies.approveJoinRequest(ctx, req.id, { mode: "new" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.membership.count({ where: { companyId: company.id, userId: u.id } })).toBe(1);
    expect(await db.employee.count({ where: { companyId: company.id, userId: u.id } })).toBe(1);
    // Nuevo miembro: sin privilegios por defecto.
    const mctx = await ctxOf(u.id, company.id);
    expect(mctx.perms.size).toBe(0);
  });

  it("acceso completo no puede tocar al propietario ni apropiarse de la empresa", async () => {
    const { owner, company, ctx } = await makeCompany("Gamma");
    const admin = await makeUser("Admin");
    const r = await companies.requestJoin(admin.id, "2.2.2.2", company.joinCode, "");
    await companies.approveJoinRequest(ctx, r.id, { mode: "new" });
    const m = await db.membership.findFirstOrThrow({ where: { companyId: company.id, userId: admin.id } });
    await companies.setFullAccess(ctx, m.id, true);
    const actx = await ctxOf(admin.id, company.id);
    expect(can(actx, "employees.read")).toBe(true);
    expect(can(actx, "permissions.manage")).toBe(false);
    const ownerM = await db.membership.findFirstOrThrow({ where: { companyId: company.id, userId: owner.id } });
    await expectError(companies.setFullAccess(actx, ownerM.id, false), "FORBIDDEN");
    await expectError(companies.addGrant(actx, { subjectType: "MEMBER", subjectId: m.id, permission: "employees.read", effect: "ALLOW", scope: "COMPANY" }), "FORBIDDEN");
    await expectError(companies.regenerateJoinCode(actx), "FORBIDDEN");
    await expectError(companies.setModule(actx, "inventory", true), "FORBIDDEN");
    // El propietario tampoco puede restringirse a sí mismo vía concesiones.
    await expectError(companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: ownerM.id, permission: "employees.read", effect: "DENY", scope: "COMPANY" }), "FORBIDDEN");
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).ownerId).toBe(owner.id);
  });

  it("cambiar de empresa no conserva privilegios: misma persona CEO en una y empleado en otra", async () => {
    const { owner: ceo, company: a } = await makeCompany("Delta");
    const { company: b, ctx: bOwner } = await makeCompany("Epsilon");
    const r = await companies.requestJoin(ceo.id, "3.3.3.3", b.joinCode, "");
    await companies.approveJoinRequest(bOwner, r.id, { mode: "new" });
    const inA = await ctxOf(ceo.id, a.id);
    const inB = await ctxOf(ceo.id, b.id);
    expect(inA.isOwner).toBe(true);
    expect(inB.isOwner).toBe(false);
    expect(can(inB, "employees.read")).toBe(false);
  });

  it("acciones privilegiadas exigen reautenticación reciente", async () => {
    const { owner, company } = await makeCompany("Zeta");
    const stale = await ctxOf(owner.id, company.id, false);
    await expectError(companies.setRetention(stale, 5), "REAUTH");
  });

  it("dependencias de módulos: no se desactiva inventario con compras activas", async () => {
    const { ctx } = await makeCompany("Eta");
    await expectError(companies.setModule(ctx, "purchases", true), "VALIDATION");
    await companies.setModule(ctx, "inventory", true);
    await companies.setModule(ctx, "suppliers", true);
    await companies.setModule(ctx, "purchases", true);
    await expectError(companies.setModule(ctx, "inventory", false), "VALIDATION");
  });

  it("límite de búsquedas de código empresarial", async () => {
    const u = await makeUser("Curioso");
    for (let i = 0; i < 10; i++) await companies.lookupJoinCode(u.id, "9.9.9.9", "ZZZZZZZZZZ").catch(() => {});
    await expectError(companies.lookupJoinCode(u.id, "9.9.9.9", "ZZZZZZZZZZ"), "RATE_LIMIT");
  });

  it("la auditoría no admite UPDATE ni DELETE desde el rol de la aplicación", async () => {
    const { company } = await makeCompany("Theta");
    await expect(db.$executeRaw`UPDATE audit_log SET action = 'x' WHERE "companyId" = ${company.id}`).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM audit_log WHERE "companyId" = ${company.id}`).rejects.toThrow();
  });
});
