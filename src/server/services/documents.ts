import "server-only";
import { z } from "zod";
import { db, type Prisma, type Tx } from "../db";
import { audit, auditNow } from "../audit";
import { forbidden, invalid, notFound } from "../errors";
import { type Ctx, can, employeeScope, isSelf, need, requireModule } from "../context";
import { processUpload, type ProcessedFile } from "../files";
import { env } from "../env";
import { newKey, storage } from "../storage";
import { civilDate, pageArgs, PAGE_SIZE } from "../util";
import { DOC_TYPES } from "@/lib/catalogs";
import type { Permission } from "../permissions";

export type DocAction = "view" | "preview" | "download" | "upload" | "version";

type DocRow = {
  id: string;
  companyId: string;
  confidential: boolean;
  folderId: string | null;
  employeeId: string | null;
  supplierId: string | null;
  purchaseId: string | null;
  assetId: string | null;
  maintenanceId: string | null;
};

const ENTITY_PERMS: Record<"supplierId" | "purchaseId" | "assetId" | "maintenanceId", { read: Permission; write: Permission }> = {
  supplierId: { read: "suppliers.read", write: "suppliers.manage" },
  purchaseId: { read: "purchases.read", write: "purchases.manage" },
  assetId: { read: "inventory.read", write: "inventory.manage" },
  maintenanceId: { read: "maintenance.read", write: "maintenance.manage" },
};

/**
 * Política única de acceso documental (se evalúa en cada solicitud, también para versiones antiguas):
 * - Documento de expediente: permisos employees.documents.* con alcance del empleado; el titular ve los suyos.
 * - Documento de proveedor/compra/activo/mantenimiento: permiso de lectura/gestión de ese módulo.
 * - Documento general: documents.*; si es confidencial (propio o heredado de la carpeta), además documents.confidential.
 */
export async function docAllowed(ctx: Ctx, d: DocRow, action: DocAction): Promise<boolean> {
  if (d.companyId !== ctx.companyId) return false;
  if (d.employeeId) {
    const e = await db.employee.findFirst({ where: { id: d.employeeId, companyId: ctx.companyId }, select: { id: true, departmentId: true } });
    if (!e) return false;
    const t = { employeeId: e.id, departmentId: e.departmentId };
    const perm = (action === "version" ? "employees.documents.upload" : `employees.documents.${action}`) as Permission;
    return can(ctx, perm, t) || (isSelf(ctx, e.id) && ["view", "preview", "download"].includes(action));
  }
  for (const k of Object.keys(ENTITY_PERMS) as (keyof typeof ENTITY_PERMS)[]) {
    if (d[k]) {
      const p = ENTITY_PERMS[k];
      if (!can(ctx, ["upload", "version"].includes(action) ? p.write : p.read)) return false;
      return !(await isConfidential(d)) || can(ctx, "documents.confidential");
    }
  }
  if (!can(ctx, `documents.${action}` as Permission)) return false;
  return !(await isConfidential(d)) || can(ctx, "documents.confidential");
}

async function isConfidential(d: DocRow) {
  if (d.confidential) return true;
  if (!d.folderId) return false;
  // Herencia: una carpeta confidencial (o cualquier ancestro) hace confidencial su contenido.
  const rows = await db.$queryRaw<{ confidential: boolean }[]>`
    WITH RECURSIVE up AS (SELECT id, "parentId", confidential, 1 AS n FROM folder WHERE id = ${d.folderId}
      UNION ALL SELECT f.id, f."parentId", f.confidential, up.n + 1 FROM folder f JOIN up ON f.id = up."parentId" WHERE up.n < 50)
    SELECT confidential FROM up`;
  return rows.some((r) => r.confidential);
}

const uploadSchema = z.object({
  title: z.string().trim().min(1, "Escribe un título").max(200),
  category: z.string().trim().max(80).optional().transform((v) => v || null),
  docType: z.string().optional().transform((v) => v || null).refine((v) => !v || v in DOC_TYPES, "Tipo no válido"),
  folderId: z.string().optional().transform((v) => v || null),
  confidential: z.string().optional().transform((v) => v === "on" || v === "true"),
  expiresOn: z.string().optional().transform((v) => (v ? civilDate(v) : null)),
  employeeId: z.string().optional().transform((v) => v || null),
  contractId: z.string().optional().transform((v) => v || null),
  supplierId: z.string().optional().transform((v) => v || null),
  purchaseId: z.string().optional().transform((v) => v || null),
  assetId: z.string().optional().transform((v) => v || null),
  maintenanceId: z.string().optional().transform((v) => v || null),
});

