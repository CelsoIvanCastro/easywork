import "server-only";
import { z } from "zod";
import { db, type Prisma, type Tx } from "../db";
import { audit, auditNow, diff } from "../audit";
import { AppError, conflict, forbidden, invalid, notFound } from "../errors";
import { type Ctx, can, employeeScope, isSelf, need, requireOwner, requireRecentReauth } from "../context";
import { blindIndex, decOpt, decrypt, encOpt, encrypt } from "../crypto";
import { checkClabe, isValidCurp, isValidNss, isValidRfc, maskClabe } from "@/lib/mx";
import { DOC_TYPES, EMPLOYEE_FIELDS } from "@/lib/catalogs";
import { addDays, civilDate, nextCode, pageArgs, PAGE_SIZE, todayIn } from "../util";
import { recordAssignment, supervisorsOf } from "./structure";
import { validatePlacement } from "./companies";
import { scheduleFileDeletion } from "./documents";
import { appendErasureLedger } from "./accounts";

const ACTIVE_STATES = ["ACTIVE", "SUSPENDED", "OFFBOARDING"] as const;
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const optDate = z.string().optional().transform((v, c) => {
  if (!v) return null;
  try {
    return civilDate(v);
  } catch {
    c.addIssue({ code: "custom", message: "Fecha inválida" });
    return z.NEVER;
  }
});

// ───────── Listados ─────────

export type EmployeeListFilter = {
  view: "active" | "former";
  q?: string;
  departmentId?: string;
  positionId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
};

const SENSITIVE_QUERY = { curp: /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z\d]\d$/, rfc: /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/, nss: /^\d{11}$/ } as const;

export async function listEmployees(ctx: Ctx, f: EmployeeListFilter) {
  const scope = employeeScope(ctx, "employees.read");
  if (!scope) throw forbidden();
  const and: Prisma.EmployeeWhereInput[] = [scope];
  and.push(f.view === "former" ? { status: "FORMER" } : f.status && (ACTIVE_STATES as readonly string[]).includes(f.status) ? { status: f.status as never } : { status: { in: [...ACTIVE_STATES] } });
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  if (f.positionId) and.push({ positionId: f.positionId });
  const from = f.from ? civilDate(f.from) : null;
  const to = f.to ? civilDate(f.to) : null;
  if (from || to) {
    // Activos: por fecha de ingreso. Exempleados: por fecha de baja de algún periodo.
    const range = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    and.push(f.view === "former" ? { periods: { some: { endDate: range } } } : { hireDate: range });
  }
  const q = f.q?.trim();
  let sensitiveSearch = false;
  if (q) {
    const up = q.toUpperCase().replace(/\s/g, "");
    const kind = (Object.keys(SENSITIVE_QUERY) as (keyof typeof SENSITIVE_QUERY)[]).find((k) => SENSITIVE_QUERY[k].test(up));
    const digits = q.replace(/\D/g, "");
    const personalScope = employeeScope(ctx, "employees.personal.read");
    if (kind) {
      // Coincidencia exacta mediante índice ciego, solo dentro del alcance de datos sensibles.
      // Sin permiso, la búsqueda no consulta el campo y no revela coincidencias.
      if (!personalScope) return { rows: [], total: 0, page: 1, pageSize: PAGE_SIZE, restricted: true };
      sensitiveSearch = true;
      and.push(personalScope, { [`${kind}Bidx`]: blindIndex(up, ctx.companyId, kind) });
    } else if (digits.length >= 7 && digits.length === q.replace(/[\s()+-]/g, "").length) {
      if (!personalScope) return { rows: [], total: 0, page: 1, pageSize: PAGE_SIZE, restricted: true };
      sensitiveSearch = true;
      and.push(personalScope, { phone: { contains: digits } });
    } else {
      and.push({
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { number: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      });
    }
  }
  const where: Prisma.EmployeeWhereInput = { AND: and };
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.employee.findMany({
      where,
      ...pageArgs(page),
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
        status: true,
        hireDate: true,
        departmentId: true,
        department: { select: { name: true } },
        position: { select: { title: true } },
        periods: { orderBy: { number: "desc" }, take: 1, select: { endDate: true, terminationReason: true } },
      },
    }),
    db.employee.count({ where }),
  ]);
  if (sensitiveSearch) await auditNow(ctx, { action: "employee.search.sensitive", module: "employees", sensitive: true, summary: `Búsqueda exacta por dato sensible (${total} resultado/s)` });
  return { rows, total, page, pageSize: PAGE_SIZE, restricted: false };
}

