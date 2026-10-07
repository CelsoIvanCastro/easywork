import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import * as companies from "@/server/services/companies";
import * as structure from "@/server/services/structure";
import * as employees from "@/server/services/employees";
import { loadCtx } from "@/server/context";
import { addMember, ctxOf, expectError, makeCompany } from "./helpers";

const CLABE = "032180000118359719";

async function setup() {
  const base = await makeCompany("Personal");
  const ctx = base.ctx;
  const sis = await structure.saveDepartment(ctx, null, { name: "Sistemas" });
  const ops = await structure.saveDepartment(ctx, null, { name: "Operaciones" });
  const jefe = await structure.savePosition(ctx, null, { title: "Jefe de sistemas", departmentId: sis.id });
  const dev = await structure.savePosition(ctx, null, { title: "Desarrollador", departmentId: sis.id, parentPositionId: jefe.id });
  const op = await structure.savePosition(ctx, null, { title: "Operador", departmentId: ops.id });
  return { ...base, sis, ops, jefe, dev, op };
}

describe("estructura", () => {
  it("rechaza ciclos, autorreferencias y referencias de otra empresa", async () => {
    const { ctx, sis, jefe, dev } = await setup();
    const other = await makeCompany("Ajena");
    const foreign = await structure.saveDepartment(other.ctx, null, { name: "Ajeno" });
    const d = await db.department.findUniqueOrThrow({ where: { id: sis.id } });
    await expectError(structure.saveDepartment(ctx, sis.id, { name: "Sistemas", parentId: sis.id }, d.version), "VALIDATION");
    await expectError(structure.saveDepartment(ctx, null, { name: "X", parentId: foreign.id }), "VALIDATION");
    const j = await db.position.findUniqueOrThrow({ where: { id: jefe.id } });
    await expectError(structure.savePosition(ctx, jefe.id, { title: "Jefe", departmentId: sis.id, parentPositionId: dev.id }, j.version), "VALIDATION");
    await expectError(structure.savePosition(ctx, null, { title: "Y", departmentId: foreign.id }), "VALIDATION");
  });
});

