// Datos de demostración SINTÉTICOS. Idempotente: si ya existen, no hace nada. Bloqueado en producción.
// Las contraseñas se generan al azar y se guardan en .local/demo-credenciales.txt (fuera del repositorio).
export {};
try { process.loadEnvFile(".env"); } catch {}
if (process.env.NODE_ENV === "production") {
  console.error("La carga de demostración está deshabilitada en producción.");
  process.exit(1);
}
const { randomBytes, randomUUID } = await import("node:crypto");
const { writeFileSync, mkdirSync } = await import("node:fs");
const { db } = await import("../src/server/db");
const { auth } = await import("../src/server/auth");
const { loadCtx } = await import("../src/server/context");
const C = await import("../src/server/services/companies");
const S = await import("../src/server/services/structure");
const E = await import("../src/server/services/employees");
const D = await import("../src/server/services/documents");
const I = await import("../src/server/services/inventory");
const P = await import("../src/server/services/suppliers");
const PU = await import("../src/server/services/purchases");
const M = await import("../src/server/services/maintenance");
const A = await import("../src/server/services/announcements");
const AL = await import("../src/server/services/alerts");

const MARK = "Constructora Demo SA de CV";
if (await db.company.findFirst({ where: { legalName: MARK } })) {
  console.log("Los datos de demostración ya están cargados. Credenciales en .local/demo-credenciales.txt");
  process.exit(0);
}

const password = randomBytes(9).toString("base64url") + "A1";
async function user(email: string, name: string, lastName: string) {
  await auth.api.signUpEmail({ body: { email, password, name, lastName, phone: "5550000000", acceptTerms: true } as never });
  return db.user.update({ where: { email }, data: { emailVerified: true } });
}
// Contexto de sistema para la carga (reautenticación implícita: solo en este script de desarrollo).
const ctxOf = (userId: string, companyId: string) => loadCtx(userId, companyId, { id: "seed", reauthAt: new Date(), twoFactorEnabled: true });
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const pdf = (t: string) => new File([`%PDF-1.4\n% ${t}\ntrailer<<>>\n%%EOF`], `${t}.pdf`, { type: "application/pdf" });
const key = () => randomUUID();

const ceo = await user("ceo@demo.test", "Carla", "Directora");
const admin = await user("admin@demo.test", "Andrés", "Administrador");
const rh = await user("rh@demo.test", "Rosa", "Humanos");
const emp = await user("empleado@demo.test", "Ernesto", "Empleado");
const ceoB = await user("ceo.taller@demo.test", "Tomás", "Taller");

// ── Empresa A ──
const a = await C.createCompany(ceo, { legalName: MARK, tradeName: "Constructora Demo", activity: "Construcción", rfc: "CDE010101AB1", email: "contacto@demo.test" });
let ca = await ctxOf(ceo.id, a.id);
for (const m of ["inventory", "suppliers", "purchases", "maintenance", "ai"]) await C.setModule(ca, m, true);
ca = await ctxOf(ceo.id, a.id);
const dDir = await S.saveDepartment(ca, null, { name: "Dirección" });
const dSis = await S.saveDepartment(ca, null, { name: "Sistemas", parentId: dDir.id });
const dRh = await S.saveDepartment(ca, null, { name: "Recursos Humanos", parentId: dDir.id });
const dOp = await S.saveDepartment(ca, null, { name: "Operaciones", parentId: dDir.id });
const pDir = await S.savePosition(ca, null, { title: "Director general", departmentId: dDir.id });
const pJs = await S.savePosition(ca, null, { title: "Jefe de sistemas", departmentId: dSis.id, parentPositionId: pDir.id });
const pDev = await S.savePosition(ca, null, { title: "Desarrollador", departmentId: dSis.id, parentPositionId: pJs.id, headcount: "3" });
const pRh = await S.savePosition(ca, null, { title: "Responsable de RH", departmentId: dRh.id, parentPositionId: pDir.id });
const pOp = await S.savePosition(ca, null, { title: "Operador de maquinaria", departmentId: dOp.id, parentPositionId: pDir.id, headcount: "4" });
const ceoEmp = await db.employee.findFirstOrThrow({ where: { companyId: a.id, userId: ceo.id } });
await E.changeAssignment(ca, ceoEmp.id, { positionId: pDir.id, reason: "Configuración inicial" });

