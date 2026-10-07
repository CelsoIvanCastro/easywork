import "server-only";
import { z } from "zod";
import { db, type Prisma } from "../db";
import { audit } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { type Ctx, can, need, requireModule } from "../context";
import { pageArgs, PAGE_SIZE } from "../util";

const schema = z.object({
  title: z.string().trim().min(1, "Requerido").max(160),
  // Texto plano: se muestra escapado (sin HTML), así que no requiere sanitización de contenido enriquecido.
  body: z.string().trim().min(1, "Requerido").max(10000),
  audience: z.enum(["all", "departments"]),
  departmentIds: z.array(z.string()).max(100).default([]),
});

/** Avisos visibles: toda la empresa o los departamentos de la persona. Quien publica ve todos. */
export async function listAnnouncements(ctx: Ctx, f: { archived?: boolean; page?: number }) {
  requireModule(ctx, "announcements");
  const publisher = can(ctx, "announcements.publish");
  const page = Math.max(1, f.page ?? 1);
  const myDept = ctx.employee?.departmentId;
  const where: Prisma.AnnouncementWhereInput = {
    companyId: ctx.companyId,
    archivedAt: f.archived && publisher ? { not: null } : null,
    ...(publisher ? {} : { OR: [{ allCompany: true }, ...(myDept ? [{ departments: { some: { departmentId: myDept } } }] : [])] }),
  };
  const [rows, total] = await Promise.all([
    db.announcement.findMany({ where, ...pageArgs(page), orderBy: { publishedAt: "desc" }, include: { departments: { include: { department: { select: { name: true } } } } } }),
    db.announcement.count({ where }),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE, publisher };
}

async function setDepartments(tx: Prisma.TransactionClient, ctx: Ctx, id: string, a: z.infer<typeof schema>) {
  await tx.announcementDepartment.deleteMany({ where: { announcementId: id } });
  if (a.audience === "all") return;
  const ids = [...new Set(a.departmentIds)];
  if (!ids.length) throw invalid("Elige al menos un departamento.");
  if ((await tx.department.count({ where: { companyId: ctx.companyId, id: { in: ids }, archivedAt: null } })) !== ids.length) throw invalid("Algún departamento no pertenece a esta empresa.");
  await tx.announcementDepartment.createMany({ data: ids.map((departmentId) => ({ companyId: ctx.companyId, announcementId: id, departmentId })) });
}

export async function publish(ctx: Ctx, raw: unknown) {
  requireModule(ctx, "announcements");
  need(ctx, "announcements.publish");
  const a = schema.parse(raw);
  return db.$transaction(async (tx) => {
    const ann = await tx.announcement.create({ data: { companyId: ctx.companyId, title: a.title, body: a.body, allCompany: a.audience === "all", authorId: ctx.userId, authorLabel: ctx.userLabel } });
    await setDepartments(tx, ctx, ann.id, a);
    await audit(tx, ctx, { action: "announcement.publish", module: "announcements", entityType: "announcement", entityId: ann.id, summary: a.title });
    return ann;
  });
}

export async function editAnnouncement(ctx: Ctx, id: string, raw: unknown, version: number) {
  requireModule(ctx, "announcements");
  need(ctx, "announcements.publish");
  const a = schema.parse(raw);
  await db.$transaction(async (tx) => {
    const n = await tx.announcement.updateMany({ where: { id, companyId: ctx.companyId, version }, data: { title: a.title, body: a.body, allCompany: a.audience === "all", version: { increment: 1 } } });
    if (!n.count) {
      if (!(await tx.announcement.findFirst({ where: { id, companyId: ctx.companyId } }))) throw notFound("El aviso");
      throw conflict();
    }
    await setDepartments(tx, ctx, id, a);
    await audit(tx, ctx, { action: "announcement.edit", module: "announcements", entityType: "announcement", entityId: id, summary: a.title });
  });
}

export async function archiveAnnouncement(ctx: Ctx, id: string) {
  requireModule(ctx, "announcements");
  need(ctx, "announcements.publish");
  await db.$transaction(async (tx) => {
    const n = await tx.announcement.updateMany({ where: { id, companyId: ctx.companyId, archivedAt: null }, data: { archivedAt: new Date() } });
    if (!n.count) throw notFound("El aviso");
    await audit(tx, ctx, { action: "announcement.archive", module: "announcements", entityType: "announcement", entityId: id });
  });
}