// ───────── Expediente ─────────

async function loadEmployee(ctx: Ctx, id: string) {
  const e = await db.employee.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!e) throw notFound("El expediente");
  return e;
}

const target = (e: { id: string; departmentId: string | null }) => ({ employeeId: e.id, departmentId: e.departmentId });

/** Permisos efectivos de quien consulta sobre un expediente concreto. El propio expediente tiene lectura implícita limitada. */
export function accessTo(ctx: Ctx, e: { id: string; departmentId: string | null; userId?: string | null }) {
  const self = isSelf(ctx, e.id);
  const t = target(e);
  const ownerRecord = e.userId === ctx.company.ownerId && !ctx.isOwner;
  return {
    self,
    read: self || can(ctx, "employees.read", t),
    edit: can(ctx, "employees.edit", t) && !ownerRecord,
    offboard: can(ctx, "employees.offboard", t) && !ownerRecord && !self,
    personalRead: self || can(ctx, "employees.personal.read", t),
    personalEdit: can(ctx, "employees.personal.edit", t),
    bankRead: self || can(ctx, "employees.bank.read", t),
    bankEdit: can(ctx, "employees.bank.edit", t),
    notesRead: can(ctx, "employees.notes.read", t),
    notesEdit: can(ctx, "employees.notes.edit", t),
    docsView: self || can(ctx, "employees.documents.view", t),
    docsPreview: self || can(ctx, "employees.documents.preview", t),
    docsDownload: self || can(ctx, "employees.documents.download", t),
    docsUpload: can(ctx, "employees.documents.upload", t),
    audit: can(ctx, "audit.read", t),
  };
}
export type EmployeeAccess = ReturnType<typeof accessTo>;

