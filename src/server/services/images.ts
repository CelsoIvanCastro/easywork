import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { type Ctx, need } from "../context";
import { invalid } from "../errors";
import { processUpload } from "../files";
import { newKey, storage } from "../storage";
import { scheduleFileDeletion } from "./documents";

async function storeImage(file: File | null) {
  const f = await processUpload(file);
  if (!f.mime.startsWith("image/")) throw invalid("Usa una imagen JPG, PNG o WEBP.", { file: "Solo imágenes" });
  if (f.scan === "PENDING") throw invalid("No se pudo analizar la imagen; inténtalo más tarde.");
  const key = newKey();
  await storage.put(key, f.data, f.mime);
  return { key, mime: f.mime };
}

/** Logotipo: lo ve cualquier miembro activo de la empresa. */
export async function setCompanyLogo(ctx: Ctx, file: File | null) {
  need(ctx, "settings.manage");
  const { key } = await storeImage(file);
  const old = await db.$transaction(async (tx) => {
    const c = await tx.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    await tx.company.update({ where: { id: ctx.companyId }, data: { logoKey: key } });
    await audit(tx, ctx, { action: "company.logo", module: "core", entityType: "company", entityId: ctx.companyId });
    return c.logoKey;
  });
  if (old) await scheduleFileDeletion([old]);
}

export async function readCompanyLogo(userId: string, companyId: string) {
  const m = await db.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, include: { company: { select: { logoKey: true } } } });
  if (!m || m.status !== "ACTIVE" || !m.company.logoKey) return null;
  return storage.get(m.company.logoKey);
}

/** Foto de perfil opcional: visible para la persona y para miembros activos de empresas que comparte. */
export async function setProfilePhoto(userId: string, file: File | null) {
  const { key } = await storeImage(file);
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { image: `key:${key}` } });
  if (u.image?.startsWith("key:")) await scheduleFileDeletion([u.image.slice(4)]);
}

export async function readProfilePhoto(viewerId: string, userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { image: true } });
  if (!u?.image?.startsWith("key:")) return null;
  if (viewerId !== userId) {
    const shared = await db.membership.count({ where: { userId, status: "ACTIVE", company: { memberships: { some: { userId: viewerId, status: "ACTIVE" } } } } });
    if (!shared) return null;
  }
  return storage.get(u.image.slice(4));
}
