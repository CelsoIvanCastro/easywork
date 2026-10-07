import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db, type Tx } from "../db";
import { audit } from "../audit";
import { AppError, conflict, forbidden, invalid, notFound } from "../errors";
import {
  type Ctx,
  can,
  loadCtx,
  need,
  requireOwner,
  requireRecentReauth,
  MODULE_DEPS,
  MODULE_LABELS,
  TOGGLEABLE_MODULES,
  type ModuleKey,
} from "../context";
import { GRANTABLE, isScoped, type Permission } from "../permissions";
import { civilDate, nextCode, rateLimit, todayIn } from "../util";
import { isValidRfc } from "@/lib/mx";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

const str = (max: number) => z.string().trim().max(max);
const optStr = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

export const companyInput = z.object({
  legalName: str(200).min(2, "Escribe el nombre legal."),
  tradeName: str(120).min(2, "Escribe el nombre comercial."),
  rfc: optStr(13).refine((v) => !v || isValidRfc(v), "RFC con formato inválido."),
  fiscalAddress: optStr(300),
  activity: optStr(120),
  description: optStr(1000),
  email: z.string().trim().max(200).optional().transform((v) => v || null).pipe(z.email("Correo inválido.").nullable()),
  phone: optStr(30),
  timezone: z.string().trim().max(60).optional(),
});

const DEFAULT_MODULES: Record<(typeof TOGGLEABLE_MODULES)[number], boolean> = {
  documents: true,
  announcements: true,
  inventory: false,
  suppliers: false,
  purchases: false,
  maintenance: false,
  ai: false,
};

/** Crea empresa + configuración + membresía propietaria + expediente del fundador en una sola transacción. */
export async function createCompany(user: { id: string; name: string; lastName: string; email: string; phone: string }, raw: unknown) {
  const input = companyInput.parse(raw);
  const tz = input.timezone && Intl.supportedValuesOf("timeZone").includes(input.timezone) ? input.timezone : "America/Mexico_City";
  await rateLimit(`company-create:${user.id}`, 5, 3600);
  return db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        ...input,
        rfc: input.rfc?.toUpperCase() ?? null,
        timezone: tz,
        code: `EW-${randomCode(6)}`,
        joinCode: randomCode(10),
        ownerId: user.id,
        settings: { create: {} },
        modules: { create: Object.entries(DEFAULT_MODULES).map(([module, enabled]) => ({ module, enabled })) },
      },
    });
    const number = await nextCode(tx, company.id, "employee", "EMP");
    const today = civilDate(todayIn(tz));
    const emp = await tx.employee.create({
      data: {
        companyId: company.id,
        number,
        userId: user.id,
        firstName: user.name,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || null,
        hireDate: today,
        createdById: user.id,
        periods: { create: { number: 1, startDate: today } },
      },
    });
    await tx.membership.create({ data: { companyId: company.id, userId: user.id, employeeId: emp.id } });
    await audit(tx, { companyId: company.id, userId: user.id, userLabel: `${user.name} ${user.lastName}` }, {
      action: "company.create",
      module: "core",
      entityType: "company",
      entityId: company.id,
      summary: `Empresa creada: ${company.tradeName}`,
    });
    return company;
  });
}

