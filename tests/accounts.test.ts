import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import * as companies from "@/server/services/companies";
import * as accounts from "@/server/services/accounts";
import * as employees from "@/server/services/employees";
import * as docs from "@/server/services/documents";
import { loadCtx } from "@/server/context";
import { addMember, ctxOf, expectError, makeCompany, pdfFile } from "./helpers";

const fresh = () => ({ id: "s", reauthAt: new Date(), twoFactorEnabled: true });

async function textHits(token: string) {
  const cols = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'jsonb') AND table_name <> '_prisma_migrations'`;
  let hits = 0;
  for (const c of cols) {
    const r = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "${c.table_name}" WHERE "${c.column_name}"::text ILIKE $1`, `%${token}%`);
    if (Number(r[0].n)) {
      hits += Number(r[0].n);
      console.log("residuo en", c.table_name, c.column_name);
    }
  }
  return hits;
}

describe("eliminación de cuenta, propiedad y anonimización", () => {
  it("empleado elimina su cuenta: identidad y sesiones fuera; el expediente de la empresa se conserva", async () => {
    const { ctx } = await makeCompany("Del1");
    const m = await addMember(ctx);
    await db.session.create({ data: { id: crypto.randomUUID(), token: crypto.randomUUID(), userId: m.user.id, expiresAt: new Date(Date.now() + 1e8) } });
    await expectError(accounts.deleteAccount(m.user.id, undefined, m.user.email), "REAUTH");
    await expectError(accounts.deleteAccount(m.user.id, fresh(), "otro@x.test"), "VALIDATION");
    await accounts.deleteAccount(m.user.id, fresh(), m.user.email);
    expect(await db.user.count({ where: { id: m.user.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: m.user.id } })).toBe(0);
    const e = await db.employee.findUniqueOrThrow({ where: { id: m.employeeId } });
    expect(e.userId).toBeNull();
    expect(await db.erasureLog.count({ where: { kind: "ACCOUNT" } })).toBeGreaterThan(0);
  });

  it("el propietario no puede eliminar su cuenta sin transferir o cerrar; la transferencia la acepta el sucesor", async () => {
    const { ctx, owner, company } = await makeCompany("Del2");
    const heir = await addMember(ctx, { name: "Heredera" });
    const admin = await addMember(ctx, { name: "Admin" });
    await companies.setFullAccess(ctx, admin.membershipId, true);
    await expectError(accounts.deleteAccount(owner.id, fresh(), owner.email), "VALIDATION");
    await expectError(accounts.startTransfer(await admin.ctx(), heir.membershipId), "FORBIDDEN");
    const t = await accounts.startTransfer(ctx, heir.membershipId);
    await expectError(accounts.acceptTransfer(admin.user.id, fresh(), t.id), "NOT_FOUND");
    await accounts.acceptTransfer(heir.user.id, fresh(), t.id);
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).ownerId).toBe(heir.user.id);
    expect((await ctxOf(heir.user.id, company.id)).isOwner).toBe(true);
    await accounts.deleteAccount(owner.id, fresh(), owner.email);
    const logs = await db.auditLog.findMany({ where: { actorUserId: owner.id } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.actorLabel === "Cuenta eliminada")).toBe(true);
  });

  it("cerrar la empresa bloquea el acceso y permite al fundador eliminar su cuenta", async () => {
    const { ctx, owner, company } = await makeCompany("Del3");
    const m = await addMember(ctx);
    await expectError(accounts.closeCompany(ctx, { confirm: "otro", reason: "Fin de operaciones" }), "VALIDATION");
    await accounts.closeCompany(ctx, { confirm: "Del3", reason: "Fin de operaciones" });
    await expectError(loadCtx(m.user.id, company.id), "NOT_FOUND");
    await accounts.deleteAccount(owner.id, fresh(), owner.email);
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).ownerId).toBeNull();
    expect(await db.employee.count({ where: { companyId: company.id } })).toBeGreaterThan(0);
  });

  it("anonimización: sin residuos del nombre en ninguna columna de texto; se registra para reaplicar", async () => {
    const { ctx } = await makeCompany("Anon");
    const token = `Zelmira${Date.now()}`;
    const e = await employees.createEmployee(ctx, { firstName: token, lastName: "Quintanilla", hireDate: "2015-01-01", curp: "BADD110313HCMLNS06" });
    await employees.addContract(ctx, e!.id, { title: `Contrato de ${token}`, startDate: "2015-01-01", notes: `Notas sobre ${token}` });
    await employees.addNote(ctx, e!.id, { kind: "NOTE", body: `${token} pidió permiso` });
    await docs.uploadDocument(ctx, { title: `INE de ${token}`, docType: "INE_FRONT", employeeId: e!.id }, pdfFile(`${token}.pdf`));
    await employees.setBankAccount(ctx, e!.id, { holderName: `${token} Q`, clabe: "032180000118359719" });
    await db.alert.create({ data: { companyId: ctx.companyId, type: "doc.missing", dedupeKey: `emp:${e!.id}:x`, title: `Expediente incompleto: ${token}`, link: "/", module: "employees", requiredPermission: "employees.read", employeeId: e!.id } });
    await employees.terminate(ctx, e!.id, { date: "2018-01-01", reason: "OTHER", notes: `${token} se mudó` });
    await companies.setRetention(ctx, 1);
    await employees.anonymize(ctx, e!.id, (await db.employee.findUniqueOrThrow({ where: { id: e!.id } })).number);
    expect(await textHits(token)).toBe(0);
    expect(await db.erasureLog.count({ where: { kind: "EMPLOYEE", subject: e!.id } })).toBe(1);
    expect(await db.job.count({ where: { type: "storage.delete" } })).toBeGreaterThan(0);
  });
});