describe("personal y permisos", () => {
  it("alcance por departamento: no consulta otro departamento; retirar concesión heredada surte efecto", async () => {
    const { ctx, sis, ops, jefe, op } = await setup();
    const rh = await addMember(ctx, { name: "RH", departmentId: sis.id, positionId: jefe.id });
    const worker = await addMember(ctx, { name: "Operador", departmentId: ops.id, positionId: op.id });
    const g = await companies.addGrant(ctx, { subjectType: "POSITION", subjectId: jefe.id, permission: "employees.read", effect: "ALLOW", scope: "DEPARTMENTS", scopeDepartmentIds: [sis.id] });
    const rctx = await rh.ctx();
    const list = await employees.listEmployees(rctx, { view: "active" });
    expect(list.rows.every((r) => r.departmentId === sis.id)).toBe(true);
    await expectError(employees.getEmployee(rctx, worker.employeeId), "NOT_FOUND");
    // Restricción explícita sobre la herencia.
    const rhEmp = await db.employee.findFirstOrThrow({ where: { id: rh.employeeId } });
    expect(rhEmp.departmentId).toBe(sis.id);
    await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: rh.membershipId, permission: "employees.read", effect: "DENY", scope: "COMPANY" });
    await expectError(employees.listEmployees(await rh.ctx(), { view: "active" }), "FORBIDDEN");
    await companies.removeGrant(ctx, g.id);
  });

  it("datos sensibles no aparecen para quien no tiene permiso; búsqueda por CURP no revela coincidencias", async () => {
    const { ctx, sis } = await setup();
    const e = await employees.createEmployee(ctx, { firstName: "Ana", lastName: "López", departmentId: sis.id, curp: "BADD110313HCMLNS06", rfc: "GODE561231GR8" });
    await employees.setBankAccount(ctx, e!.id, { holderName: "Ana López", clabe: CLABE });
    await employees.addNote(ctx, e!.id, { kind: "NOTE", body: "Nota privada de RH" });
    const viewer = await addMember(ctx, { name: "Vista", departmentId: sis.id });
    await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: viewer.membershipId, permission: "employees.read", effect: "ALLOW", scope: "COMPANY" });
    const vctx = await viewer.ctx();
    const got = await employees.getEmployee(vctx, e!.id);
    expect(got.personal).toBeNull();
    expect(got.bank).toHaveLength(0);
    expect(got.notes).toHaveLength(0);
    expect(JSON.stringify(got)).not.toContain("BADD110313");
    const s = await employees.listEmployees(vctx, { view: "active", q: "BADD110313HCMLNS06" });
    expect(s.total).toBe(0);
    expect(s.restricted).toBe(true);
    // Con permiso, coincidencia exacta mediante índice ciego.
    const owner = await employees.listEmployees(ctx, { view: "active", q: "badd110313hcmlns06" });
    expect(owner.rows.map((r) => r.id)).toEqual([e!.id]);
    // En base, los valores sensibles están cifrados.
    const raw = await db.employee.findUniqueOrThrow({ where: { id: e!.id } });
    expect(raw.curpEnc).not.toContain("BADD");
    const bank = await db.bankAccount.findFirstOrThrow({ where: { employeeId: e!.id } });
    expect(bank.clabeEnc).not.toContain(CLABE);
    // Auditoría sin CLABE completa.
    const logs = await db.auditLog.findMany({ where: { companyId: ctx.companyId, entityId: e!.id } });
    expect(JSON.stringify(logs)).not.toContain(CLABE);
    expect(JSON.stringify(logs)).not.toContain("BADD110313");
  });

  it("CLABE: rechaza checksum incorrecto y conserva ceros", async () => {
    const { ctx } = await setup();
    const e = await employees.createEmployee(ctx, { firstName: "Beto" });
    await expectError(employees.setBankAccount(ctx, e!.id, { holderName: "Beto X", clabe: "032180000118359710" }), "VALIDATION");
    const valid = "032180000118359719";
    await employees.setBankAccount(ctx, e!.id, { holderName: "Beto X", clabe: valid });
    const b = await db.bankAccount.findFirstOrThrow({ where: { employeeId: e!.id, isCurrent: true } });
    expect(await employees.revealClabe(ctx, b.id)).toBe(valid);
  });

  it("borrador incompleto con pendientes; el empleado no edita campos de administración", async () => {
    const { ctx, sis } = await setup();
    const m = await addMember(ctx, { name: "Yo", departmentId: sis.id });
    const me = await m.ctx();
    const mine = await employees.getEmployee(me, m.employeeId);
    expect(mine.missing.length).toBeGreaterThan(0);
    expect(mine.missing.join()).toContain("CURP");
    const v = mine.employee.version;
    await expectError(employees.updateBasic(me, m.employeeId, { firstName: "Hack", status: "FORMER" }, v), "FORBIDDEN");
    await expectError(employees.changeAssignment(me, m.employeeId, { departmentId: sis.id }), "FORBIDDEN");
    await expectError(employees.updatePersonal(me, m.employeeId, { curp: "BADD110313HCMLNS06" }, v), "FORBIDDEN");
    // Con concesión "propios", completa sus datos personales.
    await companies.addGrant(ctx, { subjectType: "DEPARTMENT", subjectId: sis.id, permission: "employees.personal.edit", effect: "ALLOW", scope: "OWN" });
    await employees.updatePersonal(await m.ctx(), m.employeeId, { curp: "BADD110313HCMLNS06", nss: "12345678903" }, v);
    // Campos extra (status) se ignoran en edición básica de quien sí puede editar.
    const e = await db.employee.findUniqueOrThrow({ where: { id: m.employeeId } });
    await employees.updateBasic(ctx, m.employeeId, { firstName: "Yo", status: "FORMER", isOwner: true }, e.version);
    expect((await db.employee.findUniqueOrThrow({ where: { id: m.employeeId } })).status).toBe("ACTIVE");
    // Concurrencia optimista: versión obsoleta.
    await expectError(employees.updateBasic(ctx, m.employeeId, { firstName: "Otro" }, e.version), "CONFLICT");
  });

  it("organigrama reservado al propietario y a quien tenga permiso", async () => {
    const { ctx, sis, dev } = await setup();
    const m = await addMember(ctx, { departmentId: sis.id, positionId: dev.id });
    await expectError(structure.orgChart(await m.ctx()), "FORBIDDEN");
    const mem = await db.membership.findFirstOrThrow({ where: { companyId: ctx.companyId, userId: (await m.ctx()).userId } });
    await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: mem.id, permission: "structure.read", effect: "ALLOW", scope: "COMPANY" });
    expect((await structure.orgChart(await m.ctx())).roots.length).toBeGreaterThan(0);
  });

  it("cambio de puesto actualiza historial, organigrama y permisos heredados", async () => {
    const { ctx, sis, ops, dev, op } = await setup();
    await companies.addGrant(ctx, { subjectType: "POSITION", subjectId: op.id, permission: "inventory.read", effect: "ALLOW", scope: "COMPANY" });
    await companies.setModule(ctx, "inventory", true);
    const m = await addMember(ctx, { departmentId: sis.id, positionId: dev.id });
    expect((await m.ctx()).perms.has("inventory.read")).toBe(false);
    await employees.changeAssignment(ctx, m.employeeId, { positionId: op.id, reason: "Rotación" });
    expect((await m.ctx()).perms.has("inventory.read")).toBe(true);
    const hist = await db.assignmentHistory.findMany({ where: { employeeId: m.employeeId }, orderBy: { startedAt: "asc" } });
    expect(hist).toHaveLength(2);
    expect(hist[0].endedAt).not.toBeNull();
    expect(hist[0].departmentId).toBe(sis.id);
    expect(hist[1].departmentId).toBe(ops.id);
    const chart = await structure.orgChart(ctx);
    const find = (n: structure.OrgNode[]): structure.OrgNode | undefined => n.find((x) => x.id === op.id) ?? n.flatMap((x) => x.children).find((x) => x.id === op.id);
    expect(find(chart.roots)?.occupants.map((o) => o.id)).toContain(m.employeeId);
  });

  it("baja conserva expediente, cierra periodo y revoca acceso solo en esa empresa; recontratar no restaura privilegios", async () => {
    const { ctx, sis } = await setup();
    const other = await makeCompany("OtraEmpresa");
    const m = await addMember(ctx, { departmentId: sis.id });
    // La misma persona también trabaja en otra empresa.
    const r = await companies.requestJoin(m.user.id, "8.8.8.8", (await db.company.findUniqueOrThrow({ where: { id: other.company.id } })).joinCode, "");
    await companies.approveJoinRequest(other.ctx, r.id, { mode: "new" });
    await companies.setFullAccess(ctx, m.membershipId, true);
    await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: m.membershipId, permission: "audit.read", effect: "ALLOW", scope: "COMPANY" });
    await employees.terminate(ctx, m.employeeId, { date: new Date().toISOString().slice(0, 10), reason: "RESIGNATION", notes: "Renuncia voluntaria" });
    await expectError(loadCtx(m.user.id, ctx.companyId), "NOT_FOUND");
    expect((await ctxOf(m.user.id, other.company.id)).companyId).toBe(other.company.id);
    const e = await db.employee.findUniqueOrThrow({ where: { id: m.employeeId }, include: { periods: true } });
    expect(e.status).toBe("FORMER");
    expect(e.periods[0].endDate).not.toBeNull();
    const chart = await structure.orgChart(ctx);
    expect(JSON.stringify(chart)).not.toContain(m.employeeId);
    const former = await employees.listEmployees(ctx, { view: "former" });
    expect(former.rows.map((x) => x.id)).toContain(m.employeeId);
    // Baja duplicada rechazada.
    await expectError(employees.terminate(ctx, m.employeeId, { date: new Date().toISOString().slice(0, 10), reason: "OTHER" }), "CONFLICT");
    // Recontratar: periodo nuevo, sin acceso completo ni concesiones antiguas.
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await employees.rehire(ctx, m.employeeId, { date: tomorrow, departmentId: sis.id });
    const again = await ctxOf(m.user.id, ctx.companyId);
    expect(again.fullAccess).toBe(false);
    expect(again.perms.size).toBe(0);
    const periods = await db.employmentPeriod.findMany({ where: { employeeId: m.employeeId }, orderBy: { number: "asc" } });
    expect(periods.map((p) => p.number)).toEqual([1, 2]);
    expect(periods[1].endDate).toBeNull();
    const active = await employees.listEmployees(ctx, { view: "active" });
    expect(active.rows.map((x) => x.id)).toContain(m.employeeId);
  });

  it("el CEO no puede ser dado de baja ni suspendido", async () => {
    const { ctx, owner } = await setup();
    const me = await db.employee.findFirstOrThrow({ where: { companyId: ctx.companyId, userId: owner.id } });
    const admin = await addMember(ctx);
    await companies.setFullAccess(ctx, admin.membershipId, true);
    const actx = await admin.ctx();
    await expectError(employees.terminate(actx, me.id, { date: "2026-01-01", reason: "OTHER" }), "FORBIDDEN");
    await expectError(employees.setStatus(actx, me.id, "SUSPENDED"), "FORBIDDEN");
    await expectError(employees.updateBasic(actx, me.id, { firstName: "X" }, me.version), "FORBIDDEN");
  });

  it("IDs de otra empresa fallan en lectura, edición y baja", async () => {
    const a = await setup();
    const b = await makeCompany("Intrusa");
    const victim = await employees.createEmployee(a.ctx, { firstName: "Víctima" });
    await expectError(employees.getEmployee(b.ctx, victim!.id), "NOT_FOUND");
    await expectError(employees.updateBasic(b.ctx, victim!.id, { firstName: "X" }, 1), "NOT_FOUND");
    await expectError(employees.terminate(b.ctx, victim!.id, { date: "2026-01-01", reason: "OTHER" }), "NOT_FOUND");
    await expectError(employees.setBankAccount(b.ctx, victim!.id, { holderName: "X X X", clabe: CLABE }), "NOT_FOUND");
    await expectError(employees.changeAssignment(b.ctx, victim!.id, {}), "NOT_FOUND");
  });
});