export async function listMyCompanies(userId: string) {
  const [memberships, requests] = await Promise.all([
    db.membership.findMany({
      where: { userId, status: "ACTIVE", company: { closedAt: null } },
      include: { company: { select: { id: true, tradeName: true, ownerId: true } }, employee: { select: { status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.joinRequest.findMany({
      where: { userId },
      include: { company: { select: { tradeName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return {
    companies: memberships
      .filter((m) => m.company.ownerId === userId || !m.employee || !["FORMER", "SUSPENDED"].includes(m.employee.status))
      .map((m) => ({ id: m.company.id, tradeName: m.company.tradeName, isOwner: m.company.ownerId === userId })),
    requests: requests.map((r) => ({ id: r.id, company: r.company.tradeName, status: r.status, createdAt: r.createdAt, note: r.decisionNote })),
  };
}

const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, "El código tiene 10 caracteres.");

/** Solo datos públicos mínimos. Limitado por persona e IP para impedir enumeración. */
export async function lookupJoinCode(userId: string, ip: string, raw: string) {
  await rateLimit(`join-lookup:u:${userId}`, 10, 900);
  await rateLimit(`join-lookup:ip:${ip}`, 30, 900);
  const code = codeSchema.parse(raw);
  const c = await db.company.findUnique({ where: { joinCode: code }, select: { tradeName: true, activity: true } });
  if (!c) throw new AppError("NOT_FOUND", "No encontramos una empresa con ese código.");
  return c;
}

export async function requestJoin(userId: string, ip: string, rawCode: string, rawMessage: string) {
  await rateLimit(`join-request:u:${userId}`, 5, 3600);
  await rateLimit(`join-lookup:ip:${ip}`, 30, 900);
  const code = codeSchema.parse(rawCode);
  const message = z.string().trim().max(500).parse(rawMessage ?? "") || null;
  const company = await db.company.findUnique({ where: { joinCode: code }, select: { id: true, tradeName: true } });
  if (!company) throw new AppError("NOT_FOUND", "No encontramos una empresa con ese código.");
  const m = await db.membership.findUnique({ where: { companyId_userId: { companyId: company.id, userId } } });
  if (m?.status === "ACTIVE") throw conflict("Ya perteneces a esta empresa.");
  try {
    return await db.$transaction(async (tx) => {
      const r = await tx.joinRequest.create({ data: { companyId: company.id, userId, message } });
      await audit(tx, { companyId: company.id, userId, userLabel: "Solicitante" }, {
        action: "joinRequest.create",
        module: "core",
        entityType: "joinRequest",
        entityId: r.id,
      });
      return r;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("Ya tienes una solicitud pendiente en esta empresa.");
    throw e;
  }
}

export async function cancelMyRequest(userId: string, id: string) {
  const n = await db.joinRequest.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (!n.count) throw notFound("La solicitud");
}

export async function listJoinRequests(ctx: Ctx, status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  need(ctx, "joinRequests.review");
  return db.joinRequest.findMany({
    where: { companyId: ctx.companyId, status },
    include: { user: { select: { name: true, lastName: true, email: true, phone: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}

const approveSchema = z.object({
  mode: z.enum(["new", "link"]),
  employeeId: z.string().optional(),
  departmentId: z.string().optional().transform((v) => v || null),
  positionId: z.string().optional().transform((v) => v || null),
  hireDate: z.string().optional(),
});

/** Aprueba con bloqueo de fila: dos aprobaciones simultáneas no duplican membresía ni expediente. */
export async function approveJoinRequest(ctx: Ctx, id: string, raw: unknown) {
  need(ctx, "joinRequests.review");
  const input = approveSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM join_request WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`;
    if (!locked.length) throw notFound("La solicitud");
    if (locked[0].status !== "PENDING") throw conflict("La solicitud ya fue resuelta.");
    const req = await tx.joinRequest.findUniqueOrThrow({ where: { id }, include: { user: true } });
    const existing = await tx.membership.findUnique({ where: { companyId_userId: { companyId: ctx.companyId, userId: req.userId } } });
    if (existing?.status === "ACTIVE") throw conflict("La persona ya es miembro.");
    const { departmentId, positionId } = await validatePlacement(tx, ctx.companyId, input.departmentId, input.positionId);
    let employeeId: string;
    if (input.mode === "link") {
      // Vinculación explícita a un expediente existente sin cuenta: nunca por coincidencia de nombre.
      const emp = await tx.employee.findFirst({ where: { id: input.employeeId, companyId: ctx.companyId } });
      if (!emp) throw notFound("El expediente");
      if (emp.userId && emp.userId !== req.userId) throw conflict("Ese expediente ya está vinculado a otra cuenta.");
      if (emp.status === "FORMER") throw invalid("Ese expediente es de un exempleado: usa Recontratar desde el expediente.");
      await tx.employee.update({ where: { id: emp.id }, data: { userId: req.userId, version: { increment: 1 } } });
      employeeId = emp.id;
    } else {
      const prior = await tx.employee.findUnique({ where: { companyId_userId: { companyId: ctx.companyId, userId: req.userId } } });
      if (prior) throw conflict("Esta cuenta ya tiene un expediente en la empresa (posible exempleado). Usa Recontratar desde su expediente.");
      const start = civilDate(input.hireDate || todayIn(ctx.company.timezone));
      const number = await nextCode(tx, ctx.companyId, "employee", "EMP");
      const emp = await tx.employee.create({
        data: {
          companyId: ctx.companyId,
          number,
          userId: req.userId,
          firstName: req.user.name,
          lastName: req.user.lastName,
          email: req.user.email,
          phone: req.user.phone || null,
          departmentId,
          positionId,
          hireDate: start,
          createdById: ctx.userId,
          periods: { create: { number: 1, startDate: start } },
          assignments: departmentId || positionId ? { create: { departmentId, positionId, actorId: ctx.userId, reason: "Alta por solicitud" } } : undefined,
        },
      });
      employeeId = emp.id;
    }
    if (existing) {
      // Membresía revocada anterior: se reactiva sin restaurar acceso completo ni concesiones antiguas.
      await tx.grant.deleteMany({ where: { companyId: ctx.companyId, membershipId: existing.id } });
      await tx.membership.update({ where: { id: existing.id }, data: { status: "ACTIVE", fullAccess: false, employeeId } });
    } else {
      await tx.membership.create({ data: { companyId: ctx.companyId, userId: req.userId, employeeId } });
    }
    await tx.joinRequest.update({ where: { id }, data: { status: "APPROVED", decidedById: ctx.userId, decidedAt: new Date(), employeeId } });
    await audit(tx, ctx, {
      action: "joinRequest.approve",
      module: "core",
      entityType: "employee",
      entityId: employeeId,
      departmentId,
      summary: `Solicitud aprobada (${input.mode === "link" ? "vinculada a expediente existente" : "expediente nuevo"})`,
    });
    return { employeeId };
  });
}

export async function rejectJoinRequest(ctx: Ctx, id: string, note: string) {
  need(ctx, "joinRequests.review");
  await db.$transaction(async (tx) => {
    const n = await tx.joinRequest.updateMany({
      where: { id, companyId: ctx.companyId, status: "PENDING" },
      data: { status: "REJECTED", decidedById: ctx.userId, decidedAt: new Date(), decisionNote: z.string().trim().max(300).parse(note ?? "") || null },
    });
    if (!n.count) throw conflict("La solicitud ya fue resuelta o no existe.");
    await audit(tx, ctx, { action: "joinRequest.reject", module: "core", entityType: "joinRequest", entityId: id });
  });
}

/** Valida que departamento y puesto pertenezcan a la empresa, estén activos y sean coherentes. */
export async function validatePlacement(tx: Tx, companyId: string, departmentId: string | null, positionId: string | null) {
  if (positionId) {
    const p = await tx.position.findFirst({ where: { id: positionId, companyId, archivedAt: null } });
    if (!p) throw invalid("El puesto no existe en esta empresa.");
    if (departmentId && departmentId !== p.departmentId) throw invalid("El puesto no pertenece al departamento elegido.");
    return { departmentId: p.departmentId, positionId };
  }
  if (departmentId) {
    const d = await tx.department.findFirst({ where: { id: departmentId, companyId, archivedAt: null } });
    if (!d) throw invalid("El departamento no existe en esta empresa.");
  }
  return { departmentId, positionId: null };
}

// ───────── Configuración de empresa ─────────

export async function getCompany(ctx: Ctx) {
  const c = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, include: { settings: true } });
  const full = can(ctx, "settings.manage") || ctx.isOwner;
  return {
    id: c.id,
    code: c.code,
    tradeName: c.tradeName,
    legalName: c.legalName,
    activity: c.activity,
    description: c.description,
    timezone: c.timezone,
    version: c.version,
    hasLogo: !!c.logoKey,
    // Datos administrativos solo para quien administra la empresa.
    rfc: full ? c.rfc : null,
    fiscalAddress: full ? c.fiscalAddress : null,
    email: full ? c.email : null,
    phone: full ? c.phone : null,
    joinCode: ctx.isOwner || can(ctx, "joinRequests.review") ? c.joinCode : null,
    settings: full ? c.settings : null,
    setupMissing: full ? (["rfc", "fiscalAddress", "activity", "email"] as const).filter((k) => !c[k]) : [],
  };
}

export async function updateCompany(ctx: Ctx, raw: unknown, version: number) {
  need(ctx, "settings.manage");
  const input = companyInput.parse(raw);
  await db.$transaction(async (tx) => {
    const before = await tx.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    const n = await tx.company.updateMany({
      where: { id: ctx.companyId, version },
      data: { ...input, rfc: input.rfc?.toUpperCase() ?? null, timezone: input.timezone || before.timezone, version: { increment: 1 } },
    });
    if (!n.count) throw conflict();
    const { diff } = await import("../audit");
    await audit(tx, ctx, { action: "company.update", module: "core", entityType: "company", entityId: ctx.companyId, changes: diff(before, input) });
  });
}

export async function regenerateJoinCode(ctx: Ctx) {
  requireOwner(ctx);
  await db.$transaction(async (tx) => {
    await tx.company.update({ where: { id: ctx.companyId }, data: { joinCode: randomCode(10) } });
    await audit(tx, ctx, { action: "company.joinCode.regenerate", module: "core", entityType: "company", entityId: ctx.companyId });
  });
}

const settingsSchema = z.object({
  docExpiryLeadDays: z.coerce.number().int().min(1).max(365),
  contractExpiryLeadDays: z.coerce.number().int().min(1).max(365),
  maintenanceLeadDays: z.coerce.number().int().min(0).max(365),
  requiredEmployeeFields: z.array(z.string()).max(20),
  requiredDocTypes: z.array(z.string()).max(30),
});

export async function updateSettings(ctx: Ctx, raw: unknown) {
  need(ctx, "alerts.manage");
  const input = settingsSchema.parse(raw);
  const { EMPLOYEE_FIELDS, DOC_TYPES } = await import("@/lib/catalogs");
  if (input.requiredEmployeeFields.some((f) => !(f in EMPLOYEE_FIELDS)) || input.requiredDocTypes.some((d) => !(d in DOC_TYPES)))
    throw invalid("Campo o tipo de documento no reconocido.");
  await db.$transaction(async (tx) => {
    await tx.companySettings.update({ where: { companyId: ctx.companyId }, data: { ...input, version: { increment: 1 } } });
    await audit(tx, ctx, { action: "settings.update", module: "core", entityType: "company", entityId: ctx.companyId, changes: input });
  });
}

export async function setRetention(ctx: Ctx, years: number | null) {
  requireOwner(ctx);
  requireRecentReauth(ctx);
  const v = years === null ? null : z.number().int().min(1).max(100).parse(years);
  await db.$transaction(async (tx) => {
    await tx.companySettings.update({ where: { companyId: ctx.companyId }, data: { retentionYearsAfterExit: v } });
    await audit(tx, ctx, { action: "settings.retention", module: "core", entityType: "company", entityId: ctx.companyId, changes: { retentionYearsAfterExit: v } });
  });
}

/** Activar/desactivar módulos conserva todos los datos. Respeta dependencias. */
export async function setModule(ctx: Ctx, module: string, enabled: boolean) {
  requireOwner(ctx);
  if (!(TOGGLEABLE_MODULES as readonly string[]).includes(module)) throw invalid("Módulo desconocido.");
  const m = module as ModuleKey;
  const state = new Map((await db.companyModule.findMany({ where: { companyId: ctx.companyId } })).map((x) => [x.module, x.enabled]));
  if (enabled) {
    const missing = (MODULE_DEPS[m] ?? []).filter((d) => !state.get(d));
    if (missing.length) throw invalid(`Activa primero: ${missing.map((d) => MODULE_LABELS[d]).join(", ")}.`);
  } else {
    const dependents = Object.entries(MODULE_DEPS).filter(([k, deps]) => deps!.includes(m) && state.get(k)).map(([k]) => MODULE_LABELS[k as ModuleKey]);
    if (dependents.length) throw invalid(`No puedes desactivarlo mientras estén activos: ${dependents.join(", ")}.`);
  }
  await db.$transaction(async (tx) => {
    await tx.companyModule.upsert({
      where: { companyId_module: { companyId: ctx.companyId, module } },
      create: { companyId: ctx.companyId, module, enabled, updatedById: ctx.userId },
      update: { enabled, updatedById: ctx.userId },
    });
    await audit(tx, ctx, { action: enabled ? "module.enable" : "module.disable", module: "core", entityType: "company", entityId: ctx.companyId, summary: MODULE_LABELS[m] });
  });
}

// ───────── Miembros y permisos (solo propietario) ─────────

export async function listMembers(ctx: Ctx) {
  need(ctx, "permissions.manage");
  const ms = await db.membership.findMany({
    where: { companyId: ctx.companyId },
    include: {
      user: { select: { name: true, lastName: true, email: true, twoFactorEnabled: true } },
      employee: { select: { id: true, number: true, status: true, department: { select: { name: true } }, position: { select: { title: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return ms.map((m) => ({ ...m, isOwner: m.userId === ctx.company.ownerId }));
}

async function lockTargetMembership(tx: Tx, ctx: Ctx, membershipId: string) {
  const m = await tx.membership.findFirst({ where: { id: membershipId, companyId: ctx.companyId } });
  if (!m) throw notFound("El miembro");
  if (m.userId === ctx.company.ownerId) throw forbidden("Los permisos del propietario no se pueden modificar.");
  return m;
}

export async function setFullAccess(ctx: Ctx, membershipId: string, enabled: boolean) {
  requireOwner(ctx);
  requireRecentReauth(ctx);
  await db.$transaction(async (tx) => {
    const m = await lockTargetMembership(tx, ctx, membershipId);
    if (m.status !== "ACTIVE") throw invalid("El miembro no está activo.");
    await tx.membership.update({
      where: { id: m.id },
      data: { fullAccess: enabled, fullAccessById: enabled ? ctx.userId : null, fullAccessAt: enabled ? new Date() : null },
    });
    await audit(tx, ctx, { action: enabled ? "access.full.grant" : "access.full.revoke", module: "core", entityType: "membership", entityId: m.id });
  });
}

const grantSchema = z.object({
  subjectType: z.enum(["MEMBER", "POSITION", "DEPARTMENT"]),
  subjectId: z.string().min(1),
  permission: z.string(),
  effect: z.enum(["ALLOW", "DENY"]),
  scope: z.enum(["OWN", "DEPARTMENTS", "COMPANY"]),
  scopeDepartmentIds: z.array(z.string()).max(100).default([]),
});

export async function addGrant(ctx: Ctx, raw: unknown) {
  requireOwner(ctx);
  requireRecentReauth(ctx);
  const g = grantSchema.parse(raw);
  if (!GRANTABLE.includes(g.permission as Permission)) throw invalid("Ese permiso no se puede conceder.");
  const scope = isScoped(g.permission as Permission) ? g.scope : "COMPANY";
  if (scope === "DEPARTMENTS" && !g.scopeDepartmentIds.length) throw invalid("Elige al menos un departamento.");
  if (scope === "OWN" && g.subjectType !== "MEMBER" && g.effect === "DENY") throw invalid("Restricción de propios solo aplica a personas.");
  return db.$transaction(async (tx) => {
    if (scope === "DEPARTMENTS") {
      const n = await tx.department.count({ where: { companyId: ctx.companyId, id: { in: g.scopeDepartmentIds } } });
      if (n !== new Set(g.scopeDepartmentIds).size) throw invalid("Algún departamento no pertenece a esta empresa.");
    }
    const subject =
      g.subjectType === "MEMBER"
        ? { membershipId: (await lockTargetMembership(tx, ctx, g.subjectId)).id }
        : g.subjectType === "POSITION"
          ? { positionId: (await tx.position.findFirst({ where: { id: g.subjectId, companyId: ctx.companyId } }))?.id }
          : { departmentId: (await tx.department.findFirst({ where: { id: g.subjectId, companyId: ctx.companyId } }))?.id };
    if (!Object.values(subject)[0]) throw notFound("El destinatario");
    const grant = await tx.grant.create({
      data: {
        companyId: ctx.companyId,
        subjectType: g.subjectType,
        ...subject,
        permission: g.permission,
        effect: g.effect,
        scope,
        scopeDepartmentIds: scope === "DEPARTMENTS" ? [...new Set(g.scopeDepartmentIds)] : [],
        createdById: ctx.userId,
      },
    });
    await audit(tx, ctx, {
      action: g.effect === "ALLOW" ? "grant.add" : "grant.restrict",
      module: "core",
      entityType: g.subjectType.toLowerCase(),
      entityId: g.subjectId,
      changes: { permission: g.permission, scope, effect: g.effect, departments: grant.scopeDepartmentIds },
    });
    return grant;
  });
}

export async function removeGrant(ctx: Ctx, grantId: string) {
  requireOwner(ctx);
  requireRecentReauth(ctx);
  await db.$transaction(async (tx) => {
    const g = await tx.grant.findFirst({ where: { id: grantId, companyId: ctx.companyId } });
    if (!g) throw notFound("La concesión");
    await tx.grant.delete({ where: { id: g.id } });
    await audit(tx, ctx, {
      action: "grant.remove",
      module: "core",
      entityType: g.subjectType.toLowerCase(),
      entityId: g.membershipId ?? g.positionId ?? g.departmentId ?? undefined,
      changes: { permission: g.permission, scope: g.scope, effect: g.effect },
    });
  });
}

export async function listGrants(ctx: Ctx, filter: { membershipId?: string; positionId?: string; departmentId?: string }) {
  need(ctx, "permissions.manage");
  return db.grant.findMany({ where: { companyId: ctx.companyId, ...filter }, orderBy: [{ permission: "asc" }] });
}

/** Permisos efectivos de un miembro con su origen, calculados con el mismo algoritmo que el servidor. */
export async function effectivePermissionsOf(ctx: Ctx, membershipId: string) {
  need(ctx, "permissions.manage");
  const m = await db.membership.findFirst({ where: { id: membershipId, companyId: ctx.companyId } });
  if (!m) throw notFound("El miembro");
  if (m.status !== "ACTIVE") return null;
  try {
    const target = await loadCtx(m.userId, ctx.companyId);
    return target.perms;
  } catch {
    return null;
  }
}
