import "server-only";
import { db, type Prisma } from "./db";
import { AppError, forbidden, notFound } from "./errors";
import { allows, resolvePermissions, type Permission, type PermissionSet, type Target, PERMISSIONS } from "./permissions";
import { env } from "./env";

export const TOGGLEABLE_MODULES = ["documents", "inventory", "suppliers", "purchases", "maintenance", "announcements", "ai"] as const;
export type ModuleKey = (typeof TOGGLEABLE_MODULES)[number] | "core" | "employees";
// Dependencias: no se puede activar un módulo sin las suyas, ni desactivar una dependencia en uso.
export const MODULE_DEPS: Partial<Record<ModuleKey, ModuleKey[]>> = {
  purchases: ["suppliers", "inventory"],
  maintenance: ["inventory"],
};
export const MODULE_LABELS: Record<ModuleKey, string> = {
  core: "Núcleo",
  employees: "Personal",
  documents: "Documentos",
  inventory: "Inventario y activos",
  suppliers: "Proveedores",
  purchases: "Compras",
  maintenance: "Mantenimiento",
  announcements: "Avisos",
  ai: "IA empresarial",
};

export type SessionInfo = { id: string; reauthAt: Date | null; twoFactorEnabled: boolean };

export type Ctx = {
  userId: string;
  userLabel: string;
  companyId: string;
  company: { id: string; tradeName: string; timezone: string; ownerId: string | null };
  membershipId: string;
  isOwner: boolean;
  fullAccess: boolean;
  employee: { id: string; departmentId: string | null; positionId: string | null; status: string } | null;
  perms: PermissionSet;
  modules: Set<ModuleKey>;
  session?: SessionInfo;
};

/** Construye el contexto desde la identidad del servidor. companyId del cliente solo selecciona; no autoriza. */
export async function loadCtx(userId: string, companyId: string, session?: SessionInfo): Promise<Ctx> {
  const m = await db.membership.findUnique({
    where: { companyId_userId: { companyId, userId } },
    include: {
      company: { select: { id: true, tradeName: true, timezone: true, ownerId: true, closedAt: true } },
      employee: { select: { id: true, departmentId: true, positionId: true, status: true } },
      user: { select: { name: true, lastName: true } },
    },
  });
  // Empresa cerrada: nadie opera en ella (sus datos se conservan según la política de retención).
  if (!m || m.status !== "ACTIVE" || m.company.closedAt) throw notFound("La empresa");
  const isOwner = m.company.ownerId === userId;
  const emp = m.employee;
  if (!isOwner && emp && (emp.status === "FORMER" || emp.status === "SUSPENDED")) throw notFound("La empresa");
  const inheritGroups = !!emp && emp.status === "ACTIVE";
  const or: Prisma.GrantWhereInput[] = [{ membershipId: m.id }];
  if (inheritGroups && emp.positionId) or.push({ positionId: emp.positionId });
  if (inheritGroups && emp.departmentId) or.push({ departmentId: emp.departmentId });
  const [grants, mods] = await Promise.all([
    isOwner
      ? Promise.resolve([])
      : db.grant.findMany({
          where: { companyId, OR: or },
          include: { position: { select: { title: true } }, department: { select: { name: true } } },
        }),
    db.companyModule.findMany({ where: { companyId, enabled: true }, select: { module: true } }),
  ]);
  const perms = resolvePermissions({
    isOwner,
    fullAccess: m.fullAccess,
    inheritGroups,
    grants: grants.map((g) => ({
      id: g.id,
      permission: g.permission,
      effect: g.effect,
      scope: g.scope,
      scopeDepartmentIds: g.scopeDepartmentIds,
      subjectType: g.subjectType,
      subjectLabel:
        g.subjectType === "MEMBER" ? "Concesión directa" : g.subjectType === "POSITION" ? `Puesto: ${g.position?.title}` : `Departamento: ${g.department?.name}`,
    })),
  });
  return {
    userId,
    userLabel: `${m.user.name} ${m.user.lastName}`.trim(),
    companyId,
    company: { id: m.company.id, tradeName: m.company.tradeName, timezone: m.company.timezone, ownerId: m.company.ownerId },
    membershipId: m.id,
    isOwner,
    fullAccess: m.fullAccess,
    employee: emp,
    perms,
    modules: new Set<ModuleKey>(["core", "employees", ...(mods.map((x) => x.module) as ModuleKey[])]),
    session,
  };
}

export const moduleOn = (ctx: Ctx, m: ModuleKey) => ctx.modules.has(m);

export function requireModule(ctx: Ctx, m: ModuleKey) {
  if (!ctx.modules.has(m)) throw new AppError("FORBIDDEN", `El módulo ${MODULE_LABELS[m]} está desactivado en esta empresa.`);
}

export function can(ctx: Ctx, p: Permission, target?: Target): boolean {
  if (!ctx.modules.has(PERMISSIONS[p].module as ModuleKey)) return false;
  return allows(ctx.perms, p, target, ctx.employee?.id ?? null);
}

export function need(ctx: Ctx, p: Permission, target?: Target, msg?: string) {
  if (!can(ctx, p, target)) throw forbidden(msg);
}

export const isSelf = (ctx: Ctx, employeeId: string) => ctx.employee?.id === employeeId;

/** Filtro de expedientes visibles con un permiso con alcance. null = ninguno. */
export function employeeScope(ctx: Ctx, p: Permission, includeSelf = false): Prisma.EmployeeWhereInput | null {
  const e = can(ctx, p) ? ctx.perms.get(p) : undefined;
  const or: Prisma.EmployeeWhereInput[] = [];
  if (e?.company) {
    if (!e.excluded.size) return { companyId: ctx.companyId };
    or.push({ departmentId: null }, { departmentId: { notIn: [...e.excluded] } });
  }
  if (e?.departments.size) or.push({ departmentId: { in: [...e.departments] } });
  if ((e?.own || includeSelf) && ctx.employee) or.push({ id: ctx.employee.id });
  return or.length ? { companyId: ctx.companyId, OR: or } : null;
}

export function requireOwner(ctx: Ctx) {
  if (!ctx.isOwner) throw forbidden("Solo el propietario de la empresa puede realizar esta acción.");
}

const REAUTH_WINDOW_MS = 10 * 60 * 1000;
/** Acciones de alto riesgo: reautenticación reciente y, si la política lo exige, 2FA activo. */
export function requireRecentReauth(ctx: Ctx) {
  const s = ctx.session;
  if (!s) throw new AppError("REAUTH", "Confirma tu identidad para continuar.");
  if (env.requirePrivileged2fa && !s.twoFactorEnabled)
    throw new AppError("REAUTH", "Activa la verificación en dos pasos en Mi cuenta antes de realizar acciones privilegiadas.");
  if (!s.reauthAt || Date.now() - s.reauthAt.getTime() > REAUTH_WINDOW_MS)
    throw new AppError("REAUTH", "Confirma tu contraseña para realizar esta acción (válido 10 minutos).");
}