async function join(u: { id: string }, companyId: string, ownerCtx: Awaited<ReturnType<typeof ctxOf>>, placement: Record<string, string>) {
  const c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const r = await C.requestJoin(u.id, "127.0.0.1", c.joinCode, "Alta de demostración");
  return (await C.approveJoinRequest(ownerCtx, r.id, { mode: "new", ...placement })).employeeId;
}
await join(admin, a.id, ca, { departmentId: dDir.id });
const rhEmpId = await join(rh, a.id, ca, { positionId: pRh.id });
const empId = await join(emp, a.id, ca, { positionId: pDev.id });
const mAdmin = await db.membership.findFirstOrThrow({ where: { companyId: a.id, userId: admin.id } });
await C.setFullAccess(ca, mAdmin.id, true);
// RH: personal de toda la empresa excepto Dirección (restricción), sin banco.
for (const p of ["employees.read", "employees.create", "employees.edit", "employees.offboard", "employees.personal.read", "employees.personal.edit", "employees.documents.view", "employees.documents.preview", "employees.documents.download", "employees.documents.upload", "joinRequests.review", "announcements.publish", "audit.read", "ai.use"])
  await C.addGrant(ca, { subjectType: "POSITION", subjectId: pRh.id, permission: p, effect: "ALLOW", scope: "COMPANY" });
await C.addGrant(ca, { subjectType: "POSITION", subjectId: pRh.id, permission: "employees.read", effect: "DENY", scope: "DEPARTMENTS", scopeDepartmentIds: [dDir.id] });
// Todo el personal: completar sus propios datos y documentos.
for (const d of [dSis, dRh, dOp]) for (const p of ["employees.personal.edit", "employees.documents.upload", "employees.bank.edit"])
  await C.addGrant(ca, { subjectType: "DEPARTMENT", subjectId: d.id, permission: p, effect: "ALLOW", scope: "OWN" });
// Jefe de sistemas: solo su departamento.
await C.addGrant(ca, { subjectType: "POSITION", subjectId: pJs.id, permission: "employees.read", effect: "ALLOW", scope: "DEPARTMENTS", scopeDepartmentIds: [dSis.id] });

ca = await ctxOf(ceo.id, a.id);
const people = [
  { firstName: "Lucía", lastName: "Martínez", positionId: pJs.id, curp: "BADD110313HCMLNS06", rfc: "GODE561231GR8", nss: "12345678903", birthDate: "1990-04-12", phone: "5551234567", address: "Calle Ficticia 123, CDMX" },
  { firstName: "Pedro", lastName: "Gómez", positionId: pOp.id, birthDate: "1985-01-01" },
  { firstName: "Marta", lastName: "Ruiz", positionId: pOp.id },
  { firstName: "Iván", lastName: "Salas", positionId: pDev.id },
];
const ids: string[] = [];
for (const p of people) ids.push((await E.createEmployee(ca, { ...p, hireDate: day(-400) }))!.id);
await E.setBankAccount(ca, ids[0], { holderName: "Lucía Martínez", clabe: "032180000118359719" });
await E.addNote(ca, ids[1], { kind: "INCIDENT", body: "Nota interna sintética: retardo reportado." });
await E.addContract(ca, ids[1], { title: "Contrato por obra", startDate: day(-400), endDate: day(15) });
await D.uploadDocument(ca, { title: "INE frente Lucía", docType: "INE_FRONT", employeeId: ids[0], expiresOn: day(20) }, pdf("ine-lucia"));
// Exempleado de Sistemas, recontratable.
await E.terminate(ca, ids[3], { date: day(-30), reason: "RESIGNATION", notes: "Renuncia voluntaria (dato sintético)" });

const reglamento = await D.uploadDocument(ca, { title: "Reglamento interno", category: "Reglamentos" }, pdf("reglamento-v1"));
await D.addVersion(ca, reglamento.id, pdf("reglamento-v2"));
const conf = await D.createFolder(ca, { name: "Dirección", confidential: "on" });
await D.uploadDocument(ca, { title: "Plan estratégico", folderId: conf.id }, pdf("plan"));