/** Verifica que cada referencia exista y pertenezca a la empresa activa. */
async function validateLinks(tx: Tx, ctx: Ctx, d: z.infer<typeof uploadSchema>) {
  const links = (["employeeId", "supplierId", "purchaseId", "assetId", "maintenanceId"] as const).filter((k) => d[k]);
  if (links.length > 1) throw invalid("Un documento solo se puede vincular a un registro.");
  const c = ctx.companyId;
  const checks: Promise<unknown>[] = [];
  if (d.folderId) checks.push(tx.folder.findFirst({ where: { id: d.folderId, companyId: c, archivedAt: null } }));
  if (d.employeeId) checks.push(tx.employee.findFirst({ where: { id: d.employeeId, companyId: c } }));
  if (d.contractId) checks.push(tx.employeeContract.findFirst({ where: { id: d.contractId, companyId: c, employeeId: d.employeeId ?? "-" } }));
  if (d.supplierId) checks.push(tx.supplier.findFirst({ where: { id: d.supplierId, companyId: c } }));
  if (d.purchaseId) checks.push(tx.purchase.findFirst({ where: { id: d.purchaseId, companyId: c } }));
  if (d.assetId) checks.push(tx.asset.findFirst({ where: { id: d.assetId, companyId: c } }));
  if (d.maintenanceId) checks.push(tx.maintenanceRecord.findFirst({ where: { id: d.maintenanceId, companyId: c } }));
  if ((await Promise.all(checks)).some((x) => !x)) throw invalid("Una referencia no pertenece a esta empresa.");
  if (d.supplierId) requireModule(ctx, "suppliers");
  if (d.purchaseId) requireModule(ctx, "purchases");
  if (d.assetId) requireModule(ctx, "inventory");
  if (d.maintenanceId) requireModule(ctx, "maintenance");
  if (!d.employeeId && !d.supplierId && !d.purchaseId && !d.assetId && !d.maintenanceId) requireModule(ctx, "documents");
}

/** Guarda archivo → registra metadatos en transacción. Si la transacción falla, se borra el archivo. */
async function withStoredFile<T>(f: ProcessedFile, fn: (key: string) => Promise<T>): Promise<T> {
  const key = newKey();
  await storage.put(key, f.data, f.mime);
  try {
    return await fn(key);
  } catch (e) {
    await storage.remove(key).catch(() => {});
    throw e;
  }
}

export async function uploadDocument(ctx: Ctx, raw: Record<string, unknown>, file: File | null) {
  const d = uploadSchema.parse(raw);
  const probe: DocRow = { id: "", companyId: ctx.companyId, confidential: d.confidential, folderId: d.folderId, employeeId: d.employeeId, supplierId: d.supplierId, purchaseId: d.purchaseId, assetId: d.assetId, maintenanceId: d.maintenanceId };
  await validateLinks(db, ctx, d);
  if (!(await docAllowed(ctx, probe, "upload"))) throw forbidden("No puedes subir documentos aquí.");
  if (d.confidential && !d.employeeId && !can(ctx, "documents.confidential")) throw forbidden("No puedes crear documentos confidenciales.");
  const f = await processUpload(file);
  return withStoredFile(f, (key) =>
    db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          companyId: ctx.companyId,
          title: d.title,
          category: d.category,
          docType: d.docType,
          folderId: d.employeeId ? null : d.folderId,
          confidential: d.confidential,
          employeeId: d.employeeId,
          contractId: d.contractId,
          supplierId: d.supplierId,
          purchaseId: d.purchaseId,
          assetId: d.assetId,
          maintenanceId: d.maintenanceId,
          expiresOn: d.expiresOn,
          currentVersionNo: 1,
          versionCount: 1,
          createdById: ctx.userId,
          versions: { create: { number: 1, storageKey: key, originalName: f.originalName, mime: f.mime, size: f.size, sha256: f.sha256, scanStatus: f.scan, uploadedById: ctx.userId } },
        },
      });
      const deptId = d.employeeId ? (await tx.employee.findUnique({ where: { id: d.employeeId }, select: { departmentId: true } }))?.departmentId : null;
      await audit(tx, ctx, { action: "document.upload", module: "documents", entityType: "document", entityId: doc.id, departmentId: deptId, summary: `${d.title} (v1, ${f.mime}, ${f.size} bytes)`, sensitive: !!d.employeeId });
      return doc;
    }),
  );
}

