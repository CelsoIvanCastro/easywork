import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import * as companies from "@/server/services/companies";
import * as docs from "@/server/services/documents";
import * as employees from "@/server/services/employees";
import { storage } from "@/server/storage";
import { addMember, expectError, makeCompany, pdfFile, pngFile } from "./helpers";

describe("documentos y versiones", () => {
  it("rechaza tipos no permitidos, extensión engañosa y archivos vacíos; una carga fallida no deja registro", async () => {
    const { ctx } = await makeCompany("Docs1");
    const before = await db.document.count({ where: { companyId: ctx.companyId } });
    await expectError(docs.uploadDocument(ctx, { title: "html" }, new File(["<script>alert(1)</script>"], "x.html", { type: "text/html" })), "VALIDATION");
    await expectError(docs.uploadDocument(ctx, { title: "fake" }, new File(["%PDF-1.4 fake"], "foto.png", { type: "image/png" })), "VALIDATION");
    await expectError(docs.uploadDocument(ctx, { title: "vacío" }, new File([], "a.pdf")), "VALIDATION");
    expect(await db.document.count({ where: { companyId: ctx.companyId } })).toBe(before);
  });

  it("dos sustituciones concurrentes conservan ambas versiones; restaurar conserva la secuencia", async () => {
    const { ctx } = await makeCompany("Docs2");
    const d = await docs.uploadDocument(ctx, { title: "Reglamento" }, pdfFile("r.pdf", "v1"));
    await Promise.all([docs.addVersion(ctx, d.id, pdfFile("r.pdf", "v2a")), docs.addVersion(ctx, d.id, pdfFile("r.pdf", "v2b"))]);
    let vs = await db.documentVersion.findMany({ where: { documentId: d.id }, orderBy: { number: "asc" } });
    expect(vs.map((v) => v.number)).toEqual([1, 2, 3]);
    expect(new Set(vs.map((v) => v.storageKey)).size).toBe(3);
    await docs.restoreVersion(ctx, d.id, 1);
    vs = await db.documentVersion.findMany({ where: { documentId: d.id }, orderBy: { number: "asc" } });
    expect(vs.map((v) => v.number)).toEqual([1, 2, 3, 4]);
    expect(vs[3].restoredFrom).toBe(1);
    expect(vs[3].sha256).toBe(vs[0].sha256);
    const doc = await db.document.findUniqueOrThrow({ where: { id: d.id } });
    expect(doc.currentVersionNo).toBe(4);
    const old = await docs.readVersion(ctx, vs[0].id, "download");
    expect(old.data.toString()).toContain("v1");
    expect(await db.auditLog.count({ where: { entityId: d.id, action: { in: ["document.upload", "document.version", "document.restore"] } } })).toBe(4);
  });

  it("imágenes: se limpian metadatos y se valida el tipo real", async () => {
    const { ctx } = await makeCompany("Docs3");
    const d = await docs.uploadDocument(ctx, { title: "Foto" }, await pngFile());
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: d.id } });
    expect(v.mime).toBe("image/png");
    expect(v.scanStatus).toBe("UNSCANNED");
  });

  it("documentos de expediente: acceso por permisos actuales, también versiones antiguas y entre empresas", async () => {
    const { ctx } = await makeCompany("Docs4");
    const other = await makeCompany("Docs4b");
    const emp = await employees.createEmployee(ctx, { firstName: "Carla" });
    const d = await docs.uploadDocument(ctx, { title: "INE frente", docType: "INE_FRONT", employeeId: emp!.id }, pdfFile("ine.pdf"));
    const v1 = await db.documentVersion.findFirstOrThrow({ where: { documentId: d.id } });
    await docs.addVersion(ctx, d.id, pdfFile("ine.pdf", "v2"));
    const viewer = await addMember(ctx);
    const g = await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: viewer.membershipId, permission: "employees.documents.download", effect: "ALLOW", scope: "COMPANY" });
    expect((await docs.readVersion(await viewer.ctx(), v1.id, "download")).data.length).toBeGreaterThan(0);
    await companies.removeGrant(ctx, g.id);
    await expectError(docs.readVersion(await viewer.ctx(), v1.id, "download"), "NOT_FOUND");
    await expectError(docs.readVersion(other.ctx, v1.id, "download"), "NOT_FOUND");
    await expectError(docs.getDocument(other.ctx, d.id), "NOT_FOUND");
    await expectError(docs.addVersion(other.ctx, d.id, pdfFile()), "NOT_FOUND");
    // Enlazar un documento a un expediente de otra empresa falla.
    await expectError(docs.uploadDocument(other.ctx, { title: "x", employeeId: emp!.id }, pdfFile()), "VALIDATION");
    // Una carpeta general no vuelve público un documento de expediente; mover no amplía acceso.
    const folder = await docs.createFolder(ctx, { name: "General" });
    await expectError(docs.moveDocument(ctx, d.id, folder.id), "VALIDATION");
    // Descargas de documentos de expediente quedan auditadas.
    expect(await db.auditLog.count({ where: { entityId: d.id, action: "document.download" } })).toBeGreaterThan(0);
  });

  it("carpeta confidencial: herencia y mover fuera no amplía el acceso", async () => {
    const { ctx } = await makeCompany("Docs5");
    const conf = await docs.createFolder(ctx, { name: "Dirección", confidential: "on" });
    const pub = await docs.createFolder(ctx, { name: "Público" });
    const d = await docs.uploadDocument(ctx, { title: "Plan", folderId: conf.id }, pdfFile());
    const m = await addMember(ctx);
    await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: m.membershipId, permission: "documents.view", effect: "ALLOW", scope: "COMPANY" });
    await companies.addGrant(ctx, { subjectType: "MEMBER", subjectId: m.membershipId, permission: "documents.download", effect: "ALLOW", scope: "COMPANY" });
    const mctx = await m.ctx();
    expect((await docs.listDocuments(mctx, {})).rows.map((r) => r.id)).not.toContain(d.id);
    await expectError(docs.getDocument(mctx, d.id), "NOT_FOUND");
    await docs.moveDocument(ctx, d.id, pub.id);
    expect((await db.document.findUniqueOrThrow({ where: { id: d.id } })).confidential).toBe(true);
    await expectError(docs.getDocument(mctx, d.id), "NOT_FOUND");
  });

  it("archivo huérfano (carga interrumpida) se limpia; los registrados no", async () => {
    const { ctx } = await makeCompany("Docs6");
    const d = await docs.uploadDocument(ctx, { title: "Bueno" }, pdfFile());
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: d.id } });
    const orphan = "00000000-0000-4000-8000-000000000001";
    await storage.remove(orphan);
    await storage.put(orphan, Buffer.from("x"), "application/pdf");
    const { utimes } = await import("node:fs/promises");
    const old = new Date(Date.now() - 2 * 3600_000);
    await utimes(`.local/test-storage/objects/00/${orphan}`, old, old);
    await utimes(`.local/test-storage/objects/${v.storageKey.slice(0, 2)}/${v.storageKey}`, old, old);
    await docs.cleanupOrphans();
    await expect(storage.get(orphan)).rejects.toThrow();
    expect((await storage.get(v.storageKey)).length).toBeGreaterThan(0);
  });
});