export async function getEmployee(ctx: Ctx, id: string, opts: { revealPersonal?: boolean } = {}) {
  const e = await loadEmployee(ctx, id);
  const a = accessTo(ctx, e);
  if (!a.read) throw notFound("El expediente");
  const [department, position, supervisors, periods, assignments, contracts, bank, notes, docs, settings] = await Promise.all([
    e.departmentId ? db.department.findFirst({ where: { id: e.departmentId, companyId: ctx.companyId }, select: { id: true, name: true } }) : null,
    e.positionId ? db.position.findFirst({ where: { id: e.positionId, companyId: ctx.companyId }, select: { id: true, title: true } }) : null,
    supervisorsOf(ctx.companyId, e.positionId),
    db.employmentPeriod.findMany({ where: { companyId: ctx.companyId, employeeId: id }, orderBy: { number: "desc" } }),
    db.assignmentHistory.findMany({
      where: { companyId: ctx.companyId, employeeId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { department: { select: { name: true } }, position: { select: { title: true } } },
    }),
    db.employeeContract.findMany({ where: { companyId: ctx.companyId, employeeId: id }, orderBy: { startDate: "desc" } }),
    a.bankRead ? db.bankAccount.findMany({ where: { companyId: ctx.companyId, employeeId: id }, orderBy: { createdAt: "desc" }, take: 10 }) : [],
    a.notesRead ? db.employeeNote.findMany({ where: { companyId: ctx.companyId, employeeId: id }, orderBy: { createdAt: "desc" }, take: 50 }) : [],
    a.docsView
      ? db.document.findMany({
          where: { companyId: ctx.companyId, employeeId: id, archivedAt: null },
          select: { id: true, title: true, docType: true, expiresOn: true, currentVersionNo: true, versionCount: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
        })
      : [],
    db.companySettings.findUnique({ where: { companyId: ctx.companyId } }),
  ]);
  const personal = a.personalRead
    ? {
        birthDate: e.birthDate,
        curp: decOpt(e.curpEnc, ctx.companyId, "curp"),
        rfc: decOpt(e.rfcEnc, ctx.companyId, "rfc"),
        nss: decOpt(e.nssEnc, ctx.companyId, "nss"),
        address: decOpt(e.addressEnc, ctx.companyId, "address"),
        phone: e.phone,
      }
    : null;
  // Solo la revelación explícita de datos sensibles de otra persona queda auditada (y solo entonces se devuelven completos).
  if (personal && opts.revealPersonal && !a.self) await auditNow(ctx, { action: "employee.personal.view", module: "employees", entityType: "employee", entityId: id, departmentId: e.departmentId, sensitive: true });
  const mask = (v: string | null) => (v ? `•••• ${v.slice(-4)}` : null);
  if (personal && !opts.revealPersonal && !a.self) {
    personal.curp = mask(personal.curp);
    personal.rfc = mask(personal.rfc);
    personal.nss = mask(personal.nss);
    personal.address = personal.address ? "•••• (oculto)" : null;
  }
  return {
    access: a,
    employee: {
      id: e.id,
      number: e.number,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      status: e.status,
      hireDate: e.hireDate,
      legalHold: a.offboard || ctx.isOwner ? e.legalHold : undefined,
      anonymizedAt: e.anonymizedAt,
      version: e.version,
      hasAccount: !!e.userId,
      isOwnerRecord: e.userId === ctx.company.ownerId,
    },
    department,
    position,
    supervisors: supervisors.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
    personal,
    periods,
    assignments,
    contracts,
    bank: bank.map((b) => ({ id: b.id, holderName: b.holderName, masked: maskClabe(b.clabeLast4), bankName: b.bankName, bankCode: b.bankCode, isCurrent: b.isCurrent, createdAt: b.createdAt })),
    notes,
    documents: docs,
    // Pendientes calculados solo con lo que quien consulta puede ver.
    missing: settings ? missingItems(settings, e, docs, bank.length > 0, a) : [],
    required: settings ? missingItems(settings, EMPTY, [], false, a) : [],
    revealed: !!opts.revealPersonal || a.self,
  };
}

const EMPTY = { firstName: "", lastName: "", birthDate: null, curpEnc: null, rfcEnc: null, nssEnc: null, phone: null, email: null, addressEnc: null, departmentId: null, positionId: null };

export function missingItems(
  s: { requiredEmployeeFields: string[]; requiredDocTypes: string[] },
  e: { firstName: string; lastName: string; birthDate: Date | null; curpEnc: string | null; rfcEnc: string | null; nssEnc: string | null; phone: string | null; email: string | null; addressEnc: string | null; departmentId: string | null; positionId: string | null },
  docs: { docType: string | null; currentVersionNo: number }[],
  hasBank: boolean,
  a: Pick<EmployeeAccess, "personalRead" | "bankRead" | "docsView">,
) {
  const present: Record<string, boolean> = {
    firstName: !!e.firstName,
    lastName: !!e.lastName,
    birthDate: !!e.birthDate,
    curp: !!e.curpEnc,
    rfc: !!e.rfcEnc,
    nss: !!e.nssEnc,
    phone: !!e.phone,
    email: !!e.email,
    address: !!e.addressEnc,
    department: !!e.departmentId,
    position: !!e.positionId,
    bank: hasBank,
  };
  const sensitive = new Set(["birthDate", "curp", "rfc", "nss", "phone", "address"]);
  const out: string[] = [];
  for (const f of s.requiredEmployeeFields) {
    if ((sensitive.has(f) && !a.personalRead) || (f === "bank" && !a.bankRead)) continue;
    if (!present[f]) out.push(EMPLOYEE_FIELDS[f as keyof typeof EMPLOYEE_FIELDS] ?? f);
  }
  if (a.docsView) {
    const have = new Set(docs.filter((d) => d.currentVersionNo > 0).map((d) => d.docType));
    for (const t of s.requiredDocTypes) if (!have.has(t)) out.push(`Documento: ${DOC_TYPES[t as keyof typeof DOC_TYPES] ?? t}`);
  }
  return out;
}

// ───────── Alta y edición ─────────

const basicSchema = z.object({
  firstName: z.string().trim().min(1, "Escribe el nombre").max(80),
  lastName: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).optional().transform((v) => v || null).pipe(z.email("Correo inválido").nullable()),
});

const personalSchema = z.object({
  birthDate: optDate,
  phone: opt(30).refine((v) => !v || /^[0-9+ ()-]{8,20}$/.test(v), "Teléfono inválido"),
  curp: opt(18).transform((v) => v?.toUpperCase() ?? null).refine((v) => !v || isValidCurp(v), "CURP inválida (formato o dígito verificador)"),
  rfc: opt(13).transform((v) => v?.toUpperCase() ?? null).refine((v) => !v || isValidRfc(v), "RFC con formato inválido"),
  nss: opt(11).refine((v) => !v || isValidNss(v), "NSS inválido (11 dígitos con verificador)"),
  address: opt(400),
});

function encryptPersonal(companyId: string, p: z.infer<typeof personalSchema>) {
  return {
    birthDate: p.birthDate,
    phone: p.phone,
    curpEnc: encOpt(p.curp, companyId, "curp"),
    rfcEnc: encOpt(p.rfc, companyId, "rfc"),
    nssEnc: encOpt(p.nss, companyId, "nss"),
    addressEnc: encOpt(p.address, companyId, "address"),
    curpBidx: p.curp ? blindIndex(p.curp, companyId, "curp") : null,
    rfcBidx: p.rfc ? blindIndex(p.rfc, companyId, "rfc") : null,
    nssBidx: p.nss ? blindIndex(p.nss, companyId, "nss") : null,
  };
}

function curpConflict(e: unknown): never {
  if ((e as { code?: string }).code === "P2002") throw invalid("Ya existe un expediente con esa CURP en esta empresa.", { curp: "Duplicada en esta empresa" });
  throw e;
}

/** Alta de expediente. Se admiten borradores incompletos: solo el nombre es obligatorio. */
export async function createEmployee(ctx: Ctx, raw: Record<string, unknown>) {
  need(ctx, "employees.create");
  const basic = basicSchema.parse(raw);
  const placement = z.object({ departmentId: opt(60), positionId: opt(60), hireDate: optDate }).parse(raw);
  const hasPersonal = ["birthDate", "phone", "curp", "rfc", "nss", "address"].some((k) => raw[k]);
  try {
    return await db.$transaction(async (tx) => {
      const { departmentId, positionId } = await validatePlacement(tx, ctx.companyId, placement.departmentId, placement.positionId);
      // El alta solo puede ubicar a alguien dentro del alcance de edición de quien registra.
      if (!can(ctx, "employees.edit", { departmentId })) throw forbidden("No puedes registrar personal en ese departamento.");
      if (hasPersonal && !can(ctx, "employees.personal.edit", { departmentId })) throw forbidden("No tienes permiso para capturar datos personales sensibles.");
      const personal = hasPersonal ? encryptPersonal(ctx.companyId, personalSchema.parse(raw)) : {};
      const start = placement.hireDate ?? civilDate(todayIn(ctx.company.timezone));
      const number = await nextCode(tx, ctx.companyId, "employee", "EMP");
      const e = await tx.employee.create({
        data: {
          companyId: ctx.companyId,
          number,
          ...basic,
          ...personal,
          departmentId,
          positionId,
          hireDate: start,
          createdById: ctx.userId,
          periods: { create: { number: 1, startDate: start } },
          assignments: { create: { departmentId, positionId, actorId: ctx.userId, reason: "Alta" } },
        },
      });
      await audit(tx, ctx, { action: "employee.create", module: "employees", entityType: "employee", entityId: e.id, departmentId, summary: `${number} ${basic.firstName} ${basic.lastName}` });
      return e;
    });
  } catch (e) {
    curpConflict(e);
  }
}

export async function updateBasic(ctx: Ctx, id: string, raw: Record<string, unknown>, version: number) {
  const e = await loadEmployee(ctx, id);
  if (!accessTo(ctx, e).edit) throw forbidden();
  // Solo se leen los campos permitidos: cualquier otro campo enviado (status, isOwner, permisos...) se ignora.
  const data = basicSchema.parse(raw);
  await db.$transaction(async (tx) => {
    const n = await tx.employee.updateMany({ where: { id, companyId: ctx.companyId, version }, data: { ...data, version: { increment: 1 } } });
    if (!n.count) throw conflict();
    await audit(tx, ctx, { action: "employee.update", module: "employees", entityType: "employee", entityId: id, departmentId: e.departmentId, changes: diff(e, data) });
  });
}

/** Datos personales: con permiso, o el propio empleado si tiene concesión de alcance "propios". Los vacíos borran el valor. */
export async function updatePersonal(ctx: Ctx, id: string, raw: Record<string, unknown>, version: number) {
  const e = await loadEmployee(ctx, id);
  if (!accessTo(ctx, e).personalEdit) throw forbidden();
  const p = personalSchema.parse(raw);
  const enc = encryptPersonal(ctx.companyId, p);
  const before = {
    birthDate: e.birthDate,
    phone: e.phone,
    curp: decOpt(e.curpEnc, ctx.companyId, "curp"),
    rfc: decOpt(e.rfcEnc, ctx.companyId, "rfc"),
    nss: decOpt(e.nssEnc, ctx.companyId, "nss"),
    address: decOpt(e.addressEnc, ctx.companyId, "address"),
  };
  try {
    await db.$transaction(async (tx) => {
      const n = await tx.employee.updateMany({ where: { id, companyId: ctx.companyId, version }, data: { ...enc, version: { increment: 1 } } });
      if (!n.count) throw conflict();
      await audit(tx, ctx, {
        action: "employee.personal.update",
        module: "employees",
        entityType: "employee",
        entityId: id,
        departmentId: e.departmentId,
        sensitive: true,
        changes: diff(before, p, ["curp", "rfc", "nss", "address", "birthDate", "phone"]),
      });
    });
  } catch (err) {
    curpConflict(err);
  }
}

export async function changeAssignment(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  const e = await loadEmployee(ctx, id);
  if (!accessTo(ctx, e).edit) throw forbidden();
  if (e.status === "FORMER") throw invalid("Un exempleado no tiene puesto actual. Usa Recontratar.");
  const input = z.object({ departmentId: opt(60), positionId: opt(60), reason: opt(200) }).parse(raw);
  await db.$transaction(async (tx) => {
    const { departmentId, positionId } = await validatePlacement(tx, ctx.companyId, input.departmentId, input.positionId);
    // Hace falta alcance sobre el departamento de origen y el de destino.
    if (!can(ctx, "employees.edit", { departmentId })) throw forbidden("No puedes asignar personal a ese departamento.");
    if (departmentId === e.departmentId && positionId === e.positionId) throw invalid("No hay cambios.");
    await recordAssignment(tx, ctx, id, departmentId, positionId, input.reason ?? "Cambio de puesto");
    await audit(tx, ctx, {
      action: "employee.assignment",
      module: "employees",
      entityType: "employee",
      entityId: id,
      departmentId,
      changes: { departmentId: [e.departmentId, departmentId], positionId: [e.positionId, positionId] },
    });
  });
}

// ───────── Banco ─────────

export async function setBankAccount(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  const e = await loadEmployee(ctx, id);
  if (!accessTo(ctx, e).bankEdit) throw forbidden();
  const input = z.object({ holderName: z.string().trim().min(3, "Escribe el titular").max(160), clabe: z.string().trim() }).parse(raw);
  const c = checkClabe(input.clabe);
  if (!c.ok) throw invalid(c.error, { clabe: c.error });
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM employee WHERE id = ${id} FOR UPDATE`;
    await tx.bankAccount.updateMany({ where: { companyId: ctx.companyId, employeeId: id, isCurrent: true }, data: { isCurrent: false, replacedAt: new Date() } });
    await tx.bankAccount.create({
      data: {
        companyId: ctx.companyId,
        employeeId: id,
        holderName: input.holderName,
        clabeEnc: encrypt(c.clabe, ctx.companyId, "clabe"),
        clabeLast4: c.clabe.slice(-4),
        bankCode: c.bankCode,
        bankName: c.bankName,
        createdById: ctx.userId,
      },
    });
    await audit(tx, ctx, {
      action: "employee.bank.update",
      module: "employees",
      entityType: "employee",
      entityId: id,
      departmentId: e.departmentId,
      sensitive: true,
      summary: `CLABE terminación ${c.clabe.slice(-4)} (${c.bankName ?? "banco no identificado"}). Estructura válida; titularidad no verificada.`,
    });
  });
}

/** Mostrar la CLABE completa es un acceso sensible auditado. */
export async function revealClabe(ctx: Ctx, bankAccountId: string) {
  const b = await db.bankAccount.findFirst({ where: { id: bankAccountId, companyId: ctx.companyId }, include: { employee: { select: { id: true, departmentId: true, userId: true } } } });
  if (!b || !accessTo(ctx, b.employee).bankRead) throw notFound("La cuenta");
  await auditNow(ctx, { action: "employee.bank.reveal", module: "employees", entityType: "employee", entityId: b.employeeId, departmentId: b.employee.departmentId, sensitive: true });
  return decrypt(b.clabeEnc, ctx.companyId, "clabe");
}

// ───────── Notas y contratos ─────────

export async function addNote(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  const e = await loadEmployee(ctx, id);
  if (!accessTo(ctx, e).notesEdit) throw forbidden();
  const n = z.object({ kind: z.enum(["NOTE", "INCIDENT"]), body: z.string().trim().min(1, "Escribe la nota").max(4000), occurredOn: optDate }).parse(raw);
  await db.$transaction(async (tx) => {
    const note = await tx.employeeNote.create({ data: { companyId: ctx.companyId, employeeId: id, ...n, authorId: ctx.userId } });
    await audit(tx, ctx, { action: "employee.note.add", module: "employees", entityType: "employee", entityId: id, departmentId: e.departmentId, summary: `${n.kind === "INCIDENT" ? "Incidencia" : "Nota"} ${note.id}` });
  });
}

export async function addContract(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  const e = await loadEmployee(ctx, id);
  if (!accessTo(ctx, e).edit) throw forbidden();
  const c = z
    .object({ title: z.string().trim().min(1, "Requerido").max(160), startDate: z.string().min(1, "Requerido").transform(civilDate), endDate: optDate, notes: opt(1000) })
    .refine((c) => !c.endDate || c.endDate >= c.startDate, { message: "El fin no puede ser anterior al inicio", path: ["endDate"] })
    .parse(raw);
  return db.$transaction(async (tx) => {
    const ct = await tx.employeeContract.create({ data: { companyId: ctx.companyId, employeeId: id, ...c } });
    await audit(tx, ctx, { action: "employee.contract.add", module: "employees", entityType: "employee", entityId: id, departmentId: e.departmentId, summary: c.title });
    return ct;
  });
}

// ───────── Estados, bajas y recontratación ─────────

async function lockEmployee(tx: Tx, ctx: Ctx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM employee WHERE id = ${id} AND "companyId" = ${ctx.companyId} FOR UPDATE`;
  if (!rows.length) throw notFound("El expediente");
  return tx.employee.findUniqueOrThrow({ where: { id } });
}

function guardOffboard(ctx: Ctx, e: { id: string; departmentId: string | null; userId: string | null }) {
  if (e.userId && e.userId === ctx.company.ownerId) throw forbidden("El propietario de la empresa no puede ser suspendido ni dado de baja.");
  if (!accessTo(ctx, e).offboard) throw forbidden();
}

/** ACTIVE ↔ SUSPENDED ↔ OFFBOARDING. Suspender bloquea el acceso a la empresa al instante. */
export async function setStatus(ctx: Ctx, id: string, status: "ACTIVE" | "SUSPENDED" | "OFFBOARDING") {
  await db.$transaction(async (tx) => {
    const e = await lockEmployee(tx, ctx, id);
    guardOffboard(ctx, e);
    if (e.status === "FORMER") throw invalid("Para un exempleado usa Recontratar.");
    if (e.status === status) throw invalid("El expediente ya tiene ese estado.");
    await tx.employee.update({ where: { id }, data: { status, version: { increment: 1 } } });
    await audit(tx, ctx, { action: "employee.status", module: "employees", entityType: "employee", entityId: id, departmentId: e.departmentId, changes: { status: [e.status, status] } });
  });
}

const terminateSchema = z.object({
  date: z.string().min(1, "Indica la fecha").transform(civilDate),
  reason: z.enum(["RESIGNATION", "DISMISSAL", "CONTRACT_END", "OTHER"], { message: "Elige un motivo" }),
  notes: opt(2000),
});

/**
 * Baja: cierra el periodo vigente, retira el acceso a ESTA empresa (membresía revocada, sin acceso completo
 * ni concesiones directas) y saca a la persona del organigrama. Conserva expediente, documentos, banco,
 * contratos y auditoría. No toca la cuenta global ni otras empresas.
 */
export async function terminate(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  const t = terminateSchema.parse(raw);
  await db.$transaction(async (tx) => {
    const e = await lockEmployee(tx, ctx, id);
    guardOffboard(ctx, e);
    if (e.status === "FORMER") throw conflict("El expediente ya está dado de baja.");
    const period = await tx.employmentPeriod.findFirst({ where: { companyId: ctx.companyId, employeeId: id, endDate: null } });
    if (!period) throw invalid("No hay un periodo laboral abierto.");
    if (t.date < period.startDate) throw invalid("La fecha de baja no puede ser anterior al ingreso del periodo.", { date: "Anterior al ingreso" });
    await tx.employmentPeriod.update({ where: { id: period.id }, data: { endDate: t.date, terminationReason: t.reason, terminationNotes: t.notes, closedById: ctx.userId } });
    await tx.assignmentHistory.updateMany({ where: { companyId: ctx.companyId, employeeId: id, endedAt: null }, data: { endedAt: new Date() } });
    // Conserva el último departamento/puesto como referencia histórica; el estado FORMER lo excluye de la estructura actual.
    await tx.employee.update({ where: { id }, data: { status: "FORMER", version: { increment: 1 } } });
    let revokedGrants = 0;
    if (e.userId) {
      const m = await tx.membership.findUnique({ where: { companyId_userId: { companyId: ctx.companyId, userId: e.userId } } });
      if (m) {
        revokedGrants = (await tx.grant.deleteMany({ where: { companyId: ctx.companyId, membershipId: m.id } })).count;
        await tx.membership.update({ where: { id: m.id }, data: { status: "REVOKED", fullAccess: false, fullAccessById: null, fullAccessAt: null } });
      }
    }
    await tx.alert.updateMany({ where: { companyId: ctx.companyId, employeeId: id, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    await audit(tx, ctx, {
      action: "employee.terminate",
      module: "employees",
      entityType: "employee",
      entityId: id,
      departmentId: e.departmentId,
      changes: { status: [e.status, "FORMER"], endDate: t.date.toISOString().slice(0, 10), reason: t.reason, revokedGrants },
    });
  });
}

/** Recontratación: mismo expediente, periodo nuevo; no restaura permisos ni acceso completo anteriores. */
export async function rehire(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  const r = z.object({ date: z.string().min(1, "Indica la fecha").transform(civilDate), departmentId: opt(60), positionId: opt(60) }).parse(raw);
  await db.$transaction(async (tx) => {
    const e = await lockEmployee(tx, ctx, id);
    guardOffboard(ctx, e);
    if (e.status !== "FORMER") throw conflict("Solo se puede recontratar a un exempleado.");
    if (e.anonymizedAt) throw invalid("Este expediente fue anonimizado; registra un alta nueva.");
    const last = await tx.employmentPeriod.findFirst({ where: { companyId: ctx.companyId, employeeId: id }, orderBy: { number: "desc" } });
    if (last?.endDate && r.date <= last.endDate) throw invalid("El nuevo periodo debe iniciar después de la última baja.", { date: "Se superpone con el periodo anterior" });
    const { departmentId, positionId } = await validatePlacement(tx, ctx.companyId, r.departmentId, r.positionId);
    if (!can(ctx, "employees.offboard", { departmentId })) throw forbidden("No puedes recontratar en ese departamento.");
    await tx.employmentPeriod.create({ data: { companyId: ctx.companyId, employeeId: id, number: (last?.number ?? 0) + 1, startDate: r.date } });
    await tx.employee.update({ where: { id }, data: { status: "ACTIVE", hireDate: r.date } });
    await recordAssignment(tx, ctx, id, departmentId, positionId, "Recontratación");
    if (e.userId) {
      await tx.membership.updateMany({
        where: { companyId: ctx.companyId, userId: e.userId },
        data: { status: "ACTIVE", fullAccess: false, fullAccessById: null, fullAccessAt: null },
      });
    }
    await audit(tx, ctx, { action: "employee.rehire", module: "employees", entityType: "employee", entityId: id, departmentId, changes: { status: ["FORMER", "ACTIVE"], startDate: r.date.toISOString().slice(0, 10) } });
  });
}

// ───────── Retención ─────────

export async function setLegalHold(ctx: Ctx, id: string, hold: boolean) {
  requireOwner(ctx);
  await db.$transaction(async (tx) => {
    const e = await lockEmployee(tx, ctx, id);
    await tx.employee.update({ where: { id }, data: { legalHold: hold } });
    await audit(tx, ctx, { action: hold ? "employee.legalHold.on" : "employee.legalHold.off", module: "employees", entityType: "employee", entityId: id, departmentId: e.departmentId });
  });
}

/**
 * Anonimización irreversible de un exempleado según la política de retención configurada.
 * Requiere: propietario, reautenticación, política configurada y vencida, sin bloqueo por conservación.
 * Elimina datos personales, banco, notas y archivos; conserva un rastro mínimo (número, periodos, auditoría redactada).
 */
export async function anonymize(ctx: Ctx, id: string, confirmNumber: string) {
  requireOwner(ctx);
  requireRecentReauth(ctx);
  const keys = await db.$transaction(async (tx) => {
    const e = await lockEmployee(tx, ctx, id);
    if (confirmNumber.trim() !== e.number) throw invalid("Escribe el número de expediente para confirmar.", { confirm: "No coincide" });
    if (e.status !== "FORMER") throw invalid("Solo se puede anonimizar a un exempleado.");
    if (e.anonymizedAt) throw conflict("Ya fue anonimizado.");
    if (e.legalHold) throw invalid("El expediente tiene bloqueo de conservación.");
    const s = await tx.companySettings.findUniqueOrThrow({ where: { companyId: ctx.companyId } });
    if (!s.retentionYearsAfterExit) throw invalid("Configura primero la política de retención de la empresa.");
    const last = await tx.employmentPeriod.findFirst({ where: { companyId: ctx.companyId, employeeId: id }, orderBy: { number: "desc" } });
    const until = last?.endDate ? addDays(last.endDate, Math.round(s.retentionYearsAfterExit * 365.25)) : null;
    if (!until || until > new Date()) throw invalid(`La política exige conservar el expediente hasta ${until?.toISOString().slice(0, 10) ?? "una fecha posterior"}.`);
    const k = await anonymizeCore(tx, ctx, id);
    await audit(tx, ctx, { action: "employee.anonymize", module: "employees", entityType: "employee", entityId: id, summary: `${e.number} anonimizado por política de retención` });
    return k;
  });
  appendErasureLedger({ kind: "EMPLOYEE", subject: id, companyId: ctx.companyId });
  // Los archivos se borran tras confirmar la transacción mediante tareas durables con reintento.
  await scheduleFileDeletion(keys);
}

/**
 * Recorre todo lo que puede identificar a la persona en el expediente: datos, banco, notas, contratos, notas de baja,
 * documentos y nombres de archivo, títulos de alertas/notificaciones, mensajes de solicitud y textos de auditoría.
 * Conserva un rastro mínimo (número interno, periodos con fechas/motivo, eventos de auditoría sin texto).
 */
export async function anonymizeCore(tx: Tx, ctx: Pick<Ctx, "companyId" | "userId" | "userLabel">, id: string) {
  const c = ctx.companyId;
  const e = await tx.employee.findUniqueOrThrow({ where: { id } });
  const docs = await tx.document.findMany({ where: { companyId: c, employeeId: id }, select: { id: true } });
  const versions = await tx.documentVersion.findMany({ where: { companyId: c, documentId: { in: docs.map((d) => d.id) }, purgedAt: null }, select: { id: true, storageKey: true } });
  await tx.documentVersion.updateMany({ where: { id: { in: versions.map((v) => v.id) } }, data: { purgedAt: new Date(), originalName: "[eliminado]" } });
  await tx.document.updateMany({ where: { companyId: c, employeeId: id }, data: { title: "[eliminado por retención]", archivedAt: new Date() } });
  await tx.bankAccount.deleteMany({ where: { companyId: c, employeeId: id } });
  await tx.employeeNote.deleteMany({ where: { companyId: c, employeeId: id } });
  await tx.employeeContract.updateMany({ where: { companyId: c, employeeId: id }, data: { title: "Contrato (anonimizado)", notes: null } });
  await tx.employmentPeriod.updateMany({ where: { companyId: c, employeeId: id }, data: { terminationNotes: null } });
  const alerts = await tx.alert.findMany({ where: { companyId: c, employeeId: id }, select: { id: true } });
  await tx.alert.updateMany({ where: { id: { in: alerts.map((a) => a.id) } }, data: { title: "Alerta de expediente anonimizado", status: "RESOLVED", resolvedAt: new Date() } });
  await tx.notification.updateMany({ where: { alertId: { in: alerts.map((a) => a.id) } }, data: { title: "Alerta de expediente anonimizado" } });
  await tx.joinRequest.updateMany({ where: { companyId: c, employeeId: id }, data: { message: null } });
  await tx.employee.update({
    where: { id },
    data: { firstName: "Exempleado anonimizado", lastName: e.number, email: null, phone: null, birthDate: null, curpEnc: null, rfcEnc: null, nssEnc: null, addressEnc: null, curpBidx: null, rfcBidx: null, nssBidx: null, userId: null, anonymizedAt: new Date() },
  });
  await tx.$queryRaw`SELECT audit_redact_entity(${c}, 'employee', ${id})`;
  for (const d of docs) await tx.$queryRaw`SELECT audit_redact_entity(${c}, 'document', ${d.id})`;
  await tx.erasureLog.create({ data: { kind: "EMPLOYEE", subject: id, companyId: c } });
  void ctx;
  return versions.map((v) => v.storageKey);
}

export async function assertEmployeeInCompany(tx: Tx | typeof db, companyId: string, id: string) {
  const e = await tx.employee.findFirst({ where: { id, companyId }, select: { id: true, departmentId: true, userId: true } });
  if (!e) throw new AppError("NOT_FOUND", "El expediente no existe o no tienes acceso.");
  return e;
}