async function loadDoc(ctx: Ctx, id: string, action: DocAction) {
  const d = await db.document.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!d || !(await docAllowed(ctx, d, action === "view" ? "view" : action))) {
    if (d && action !== "view" && (await docAllowed(ctx, d, "view"))) throw forbidden("No tienes permiso para esta acción sobre el documento.");
    throw notFound("El documento");
  }
  return d;
}

/** Nueva versión: bloquea la fila del documento para numerar sin huecos ni duplicados bajo concurrencia. */
export async function addVersion(ctx: Ctx, id: string, file: File | null, restoredFrom?: { number: number; data: ProcessedFile }) {
  const d = await loadDoc(ctx, id, "version");
  if (d.archivedAt) throw invalid("El documento está archivado.");
  const f = restoredFrom?.data ?? (await processUpload(file));
  return withStoredFile(f, (key) =>
    db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ versionCount: number }[]>`SELECT "versionCount" FROM document WHERE id = ${id} FOR UPDATE`;
      const number = row.versionCount + 1;
      await tx.documentVersion.create({
        data: { companyId: ctx.companyId, documentId: id, number, storageKey: key, originalName: f.originalName, mime: f.mime, size: f.size, sha256: f.sha256, scanStatus: f.scan, uploadedById: ctx.userId, restoredFrom: restoredFrom?.number ?? null },
      });
      await tx.document.update({ where: { id }, data: { versionCount: number, currentVersionNo: number } });
      const deptId = d.employeeId ? (await tx.employee.findUnique({ where: { id: d.employeeId }, select: { departmentId: true } }))?.departmentId : null;
      await audit(tx, ctx, {
        action: restoredFrom ? "document.restore" : "document.version",
        module: "documents",
        entityType: "document",
        entityId: id,
        departmentId: deptId,
        summary: restoredFrom ? `v${number} restaurada desde v${restoredFrom.number}` : `v${number} (${f.size} bytes)`,
      });
      return number;
    }),
  );
}

/** Restaurar = copiar una versión anterior como nueva versión vigente. La secuencia se conserva. */
export async function restoreVersion(ctx: Ctx, id: string, number: number) {
  await loadDoc(ctx, id, "version");
  const v = await db.documentVersion.findFirst({ where: { documentId: id, companyId: ctx.companyId, number } });
  if (!v || v.purgedAt) throw notFound("La versión");
  if (v.scanStatus === "PENDING" || v.scanStatus === "INFECTED") throw invalid("Esa versión no superó el análisis.");
  const data = await storage.get(v.storageKey);
  return addVersion(ctx, id, null, { number, data: { data, mime: v.mime, size: v.size, sha256: v.sha256, originalName: v.originalName, scan: v.scanStatus as "CLEAN" | "UNSCANNED" } });
}

export async function setArchived(ctx: Ctx, id: string, archived: boolean) {
  const d = await loadDoc(ctx, id, "view");
  const manage = d.employeeId ? (await docAllowed(ctx, d, "upload")) : can(ctx, "documents.manage") || (await docAllowed(ctx, d, "upload"));
  if (!manage) throw forbidden();
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, ctx, { action: archived ? "document.archive" : "document.unarchive", module: "documents", entityType: "document", entityId: id });
  });
}

/** Mover nunca amplía el acceso: si salía de una carpeta confidencial, el documento queda marcado confidencial. */
export async function moveDocument(ctx: Ctx, id: string, folderId: string | null) {
  need(ctx, "documents.manage");
  const d = await loadDoc(ctx, id, "view");
  if (d.employeeId || d.supplierId || d.purchaseId || d.assetId || d.maintenanceId) throw invalid("Los documentos vinculados a registros no se mueven a carpetas.");
  await db.$transaction(async (tx) => {
    if (folderId && !(await tx.folder.findFirst({ where: { id: folderId, companyId: ctx.companyId, archivedAt: null } }))) throw notFound("La carpeta");
    const wasConfidential = await isConfidential(d);
    const target: DocRow = { ...d, folderId, confidential: d.confidential };
    if ((await isConfidential(target)) && !can(ctx, "documents.confidential")) throw forbidden("No puedes mover documentos a una carpeta confidencial.");
    await tx.document.update({ where: { id }, data: { folderId, confidential: d.confidential || wasConfidential } });
    await audit(tx, ctx, { action: "document.move", module: "documents", entityType: "document", entityId: id, changes: { folderId: [d.folderId, folderId] } });
  });
}

