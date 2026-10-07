import "server-only";
import { z } from "zod";
import { db, type Tx } from "../db";
import { audit, diff } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { type Ctx, can, need } from "../context";

const deptSchema = z.object({
  name: z.string().trim().min(1, "Requerido").max(120),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  parentId: z.string().optional().transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

const posSchema = z.object({
  title: z.string().trim().min(1, "Requerido").max(120),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  departmentId: z.string().min(1, "Elige un departamento"),
  parentPositionId: z.string().optional().transform((v) => v || null),
  headcount: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(10000).nullable()),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

// Serializa cambios de jerarquía por empresa para que dos ediciones simultáneas no formen un ciclo.
const lockTree = (tx: Tx, companyId: string, kind: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${kind + ":" + companyId}))`;

async function assertNoCycle(tx: Tx, table: "department" | "position", companyId: string, id: string | null, parentId: string | null) {
  if (!parentId) return;
  if (parentId === id) throw invalid("Un elemento no puede depender de sí mismo.", { parentId: "No puede ser él mismo" });
  const col = table === "department" ? "parentId" : "parentPositionId";
  // Sube por la cadena de padres; si aparece el propio elemento, habría ciclo.
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `WITH RECURSIVE up AS (
       SELECT id, "${col}" AS p, 1 AS depth FROM "${table}" WHERE id = $1 AND "companyId" = $2
       UNION ALL SELECT t.id, t."${col}", up.depth + 1 FROM "${table}" t JOIN up ON t.id = up.p WHERE t."companyId" = $2 AND up.depth < 200
     ) SELECT id FROM up`,
    parentId,
    companyId,
  );
  if (!rows.length) throw invalid("El elemento superior no existe en esta empresa.", { parentId: "No válido" });
  if (id && rows.some((r) => r.id === id)) throw invalid("Ese cambio crearía un ciclo en la jerarquía.", { parentId: "Crearía un ciclo" });
}

export async function listDepartments(ctx: Ctx, includeArchived = false) {
  return db.department.findMany({
    where: { companyId: ctx.companyId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, parentId: true, sortOrder: true, archivedAt: true, version: true },
  });
}

export async function listPositions(ctx: Ctx, includeArchived = false) {
  return db.position.findMany({
    where: { companyId: ctx.companyId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, title: true, description: true, departmentId: true, parentPositionId: true, headcount: true, sortOrder: true, archivedAt: true, version: true, department: { select: { name: true } } },
  });
}

export async function saveDepartment(ctx: Ctx, id: string | null, raw: unknown, version?: number) {
  need(ctx, "structure.manage");
  const d = deptSchema.parse(raw);
  return db.$transaction(async (tx) => {
    await lockTree(tx, ctx.companyId, "dept");
    await assertNoCycle(tx, "department", ctx.companyId, id, d.parentId);
    if (!id) {
      const created = await tx.department.create({ data: { companyId: ctx.companyId, ...d } });
      await audit(tx, ctx, { action: "department.create", module: "structure", entityType: "department", entityId: created.id, summary: d.name });
      return created;
    }
    const before = await tx.department.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!before) throw notFound("El departamento");
    const n = await tx.department.updateMany({ where: { id, companyId: ctx.companyId, version }, data: { ...d, version: { increment: 1 } } });
    if (!n.count) throw conflict();
    await audit(tx, ctx, { action: "department.update", module: "structure", entityType: "department", entityId: id, changes: diff(before, d) });
    return before;
  });
}

export async function archiveDepartment(ctx: Ctx, id: string) {
  need(ctx, "structure.manage");
  await db.$transaction(async (tx) => {
    const d = await tx.department.findFirst({ where: { id, companyId: ctx.companyId, archivedAt: null } });
    if (!d) throw notFound("El departamento");
    const [emps, pos, kids] = await Promise.all([
      tx.employee.count({ where: { companyId: ctx.companyId, departmentId: id, status: { not: "FORMER" } } }),
      tx.position.count({ where: { companyId: ctx.companyId, departmentId: id, archivedAt: null } }),
      tx.department.count({ where: { companyId: ctx.companyId, parentId: id, archivedAt: null } }),
    ]);
    if (emps || pos || kids) throw invalid("Antes de archivarlo, reasigna a su personal y archiva sus puestos y subdepartamentos.");
    await tx.department.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(tx, ctx, { action: "department.archive", module: "structure", entityType: "department", entityId: id, summary: d.name });
  });
}

export async function savePosition(ctx: Ctx, id: string | null, raw: unknown, version?: number) {
  need(ctx, "structure.manage");
  const p = posSchema.parse(raw);
  return db.$transaction(async (tx) => {
    await lockTree(tx, ctx.companyId, "pos");
    const dept = await tx.department.findFirst({ where: { id: p.departmentId, companyId: ctx.companyId, archivedAt: null } });
    if (!dept) throw invalid("El departamento no existe en esta empresa.", { departmentId: "No válido" });
    await assertNoCycle(tx, "position", ctx.companyId, id, p.parentPositionId);
    if (!id) {
      const created = await tx.position.create({ data: { companyId: ctx.companyId, ...p } });
      await audit(tx, ctx, { action: "position.create", module: "structure", entityType: "position", entityId: created.id, summary: p.title });
      return created;
    }
    const before = await tx.position.findFirst({ where: { id, companyId: ctx.companyId } });
    if (!before) throw notFound("El puesto");
    const n = await tx.position.updateMany({ where: { id, companyId: ctx.companyId, version }, data: { ...p, version: { increment: 1 } } });
    if (!n.count) throw conflict();
    // Si el puesto cambió de departamento, sus ocupantes cambian con él (con historial).
    if (before.departmentId !== p.departmentId) {
      const occupants = await tx.employee.findMany({ where: { companyId: ctx.companyId, positionId: id, status: { not: "FORMER" } }, select: { id: true } });
      for (const o of occupants) await recordAssignment(tx, ctx, o.id, p.departmentId, id, "Puesto movido de departamento");
    }
    await audit(tx, ctx, { action: "position.update", module: "structure", entityType: "position", entityId: id, changes: diff(before, p) });
    return before;
  });
}

export async function archivePosition(ctx: Ctx, id: string) {
  need(ctx, "structure.manage");
  await db.$transaction(async (tx) => {
    const p = await tx.position.findFirst({ where: { id, companyId: ctx.companyId, archivedAt: null } });
    if (!p) throw notFound("El puesto");
    const [occ, kids] = await Promise.all([
      tx.employee.count({ where: { companyId: ctx.companyId, positionId: id, status: { not: "FORMER" } } }),
      tx.position.count({ where: { companyId: ctx.companyId, parentPositionId: id, archivedAt: null } }),
    ]);
    if (occ || kids) throw invalid("Reasigna a sus ocupantes y a los puestos que dependen de él antes de archivarlo.");
    await tx.position.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(tx, ctx, { action: "position.archive", module: "structure", entityType: "position", entityId: id, summary: p.title });
  });
}

/** Cierra la asignación vigente y abre otra. No reescribe asignaciones pasadas. */
export async function recordAssignment(tx: Tx, ctx: Ctx, employeeId: string, departmentId: string | null, positionId: string | null, reason: string) {
  const now = new Date();
  await tx.assignmentHistory.updateMany({ where: { companyId: ctx.companyId, employeeId, endedAt: null }, data: { endedAt: now } });
  await tx.assignmentHistory.create({ data: { companyId: ctx.companyId, employeeId, departmentId, positionId, startedAt: now, actorId: ctx.userId, reason } });
  await tx.employee.update({ where: { id: employeeId }, data: { departmentId, positionId, version: { increment: 1 } } });
}

export type OrgNode = {
  id: string;
  title: string;
  department: string;
  headcount: number | null;
  occupants: { id: string; name: string; status: string }[];
  children: OrgNode[];
};

/**
 * Organigrama real desde puestos y ocupantes actuales. Excluye exempleados.
 * Solo muestra nombre, puesto y departamento (datos básicos). El enlace al expediente
 * aparece únicamente si quien consulta puede verlo.
 */
export const canSeeOrgChart = (ctx: Ctx) => can(ctx, "structure.read") || can(ctx, "structure.manage");

export async function orgChart(ctx: Ctx) {
  // Reservado al propietario y a quien tenga permiso: revela quién ocupa cada puesto.
  if (!canSeeOrgChart(ctx)) need(ctx, "structure.read");
  const [positions, people] = await Promise.all([
    db.position.findMany({ where: { companyId: ctx.companyId, archivedAt: null }, include: { department: { select: { name: true } } }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    db.employee.findMany({
      where: { companyId: ctx.companyId, status: { in: ["ACTIVE", "SUSPENDED", "OFFBOARDING"] } },
      select: { id: true, firstName: true, lastName: true, status: true, positionId: true, departmentId: true, department: { select: { name: true } } },
      orderBy: [{ lastName: "asc" }],
    }),
  ]);
  const nodes = new Map<string, OrgNode>(
    positions.map((p) => [p.id, { id: p.id, title: p.title, department: p.department.name, headcount: p.headcount, occupants: [], children: [] }]),
  );
  const unassigned: { id: string; name: string; status: string; department: string | null }[] = [];
  for (const e of people) {
    const o = { id: e.id, name: `${e.firstName} ${e.lastName}`.trim(), status: e.status };
    const n = e.positionId ? nodes.get(e.positionId) : undefined;
    if (n) n.occupants.push(o);
    else unassigned.push({ ...o, department: e.department?.name ?? null });
  }
  const roots: OrgNode[] = [];
  for (const p of positions) {
    const n = nodes.get(p.id)!;
    const parent = p.parentPositionId ? nodes.get(p.parentPositionId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const canOpen = (employeeId: string, departmentId: string | null) => can(ctx, "employees.read", { departmentId, employeeId }) || ctx.employee?.id === employeeId;
  const openable = new Set(people.filter((e) => canOpen(e.id, e.departmentId)).map((e) => e.id));
  return { roots, unassigned, openable };
}

/** Supervisor(es) derivados de la jerarquía de puestos: ocupantes del puesto superior. Única fuente de autoridad. */
export async function supervisorsOf(companyId: string, positionId: string | null) {
  if (!positionId) return [];
  const p = await db.position.findFirst({ where: { id: positionId, companyId }, select: { parentPositionId: true } });
  if (!p?.parentPositionId) return [];
  return db.employee.findMany({
    where: { companyId, positionId: p.parentPositionId, status: { in: ["ACTIVE", "SUSPENDED", "OFFBOARDING"] } },
    select: { id: true, firstName: true, lastName: true },
  });
}
