import "server-only";
import { z } from "zod";
import { db } from "../db";
import { type Ctx, can, employeeScope } from "../context";
import { civilDate } from "../util";
import { accessTo, missingItems } from "../services/employees";
import { planBoard } from "../services/maintenance";
import { comparePrices } from "../services/inventory";
import { getDocument, listDocuments } from "../services/documents";
import { dashboard } from "../services/dashboard";
import { canSeeOrgChart } from "../services/structure";
import type { ToolDef } from "./provider";

// Herramientas de solo lectura para la IA. Cada una autoriza su propia consulta con el contexto del
// servidor (identidad, empresa, permisos); nunca con argumentos del modelo. Devuelven datos acotados.

export type ToolOutput = { data: unknown; links: { label: string; href: string }[]; truncated?: boolean };
type Tool = {
  def: ToolDef;
  schema: z.ZodType<Record<string, unknown>>;
  allowed: (ctx: Ctx) => boolean;
  run: (ctx: Ctx, input: Record<string, unknown>) => Promise<ToolOutput>;
};

const MAX_ROWS = 40;
const str = (max = 80) => z.string().trim().min(1).max(max);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const b = (ctx: Ctx) => `/e/${ctx.companyId}`;
const schemaOf = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });

const TOOLS: Record<string, Tool> = {
  resumen_empresa: {
    def: {
      name: "resumen_empresa",
      description: "Resumen general de la empresa: personas activas (total y por departamento), bajas recientes, expedientes incompletos, vencimientos, artículos con existencias bajas, mantenimientos, proveedores y compras recientes. Úsala para preguntas generales o de conteo.",
      input_schema: schemaOf({}),
    },
    schema: z.object({}),
    allowed: () => true, // el tablero ya aplica módulos, permisos y alcance
    run: async (ctx) => {
      const d = await dashboard(ctx);
      const scope = employeeScope(ctx, "employees.read");
      const porDepto = scope
        ? await db.employee.groupBy({ by: ["departmentId"], where: { AND: [scope, { status: "ACTIVE" }] }, _count: true })
        : [];
      const deptos = porDepto.length ? await db.department.findMany({ where: { companyId: ctx.companyId, id: { in: porDepto.map((x) => x.departmentId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : [];
      return {
        data: {
          indicadores: d.kpis.map((k) => ({ indicador: k.label, valor: k.value })),
          personas_activas_por_departamento: porDepto.map((x) => ({ departamento: deptos.find((y) => y.id === x.departmentId)?.name ?? "Sin departamento", personas: x._count })),
          pendientes: d.alerts.map((a) => ({ tipo: a.type, titulo: a.title })),
          compras_recientes: d.purchases?.map((p) => ({ folio: p.code, proveedor: p.supplierName, estado: p.status })) ?? null,
        },
        links: d.kpis.slice(0, 6).map((k) => ({ label: k.label, href: k.href })),
      };
    },
  },

  buscar_personal: {
    def: {
      name: "buscar_personal",
      description: "Busca personal activo o exempleados por nombre, número interno o puesto. Devuelve datos básicos.",
      input_schema: schemaOf({ consulta: { type: "string" }, exempleados: { type: "boolean" } }, ["consulta"]),
    },
    schema: z.object({ consulta: str(), exempleados: z.boolean().optional() }),
    allowed: (ctx) => can(ctx, "employees.read"),
    run: async (ctx, i) => {
      const scope = employeeScope(ctx, "employees.read")!;
      const q = String(i.consulta);
      const rows = await db.employee.findMany({
        where: {
          AND: [scope, { status: i.exempleados ? "FORMER" : { not: "FORMER" } }, { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }, { position: { title: { contains: q, mode: "insensitive" } } }] }],
        },
        take: MAX_ROWS + 1,
        select: { id: true, number: true, firstName: true, lastName: true, status: true, department: { select: { name: true } }, position: { select: { title: true } } },
      });
      return {
        data: rows.slice(0, MAX_ROWS).map((e) => ({ numero: e.number, nombre: `${e.firstName} ${e.lastName}`, estado: e.status, departamento: e.department?.name ?? null, puesto: e.position?.title ?? null })),
        links: rows.slice(0, MAX_ROWS).map((e) => ({ label: `${e.firstName} ${e.lastName}`, href: `${b(ctx)}/personal/${e.id}` })),
        truncated: rows.length > MAX_ROWS,
      };
    },
  },

  expedientes_incompletos: {
    def: {
      name: "expedientes_incompletos",
      description: "Lista personal activo con expediente incompleto y qué le falta (solo lo que la persona usuaria puede ver).",
      input_schema: schemaOf({ departamento: { type: "string" } }),
    },
    schema: z.object({ departamento: str().optional() }),
    allowed: (ctx) => can(ctx, "employees.read"),
    run: async (ctx, i) => {
      const scope = employeeScope(ctx, "employees.read")!;
      const [settings, emps] = await Promise.all([
        db.companySettings.findUniqueOrThrow({ where: { companyId: ctx.companyId } }),
        db.employee.findMany({
          where: { AND: [scope, { status: { in: ["ACTIVE", "SUSPENDED", "OFFBOARDING"] } }, i.departamento ? { department: { name: { contains: String(i.departamento), mode: "insensitive" } } } : {}] },
          take: 500,
          include: { department: { select: { name: true } }, documents: { where: { archivedAt: null }, select: { docType: true, currentVersionNo: true } }, bankAccounts: { where: { isCurrent: true }, select: { id: true } } },
        }),
      ]);
      const out = emps
        .map((e) => ({ e, missing: missingItems(settings, e, e.documents, e.bankAccounts.length > 0, accessTo(ctx, e)) }))
        .filter((x) => x.missing.length);
      return {
        data: out.slice(0, MAX_ROWS).map(({ e, missing }) => ({ nombre: `${e.firstName} ${e.lastName}`, numero: e.number, departamento: e.department?.name ?? null, pendientes: missing })),
        links: out.slice(0, MAX_ROWS).map(({ e }) => ({ label: `${e.firstName} ${e.lastName}`, href: `${b(ctx)}/personal/${e.id}` })),
        truncated: out.length > MAX_ROWS || emps.length === 500,
      };
    },
  },

  mantenimiento_pendiente: {
    def: {
      name: "mantenimiento_pendiente",
      description: "Planes de mantenimiento vencidos, próximos o sin lectura que confirme su estado. Opcionalmente filtra por mes (YYYY-MM) de vencimiento por fecha.",
      input_schema: schemaOf({ mes: { type: "string", description: "YYYY-MM" } }),
    },
    schema: z.object({ mes: month.optional() }),
    allowed: (ctx) => ctx.modules.has("maintenance") && can(ctx, "maintenance.read"),
    run: async (ctx, i) => {
      let rows = (await planBoard(ctx)).filter((r) => r.eval.state !== "ok");
      if (i.mes) rows = rows.filter((r) => r.eval.state === "overdue" || (r.plan.nextDueOn && r.plan.nextDueOn.toISOString().startsWith(String(i.mes))) || r.eval.state === "unknown");
      return {
        data: rows.slice(0, MAX_ROWS).map((r) => ({
          activo: `${r.plan.asset.code} ${r.plan.asset.name}`,
          plan: r.plan.name,
          estado: { overdue: "vencido", soon: "próximo", unknown: "sin confirmar (falta lectura reciente)", ok: "al corriente" }[r.eval.state],
          siguiente_fecha: r.plan.nextDueOn?.toISOString().slice(0, 10) ?? null,
          siguiente_lectura: r.plan.nextDueReading?.toString() ?? null,
          lectura_actual: r.plan.asset.currentReading?.toString() ?? null,
          motivos: r.eval.reasons,
        })),
        links: rows.slice(0, MAX_ROWS).map((r) => ({ label: r.plan.asset.code, href: `${b(ctx)}/activos/${r.plan.asset.id}` })),
        truncated: rows.length > MAX_ROWS,
      };
    },
  },

  activos_vendidos: {
    def: {
      name: "activos_vendidos",
      description: "Activos vendidos entre dos fechas (YYYY-MM-DD). El valor de venta solo se incluye si la persona puede ver costes.",
      input_schema: schemaOf({ desde: { type: "string" }, hasta: { type: "string" } }, ["desde", "hasta"]),
    },
    schema: z.object({ desde: date, hasta: date }),
    allowed: (ctx) => ctx.modules.has("inventory") && can(ctx, "inventory.read"),
    run: async (ctx, i) => {
      const costs = can(ctx, "costs.read");
      const rows = await db.asset.findMany({
        where: { companyId: ctx.companyId, status: "SOLD", soldOn: { gte: civilDate(String(i.desde)), lte: civilDate(String(i.hasta)) } },
        orderBy: { soldOn: "asc" },
        take: MAX_ROWS + 1,
      });
      return {
        data: rows.slice(0, MAX_ROWS).map((a) => ({ codigo: a.code, nombre: a.name, serie: a.serial, fecha_venta: a.soldOn?.toISOString().slice(0, 10), ...(costs ? { valor_venta: a.saleAmount?.toString() ?? null, moneda: a.saleCurrency } : {}) })),
        links: rows.slice(0, MAX_ROWS).map((a) => ({ label: a.code, href: `${b(ctx)}/activos/${a.id}` })),
        truncated: rows.length > MAX_ROWS,
      };
    },
  },

  precios_material: {
    def: {
      name: "precios_material",
      description: "Último precio pagado y comparación de proveedores para un artículo, agrupado solo entre precios equivalentes (misma unidad, moneda y base fiscal). Calculado por el sistema.",
      input_schema: schemaOf({ articulo: { type: "string", description: "Nombre o código del artículo" } }, ["articulo"]),
    },
    schema: z.object({ articulo: str() }),
    allowed: (ctx) => ctx.modules.has("inventory") && can(ctx, "inventory.read") && can(ctx, "costs.read"),
    run: async (ctx, i) => {
      const q = String(i.articulo);
      const items = await db.item.findMany({ where: { companyId: ctx.companyId, OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }, take: 5 });
      const data = [];
      for (const it of items) {
        const p = await comparePrices(ctx, it.id);
        data.push({
          articulo: `${it.code} ${it.name}`,
          ultimo_precio: p.last,
          comparables: p.comparable.map((g) => ({ base: g.basis, mas_barato: g.suppliers[0] ?? null, proveedores: g.suppliers })),
        });
      }
      return { data, links: items.map((it) => ({ label: it.code, href: `${b(ctx)}/inventario/${it.id}` })), truncated: items.length === 5 };
    },
  },

  ocupantes_puesto: {
    def: {
      name: "ocupantes_puesto",
      description: "Quién ocupa actualmente un puesto (según el organigrama). Incluye vacantes.",
      input_schema: schemaOf({ puesto: { type: "string" } }, ["puesto"]),
    },
    schema: z.object({ puesto: str() }),
    allowed: (ctx) => canSeeOrgChart(ctx),
    run: async (ctx, i) => {
      const positions = await db.position.findMany({
        where: { companyId: ctx.companyId, archivedAt: null, title: { contains: String(i.puesto), mode: "insensitive" } },
        include: { department: { select: { name: true } }, employees: { where: { status: { not: "FORMER" } }, select: { id: true, firstName: true, lastName: true, status: true } } },
        take: 10,
      });
      return {
        data: positions.map((p) => ({ puesto: p.title, departamento: p.department.name, ocupantes: p.employees.map((e) => `${e.firstName} ${e.lastName}`), plazas: p.headcount, vacantes: p.headcount ? Math.max(0, p.headcount - p.employees.length) : p.employees.length ? 0 : 1 })),
        links: [{ label: "Organigrama", href: `${b(ctx)}/organigrama` }],
      };
    },
  },

  historial_documento: {
    def: {
      name: "historial_documento",
      description: "Quién subió, reemplazó o restauró versiones de un documento y cuándo.",
      input_schema: schemaOf({ documento: { type: "string", description: "Título o parte del título" } }, ["documento"]),
    },
    schema: z.object({ documento: str() }),
    allowed: () => true,
    run: async (ctx, i) => {
      const list = await listDocuments(ctx, { q: String(i.documento) }).catch(() => null);
      const docs = list?.rows.slice(0, 3) ?? [];
      const data = [];
      for (const d of docs) {
        const g = await getDocument(ctx, d.id);
        data.push({
          documento: g.doc.title,
          version_vigente: g.doc.currentVersionNo,
          versiones: g.versions.map((v) => ({ version: v.number, autor: v.author, fecha: v.createdAt.toISOString(), restaurada_de: v.restoredFrom })),
          eventos: g.history.slice(0, 20).map((h) => ({ fecha: h.createdAt.toISOString(), actor: h.actorLabel, accion: h.action })),
        });
      }
      return { data, links: docs.map((d) => ({ label: d.title, href: `${b(ctx)}/documentos/${d.id}` })), truncated: (list?.total ?? 0) > 3 };
    },
  },

  exempleados_por_departamento: {
    def: {
      name: "exempleados_por_departamento",
      description: "Exempleados que en algún momento trabajaron en un departamento (según su historial de puestos).",
      input_schema: schemaOf({ departamento: { type: "string" } }, ["departamento"]),
    },
    schema: z.object({ departamento: str() }),
    allowed: (ctx) => can(ctx, "employees.read"),
    run: async (ctx, i) => {
      const scope = employeeScope(ctx, "employees.read")!;
      const rows = await db.employee.findMany({
        where: { AND: [scope, { status: "FORMER" }, { assignments: { some: { department: { name: { contains: String(i.departamento), mode: "insensitive" } } } } }] },
        take: MAX_ROWS + 1,
        include: { periods: { orderBy: { number: "desc" }, take: 1 } },
      });
      return {
        data: rows.slice(0, MAX_ROWS).map((e) => ({ nombre: `${e.firstName} ${e.lastName}`, numero: e.number, baja: e.periods[0]?.endDate?.toISOString().slice(0, 10) ?? null, motivo: e.periods[0]?.terminationReason ?? null })),
        links: rows.slice(0, MAX_ROWS).map((e) => ({ label: `${e.firstName} ${e.lastName}`, href: `${b(ctx)}/personal/${e.id}` })),
        truncated: rows.length > MAX_ROWS,
      };
    },
  },

  movimientos_inventario: {
    def: {
      name: "movimientos_inventario",
      description: "Movimientos recientes de un artículo de inventario (entradas, salidas, ajustes, recepciones) y su saldo.",
      input_schema: schemaOf({ articulo: { type: "string" }, desde: { type: "string" } }, ["articulo"]),
    },
    schema: z.object({ articulo: str(), desde: date.optional() }),
    allowed: (ctx) => ctx.modules.has("inventory") && can(ctx, "inventory.read"),
    run: async (ctx, i) => {
      const q = String(i.articulo);
      const item = await db.item.findFirst({ where: { companyId: ctx.companyId, OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } });
      if (!item) return { data: { encontrado: false }, links: [] };
      const mv = await db.stockMovement.findMany({ where: { companyId: ctx.companyId, itemId: item.id, ...(i.desde ? { createdAt: { gte: civilDate(String(i.desde)) } } : {}) }, orderBy: { createdAt: "desc" }, take: MAX_ROWS });
      return {
        data: { articulo: `${item.code} ${item.name}`, saldo: `${item.quantity} ${item.unit}`, movimientos: mv.map((m) => ({ fecha: m.createdAt.toISOString(), tipo: m.type, cantidad: m.quantity.toString(), saldo: m.balanceAfter.toString(), motivo: m.reason })) },
        links: [{ label: item.code, href: `${b(ctx)}/inventario/${item.id}` }],
        truncated: mv.length === MAX_ROWS,
      };
    },
  },
};

export const toolsFor = (ctx: Ctx) => Object.values(TOOLS).filter((t) => t.allowed(ctx));
export const getTool = (name: string) => TOOLS[name];