export async function setConfidential(ctx: Ctx, id: string, confidential: boolean) {
  need(ctx, "documents.confidential");
  need(ctx, "documents.manage");
  const d = await loadDoc(ctx, id, "view");
  if (d.employeeId) throw invalid("La confidencialidad de documentos de expediente la controlan los permisos de personal.");
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { confidential } });
    await audit(tx, ctx, { action: "document.confidential", module: "documents", entityType: "document", entityId: id, changes: { confidential: [d.confidential, confidential] } });
  });
}

export async function createFolder(ctx: Ctx, raw: Record<string, unknown>) {
  requireModule(ctx, "documents");
  need(ctx, "documents.manage");
  const f = z
    .object({ name: z.string().trim().min(1, "Requerido").max(120), parentId: z.string().optional().transform((v) => v || null), confidential: z.string().optional().transform((v) => v === "on") })
    .parse(raw);
  if (f.confidential) need(ctx, "documents.confidential");
  return db.$transaction(async (tx) => {
    if (f.parentId && !(await tx.folder.findFirst({ where: { id: f.parentId, companyId: ctx.companyId } }))) throw notFound("La carpeta");
    const folder = await tx.folder.create({ data: { companyId: ctx.companyId, ...f } });
    await audit(tx, ctx, { action: "folder.create", module: "documents", entityType: "folder", entityId: folder.id, summary: f.name });
    return folder;
  });
}

/** Repositorio: solo documentos visibles para quien consulta, filtrados en la base antes de paginar. */
export async function listDocuments(ctx: Ctx, f: { folderId?: string | null; q?: string; archived?: boolean; page?: number }) {
  const or: Prisma.DocumentWhereInput[] = [];
  const noLinks = { employeeId: null, supplierId: null, purchaseId: null, assetId: null, maintenanceId: null };
  const confidentialOk = can(ctx, "documents.confidential");
  if (can(ctx, "documents.view")) or.push(confidentialOk ? noLinks : { ...noLinks, confidential: false, OR: [{ folderId: null }, { folder: { confidential: false } }] });
  const confFilter = confidentialOk ? {} : { confidential: false };
  if (can(ctx, "suppliers.read")) or.push({ supplierId: { not: null }, ...confFilter });
  if (can(ctx, "purchases.read")) or.push({ purchaseId: { not: null }, ...confFilter });
  if (can(ctx, "inventory.read")) or.push({ assetId: { not: null }, ...confFilter });
  if (can(ctx, "maintenance.read")) or.push({ maintenanceId: { not: null }, ...confFilter });
  const es = employeeScope(ctx, "employees.documents.view", true);
  if (es) or.push({ employee: es });
  if (!or.length) throw forbidden();
  const and: Prisma.DocumentWhereInput[] = [{ companyId: ctx.companyId, OR: or }, f.archived ? { archivedAt: { not: null } } : { archivedAt: null }];
  if (f.folderId !== undefined) and.push({ folderId: f.folderId });
  if (f.q) and.push({ title: { contains: f.q, mode: "insensitive" } });
  const where = { AND: and };
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.document.findMany({
      where,
      ...pageArgs(page),
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, category: true, docType: true, confidential: true, currentVersionNo: true, updatedAt: true, expiresOn: true, archivedAt: true,
        employee: { select: { firstName: true, lastName: true } }, supplier: { select: { name: true } }, asset: { select: { code: true } }, purchase: { select: { code: true } }, folder: { select: { name: true } },
      },
    }),
    db.document.count({ where }),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

/**
 * Carpetas: se listan solo con documents.view y el módulo activo. Las confidenciales solo con documents.confidential.
 */