// Inventario, activos, proveedores, compras.
const consum = await I.activateSuggested(ca, "consumibles");
const maq = await I.activateSuggested(ca, "maquinaria");
const veh = await I.activateSuggested(ca, "vehiculos");
const torn = await I.createItem(ca, { name: "Tornillo 1/4", categoryId: consum.id, unit: "caja", initialQuantity: "3", minQuantity: "5" });
await I.createItem(ca, { name: "Guantes de carnaza", categoryId: consum.id, unit: "par", initialQuantity: "40", minQuantity: "10" });
const s1 = await P.createSupplier(ca, { name: "Ferretería Central", categories: "tornillería, herramienta" });
const s2 = await P.createSupplier(ca, { name: "Distribuidora del Norte", categories: "tornillería" });
for (const [s, price] of [[s1, "185.50"], [s2, "172.00"]] as const) {
  const p = await PU.createPurchase(ca, { supplierId: s.id, orderedOn: day(-60), currency: "MXN", lines: [{ kind: "STOCK", itemId: torn.id, quantity: "10", unitPrice: price }] });
  await PU.confirmPurchase(ca, p.id);
  const full = await PU.getPurchase(ca, p.id);
  await PU.receivePurchase(ca, p.id, { idempotencyKey: key(), lines: [{ lineId: full.purchase.lines[0].id, quantity: "10" }] });
}
const pAsset = await PU.createPurchase(ca, { supplierId: s1.id, orderedOn: day(-90), currency: "MXN", lines: [{ kind: "ASSET", categoryId: maq.id, description: "Retroexcavadora", quantity: "1", unitPrice: "1250000" }, { kind: "STOCK", itemId: torn.id, quantity: "20", unitPrice: "180" }] });
await PU.confirmPurchase(ca, pAsset.id);
const fa = await PU.getPurchase(ca, pAsset.id);
await PU.receivePurchase(ca, pAsset.id, { idempotencyKey: key(), lines: [{ lineId: fa.purchase.lines[0].id, quantity: "1", serials: ["RX-2024-001"] }, { lineId: fa.purchase.lines[1].id, quantity: "5" }] });
const retro = await db.asset.findFirstOrThrow({ where: { companyId: a.id, serial: "RX-2024-001" } });
await I.updateAsset(ca, retro.id, { name: "Retroexcavadora", categoryId: maq.id, serial: "RX-2024-001", usageKind: "HOURS", supplierId: s1.id }, retro.version);
await M.recordReading(ca, retro.id, { value: "1180" });
await M.createPlan(ca, retro.id, { name: "Servicio de 250 horas", intervalReading: "250", lastServiceReading: "950", intervalDays: "180", lastServiceOn: day(-100) });
const camion = await I.createAsset(ca, { name: "Camión de volteo", categoryId: veh.id, serial: "VIN-DEMO-77", usageKind: "KM", initialReading: "48000", costAmount: "890000" });
await M.createPlan(ca, camion.id, { name: "Cambio de aceite", intervalDays: "90", lastServiceOn: day(-85), intervalReading: "10000", lastServiceReading: "40000" });
const vendido = await I.createAsset(ca, { name: "Camioneta antigua", categoryId: veh.id, serial: "VIN-OLD-01", costAmount: "300000" });
await I.changeAssetStatus(ca, vendido.id, { status: "SOLD", soldOn: day(-10), saleAmount: "120000", saleCurrency: "MXN", notes: "Venta sintética" });

await A.publish(ca, { title: "Bienvenida", body: "Aviso general de demostración.", audience: "all" });
await A.publish(ca, { title: "Mantenimiento de servidores", body: "Solo para Sistemas.", audience: "departments", departmentIds: [dSis.id] });

// ── Empresa B: la CEO de A es empleada aquí ──
const b = await C.createCompany(ceoB, { legalName: "Taller Demo SA de CV", tradeName: "Taller Demo", activity: "Servicios mecánicos" });
const cb = await ctxOf(ceoB.id, b.id);
const bDept = await S.saveDepartment(cb, null, { name: "Taller" });
await join(ceo, b.id, cb, { departmentId: bDept.id });
await E.createEmployee(cb, { firstName: "Brenda", lastName: "Mecánica", departmentId: bDept.id });

await AL.scanCompany(a.id);
await AL.scanCompany(b.id);

mkdirSync(".local", { recursive: true });
const creds = [
  "Credenciales de DEMOSTRACIÓN (solo desarrollo local). Contraseña común generada al azar:",
  `  ${password}`,
  "Cuentas:",
  "  ceo@demo.test          Propietaria de Constructora Demo; empleada en Taller Demo",
  "  admin@demo.test        Acceso completo operativo en Constructora Demo",
  "  rh@demo.test           Responsable de RH (permisos por puesto; sin Dirección ni banco)",
  "  empleado@demo.test     Desarrollador (empleado básico)",
  "  ceo.taller@demo.test   Propietario de Taller Demo",
].join("\n");
writeFileSync(".local/demo-credenciales.txt", creds + "\n", { mode: 0o600 });
console.log("Datos de demostración cargados. Credenciales en .local/demo-credenciales.txt");
void empId; void rhEmpId;
process.exit(0);
