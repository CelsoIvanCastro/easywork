import "server-only";
import { db } from "../db";
import { type Ctx, can } from "../context";
import { listEmployees } from "./employees";
import { listDocuments } from "./documents";

export type Hit = { kind: string; label: string; detail?: string; href: string };

/**
 * Búsqueda universal. Cada sección se consulta con los mismos servicios y filtros de permisos que su módulo,
 * en el servidor y antes de producir resultados o conteos. RFC/CURP/NSS solo con permiso (índice ciego exacto).
 */
export async function universalSearch(ctx: Ctx, raw: string) {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return { q, sections: [] as { title: string; hits: Hit[]; more: boolean }[], restricted: false };
  const b = `/e/${ctx.companyId}`;
  const sections: { title: string; hits: Hit[]; more: boolean }[] = [];
  let restricted = false;
  const LIMIT = 8;
  if (can(ctx, "employees.read")) {
    for (const view of ["active", "former"] as const) {
      const r = await listEmployees(ctx, { view, q });
      restricted ||= r.restricted;
      if (r.rows.length)
        sections.push({
          title: view === "active" ? "Personal" : "Exempleados",
          hits: r.rows.slice(0, LIMIT).map((e) => ({ kind: "employee", label: `${e.firstName} ${e.lastName}`, detail: `${e.number} · ${e.position?.title ?? "sin puesto"}`, href: `${b}/personal/${e.id}` })),
          more: r.total > LIMIT,
        });
    }
  }
  const docs = await listDocuments(ctx, { q }).catch(() => null);
  if (docs?.rows.length) sections.push({ title: "Documentos", hits: docs.rows.slice(0, LIMIT).map((d) => ({ kind: "document", label: d.title, href: `${b}/documentos/${d.id}` })), more: docs.total > LIMIT });
  const like = { contains: q, mode: "insensitive" as const };
  if (ctx.modules.has("suppliers") && can(ctx, "suppliers.read")) {
    const rows = await db.supplier.findMany({ where: { companyId: ctx.companyId, OR: [{ name: like }, { code: like }, { rfc: like }, { categories: like }] }, take: LIMIT + 1, select: { id: true, name: true, code: true, archivedAt: true } });
    if (rows.length) sections.push({ title: "Proveedores", hits: rows.slice(0, LIMIT).map((s) => ({ kind: "supplier", label: s.name, detail: `${s.code}${s.archivedAt ? " · archivado" : ""}`, href: `${b}/proveedores/${s.id}` })), more: rows.length > LIMIT });
  }
  if (ctx.modules.has("inventory") && can(ctx, "inventory.read")) {
    const items = await db.item.findMany({ where: { companyId: ctx.companyId, OR: [{ name: like }, { code: like }] }, take: LIMIT + 1, select: { id: true, name: true, code: true } });
    if (items.length) sections.push({ title: "Artículos", hits: items.slice(0, LIMIT).map((i) => ({ kind: "item", label: i.name, detail: i.code, href: `${b}/inventario/${i.id}` })), more: items.length > LIMIT });
    const assets = await db.asset.findMany({ where: { companyId: ctx.companyId, OR: [{ name: like }, { code: like }, { serial: like }] }, take: LIMIT + 1, select: { id: true, name: true, code: true, serial: true } });
    if (assets.length) sections.push({ title: "Activos", hits: assets.slice(0, LIMIT).map((a) => ({ kind: "asset", label: a.name, detail: [a.code, a.serial].filter(Boolean).join(" · "), href: `${b}/activos/${a.id}` })), more: assets.length > LIMIT });
  }
  return { q, sections, restricted };
}