export async function listFolders(ctx: Ctx) {
  if (!can(ctx, "documents.view")) return [];
  return db.folder.findMany({
    where: { companyId: ctx.companyId, archivedAt: null, ...(can(ctx, "documents.confidential") ? {} : { confidential: false }) },
    orderBy: { name: "asc" },
  });
}

export async function getDocument(ctx: Ctx, id: string) {
  const d = await loadDoc(ctx, id, "view");
  const [versions, history, conf] = await Promise.all([
    db.documentVersion.findMany({ where: { documentId: id, companyId: ctx.companyId }, orderBy: { number: "desc" } }),
    can(ctx, "audit.read") || d.employeeId === null
      ? db.auditLog.findMany({ where: { companyId: ctx.companyId, entityType: "document", entityId: id }, orderBy: { createdAt: "desc" }, take: 50 })
      : [],
    isConfidential(d),
  ]);
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(versions.map((v) => v.uploadedById))] } }, select: { id: true, name: true, lastName: true } });
  const name = new Map(authors.map((a) => [a.id, `${a.name} ${a.lastName}`]));
  return {
    doc: { ...d, effectiveConfidential: conf },
    versions: versions.map((v) => ({ ...v, author: name.get(v.uploadedById) ?? "—", storageKey: undefined })),
    history,
    can: {
      preview: await docAllowed(ctx, d, "preview"),
      download: await docAllowed(ctx, d, "download"),
      version: await docAllowed(ctx, d, "version"),
      manage: can(ctx, "documents.manage") && !d.employeeId,
    },
  };
}

/** Entrega autorizada por backend. Cada solicitud reevalúa permisos actuales, también para versiones antiguas. */
export async function readVersion(ctx: Ctx, versionId: string, mode: "preview" | "download") {
  const v = await db.documentVersion.findFirst({ where: { id: versionId, companyId: ctx.companyId }, include: { document: true } });
  if (!v || !(await docAllowed(ctx, v.document, mode))) throw notFound("El documento");
  if (v.purgedAt) throw invalid("El archivo fue eliminado por la política de retención.");
  if (v.scanStatus === "PENDING") throw invalid("El archivo está en cuarentena hasta completar el análisis antimalware.");
  if (v.scanStatus === "INFECTED") throw invalid("El archivo fue bloqueado por el análisis antimalware.");
  // Con análisis obligatorio, un archivo nunca analizado tampoco se entrega.
  if (v.scanStatus === "UNSCANNED" && env.fileScanRequired) throw invalid("El archivo está en cuarentena hasta completar el análisis antimalware.");
  const sensitive = !!v.document.employeeId || (await isConfidential(v.document));
  if (sensitive || mode === "download") {
    await auditNow(ctx, { action: mode === "download" ? "document.download" : "document.preview", module: "documents", entityType: "document", entityId: v.documentId, sensitive, summary: `v${v.number}` });
  }
  return { data: await storage.get(v.storageKey), mime: v.mime, name: v.originalName };
}

/** Borrado durable: se encola tras confirmar la transacción y el worker lo reintenta hasta lograrlo. */
export async function scheduleFileDeletion(keys: string[]) {
  const { enqueue } = await import("../jobs");
  for (const key of keys) await enqueue("storage.delete", { payload: { key }, dedupeKey: `storage.delete:${key}` });
}

/** Limpieza de huérfanos: archivos sin versión registrada con más de 1 h (cargas interrumpidas). */
export async function cleanupOrphans() {
  const keys = await storage.listOld(60 * 60 * 1000);
  if (!keys.length) return 0;
  const known = new Set((await db.documentVersion.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } })).map((v) => v.storageKey));
  const logos = new Set([
    ...(await db.company.findMany({ where: { logoKey: { in: keys } }, select: { logoKey: true } })).map((c) => c.logoKey),
    ...(await db.user.findMany({ where: { image: { in: keys.map((k) => `key:${k}`) } }, select: { image: true } })).map((u) => u.image!.slice(4)),
  ]);
  let n = 0;
  for (const k of keys) if (!known.has(k) && !logos.has(k)) (await storage.remove(k), n++);
  // Versiones purgadas cuyo archivo no se pudo borrar en su momento.
  const purged = await db.documentVersion.findMany({ where: { purgedAt: { not: null } }, select: { storageKey: true }, take: 500 });
  for (const p of purged) await storage.remove(p.storageKey).catch(() => {});
  return n;
}

