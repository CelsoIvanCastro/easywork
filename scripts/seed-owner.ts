// Datos SINTÉTICOS para que el operador vea la plataforma llena: 4 empresas de giros distintos con él como propietario.
// Uso: npx tsx --conditions=react-server scripts/seed-owner.ts "Nombre Apellidos"  · Idempotente por razón social. Bloqueado en producción.
export {};
try { process.loadEnvFile(".env"); } catch {}
if (process.env.NODE_ENV === "production") { console.error("Deshabilitado en producción."); process.exit(1); }
const { randomUUID } = await import("node:crypto");
const { db } = await import("../src/server/db");
const { loadCtx } = await import("../src/server/context");
const { auth } = await import("../src/server/auth");
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

const full = (process.argv[2] ?? "").trim().toLowerCase();
const me0 = (await db.user.findMany({ select: { id: true, name: true, lastName: true } })).find((u) => `${u.name} ${u.lastName}`.trim().toLowerCase() === full);
if (!me0) { console.error("No encontré esa cuenta."); process.exit(1); }
const meUser = await db.user.findUniqueOrThrow({ where: { id: me0.id } });

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const pdf = (t: string) => new File([`%PDF-1.4\n% ${t} (sintético)\ntrailer<<>>\n%%EOF`], `${t}.pdf`, { type: "application/pdf" });
const clabe = () => {
  const d = ("002" + "730" + String(int(10000000000, 99999999999))).slice(0, 17).split("").map(Number);
  const s = d.reduce((a, x, i) => a + ((x * [3, 7, 1][i % 3]) % 10), 0);
  return d.join("") + ((10 - (s % 10)) % 10);
};
const NOMBRES = ["José", "María", "Juan", "Guadalupe", "Luis", "Ana", "Carlos", "Rosa", "Jesús", "Laura", "Miguel", "Fernanda", "Jorge", "Daniela", "Ricardo", "Patricia", "Alejandro", "Sofía", "Héctor", "Karla", "Raúl", "Valeria", "Arturo", "Mónica", "Ramón", "Adriana", "Sergio", "Claudia", "Manuel", "Brenda", "Omar", "Itzel", "Efraín", "Yesenia", "Germán", "Lizbeth"];
const APELLIDOS = ["López", "García", "Hernández", "Martínez", "Rodríguez", "Sánchez", "Ramírez", "Flores", "Torres", "Félix", "Valenzuela", "Gastélum", "Zazueta", "Inzunza", "Quintero", "Bojórquez", "Ochoa", "Medina", "Leyva", "Beltrán", "Osuna", "Camacho", "Armenta", "Urías", "Sarabia", "Lizárraga", "Rubio", "Peraza"];
const CALLES = ["Av. Obregón", "Blvd. Zapata", "Calle Rosales", "Av. Insurgentes", "Calle Juárez", "Blvd. Rosendo G. Castro", "Av. del Mar", "Calle Ángel Flores"];

type Pos = { title: string; n: number; boss?: string };
export type Spec = {
  legalName: string; tradeName: string; activity: string; city: string; modules: string[];
  depts: { name: string; positions: Pos[] }[]; ownerTitle: string;
  cats: string[]; items: { name: string; cat: string; unit: string; qty: string; min: string; price: string }[];
  suppliers: { name: string; categories: string }[];
  assets: { name: string; cat: string; serial: string; usage?: "HOURS" | "KM"; reading?: string; cost: string; plan?: { name: string; days?: string; every?: string; last?: string; lastDays: number } }[];
  docs: { title: string; category: string }[];
  notices: string[][];
};

const SPECS: Spec[] = [
  {
    legalName: "Mariscos El Faro de Mazatlán SA de CV", tradeName: "Mariscos El Faro", activity: "Restaurante de mariscos", city: "Mazatlán, Sin.",
    modules: ["inventory", "suppliers", "purchases", "maintenance", "ai"], ownerTitle: "Director general",
    depts: [
      { name: "Dirección", positions: [{ title: "Director general", n: 1 }, { title: "Gerente de restaurante", n: 1, boss: "Director general" }] },
      { name: "Cocina", positions: [{ title: "Chef ejecutivo", n: 1, boss: "Gerente de restaurante" }, { title: "Cocinero", n: 5, boss: "Chef ejecutivo" }, { title: "Ayudante de cocina", n: 4, boss: "Chef ejecutivo" }] },
      { name: "Servicio", positions: [{ title: "Capitán de meseros", n: 1, boss: "Gerente de restaurante" }, { title: "Mesero", n: 8, boss: "Capitán de meseros" }, { title: "Cajero", n: 2, boss: "Gerente de restaurante" }] },
      { name: "Administración", positions: [{ title: "Contador", n: 1, boss: "Director general" }, { title: "Auxiliar administrativo", n: 1, boss: "Contador" }] },
    ],
    cats: ["consumibles", "limpieza", "uniformes", "mobiliario", "maquinaria"],
    items: [
      { name: "Camarón 21/25", cat: "consumibles", unit: "kg", qty: "38", min: "25", price: "289" },
      { name: "Filete de marlin", cat: "consumibles", unit: "kg", qty: "12", min: "15", price: "210" },
      { name: "Limón", cat: "consumibles", unit: "kg", qty: "45", min: "20", price: "32" },
      { name: "Tostadas", cat: "consumibles", unit: "paquete", qty: "60", min: "30", price: "48" },
      { name: "Aceite vegetal 20 L", cat: "consumibles", unit: "pieza", qty: "4", min: "3", price: "720" },
      { name: "Desengrasante", cat: "limpieza", unit: "litro", qty: "6", min: "10", price: "65" },
      { name: "Mandil negro", cat: "uniformes", unit: "pieza", qty: "25", min: "10", price: "140" },
    ],
    suppliers: [{ name: "Pescadería La Puntilla", categories: "pescados, mariscos" }, { name: "Abarrotes del Pacífico", categories: "abarrotes, desechables" }, { name: "Limpieza Total Mazatlán", categories: "químicos de limpieza" }],
    assets: [
      { name: "Cámara de refrigeración", cat: "maquinaria", serial: "CF-2022-114", cost: "185000", plan: { name: "Limpieza de condensador", days: "60", lastDays: -55 } },
      { name: "Freidora industrial", cat: "maquinaria", serial: "FR-8812", cost: "42000", plan: { name: "Revisión de quemadores", days: "90", lastDays: -20 } },
      { name: "Mesas de terraza (lote 12)", cat: "mobiliario", serial: "MOB-TER-12", cost: "36000" },
    ],
    docs: [{ title: "Reglamento interno", category: "Reglamentos" }, { title: "Licencia de funcionamiento", category: "Permisos" }, { title: "Dictamen de Protección Civil", category: "Permisos" }, { title: "Menú vigente", category: "Operación" }],
    notices: [["Cambio de turno en Semana Santa", "Los turnos de jueves y viernes santo se publican el lunes."], ["Capacitación de higiene", "Todo el personal de Cocina tomará el curso el día 15."]],
  },
  {
    legalName: "AgroValle del Fuerte SPR de RL", tradeName: "AgroValle del Fuerte", activity: "Producción agrícola y empaque de hortalizas", city: "Los Mochis, Sin.",
    modules: ["inventory", "suppliers", "purchases", "maintenance", "ai"], ownerTitle: "Director general",
    depts: [
      { name: "Dirección", positions: [{ title: "Director general", n: 1 }, { title: "Gerente agrícola", n: 1, boss: "Director general" }] },
      { name: "Campo", positions: [{ title: "Ingeniero agrónomo", n: 2, boss: "Gerente agrícola" }, { title: "Mayordomo", n: 3, boss: "Ingeniero agrónomo" }, { title: "Tractorista", n: 4, boss: "Mayordomo" }, { title: "Regador", n: 4, boss: "Mayordomo" }] },
      { name: "Empaque", positions: [{ title: "Jefe de empaque", n: 1, boss: "Gerente agrícola" }, { title: "Empacador", n: 8, boss: "Jefe de empaque" }, { title: "Inspector de calidad", n: 2, boss: "Jefe de empaque" }] },
      { name: "Taller", positions: [{ title: "Mecánico", n: 2, boss: "Gerente agrícola" }] },
      { name: "Administración", positions: [{ title: "Contador", n: 1, boss: "Director general" }, { title: "Encargado de nómina", n: 1, boss: "Contador" }] },
    ],
    cats: ["materiales", "herramientas", "maquinaria", "vehiculos", "uniformes"],
    items: [
      { name: "Fertilizante NPK 17-17-17", cat: "materiales", unit: "kg", qty: "2400", min: "1500", price: "18.5" },
      { name: "Cinta de riego por goteo", cat: "materiales", unit: "rollo", qty: "14", min: "20", price: "2350" },
      { name: "Caja de cartón para tomate", cat: "materiales", unit: "pieza", qty: "5200", min: "3000", price: "9.8" },
      { name: "Diésel", cat: "materiales", unit: "litro", qty: "1800", min: "1000", price: "24.9" },
      { name: "Machete", cat: "materiales", unit: "pieza", qty: "30", min: "10", price: "155" },
      { name: "Sombrero de palma", cat: "uniformes", unit: "pieza", qty: "8", min: "25", price: "60" },
    ],
    suppliers: [{ name: "Agroinsumos del Norte", categories: "fertilizantes, agroquímicos" }, { name: "Empaques Sinaloa", categories: "cajas, etiquetas" }, { name: "Maquinaria Agrícola Ahome", categories: "refacciones, tractores" }, { name: "Gasolinera El Fuerte", categories: "combustible" }],
    assets: [
      { name: "Tractor John Deere 6110", cat: "maquinaria", serial: "JD6110-0451", usage: "HOURS", reading: "3420", cost: "1450000", plan: { name: "Servicio de 250 horas", every: "250", last: "3200", days: "180", lastDays: -70 } },
      { name: "Tractor Massey Ferguson 4292", cat: "maquinaria", serial: "MF4292-118", usage: "HOURS", reading: "5180", cost: "980000", plan: { name: "Servicio de 250 horas", every: "250", last: "4950", days: "180", lastDays: -120 } },
      { name: "Camioneta Ford F-350", cat: "vehiculos", serial: "VIN-F350-2290", usage: "KM", reading: "128400", cost: "690000", plan: { name: "Cambio de aceite", every: "10000", last: "120000", days: "120", lastDays: -100 } },
      { name: "Bomba de riego 25 HP", cat: "maquinaria", serial: "BR-25-077", usage: "HOURS", reading: "910", cost: "125000", plan: { name: "Revisión de sellos", every: "500", last: "500", lastDays: -200 } },
    ],
    docs: [{ title: "Reglamento interior de trabajo", category: "Reglamentos" }, { title: "Certificación de inocuidad", category: "Calidad" }, { title: "Contrato de arrendamiento de parcelas", category: "Legal" }],
    notices: [["Inicio de cosecha de tomate", "La cosecha inicia el lunes; horario de empaque extendido."], ["Uso obligatorio de equipo de protección", "Para aplicación de agroquímicos usa mascarilla y guantes."]],
  },
  {
    legalName: "Transportes Castro del Pacífico SA de CV", tradeName: "Transportes Castro", activity: "Autotransporte de carga", city: "Culiacán, Sin.",
    modules: ["inventory", "suppliers", "purchases", "maintenance", "ai"], ownerTitle: "Director general",
    depts: [
      { name: "Dirección", positions: [{ title: "Director general", n: 1 }, { title: "Gerente de operaciones", n: 1, boss: "Director general" }] },
      { name: "Tráfico", positions: [{ title: "Coordinador de tráfico", n: 2, boss: "Gerente de operaciones" }, { title: "Operador de tractocamión", n: 10, boss: "Coordinador de tráfico" }] },
      { name: "Mantenimiento", positions: [{ title: "Jefe de taller", n: 1, boss: "Gerente de operaciones" }, { title: "Mecánico diésel", n: 3, boss: "Jefe de taller" }, { title: "Llantero", n: 1, boss: "Jefe de taller" }] },
      { name: "Administración", positions: [{ title: "Contador", n: 1, boss: "Director general" }, { title: "Facturista", n: 2, boss: "Contador" }, { title: "Recursos Humanos", n: 1, boss: "Director general" }] },
    ],
    cats: ["vehiculos", "herramientas", "consumibles", "materiales"],
    items: [
      { name: "Aceite 15W-40 (cubeta 19 L)", cat: "consumibles", unit: "pieza", qty: "9", min: "12", price: "1650" },
      { name: "Filtro de aceite Cummins", cat: "consumibles", unit: "pieza", qty: "18", min: "10", price: "480" },
      { name: "Llanta 11R22.5", cat: "materiales", unit: "pieza", qty: "14", min: "8", price: "6900" },
      { name: "Anticongelante", cat: "consumibles", unit: "litro", qty: "60", min: "40", price: "75" },
      { name: "Llave de impacto 1\"", cat: "materiales", unit: "pieza", qty: "3", min: "2", price: "8900" },
    ],
    suppliers: [{ name: "Refaccionaria Diésel Culiacán", categories: "refacciones, filtros" }, { name: "Llantas y Servicios del Valle", categories: "llantas" }, { name: "Lubricantes Pacífico", categories: "aceites" }],
    assets: [
      { name: "Tractocamión Kenworth T680 · 01", cat: "vehiculos", serial: "VIN-KW680-0101", usage: "KM", reading: "412000", cost: "2350000", plan: { name: "Servicio mayor", every: "25000", last: "390000", days: "120", lastDays: -90 } },
      { name: "Tractocamión Kenworth T680 · 02", cat: "vehiculos", serial: "VIN-KW680-0102", usage: "KM", reading: "288500", cost: "2350000", plan: { name: "Servicio mayor", every: "25000", last: "270000", days: "120", lastDays: -40 } },
      { name: "Tractocamión Freightliner Cascadia", cat: "vehiculos", serial: "VIN-FL-CAS-77", usage: "KM", reading: "530100", cost: "1980000", plan: { name: "Servicio mayor", every: "25000", last: "506000", days: "120", lastDays: -118 } },
      { name: "Caja seca 53 pies", cat: "vehiculos", serial: "CS53-2019-08", cost: "540000" },
      { name: "Compresor de taller", cat: "herramientas", serial: "CMP-500L", cost: "38000" },
    ],
    docs: [{ title: "Permiso SCT de autotransporte", category: "Permisos" }, { title: "Póliza de seguro de flota", category: "Seguros" }, { title: "Política de descanso de operadores", category: "Reglamentos" }],
    notices: [["Revisión de bitácoras", "Entrega tu bitácora de horas de servicio cada viernes."], ["Nueva ruta Culiacán–Tijuana", "A partir del día 1 se asignan dos unidades fijas."]],
  },
  {
    legalName: "Clínica Dental Sonrisa Sinaloense SC", tradeName: "Clínica Dental Sonrisa", activity: "Servicios odontológicos", city: "Culiacán, Sin.",
    modules: ["inventory", "suppliers", "purchases", "maintenance", "ai"], ownerTitle: "Director médico",
    depts: [
      { name: "Dirección", positions: [{ title: "Director médico", n: 1 }] },
      { name: "Consultorios", positions: [{ title: "Odontólogo general", n: 3, boss: "Director médico" }, { title: "Ortodoncista", n: 1, boss: "Director médico" }, { title: "Asistente dental", n: 4, boss: "Odontólogo general" }] },
      { name: "Recepción", positions: [{ title: "Recepcionista", n: 2, boss: "Director médico" }] },
      { name: "Administración", positions: [{ title: "Administradora", n: 1, boss: "Director médico" }] },
    ],
    cats: ["consumibles", "limpieza", "maquinaria", "mobiliario"],
    items: [
      { name: "Guantes de nitrilo (caja 100)", cat: "consumibles", unit: "caja", qty: "22", min: "15", price: "185" },
      { name: "Resina compuesta A2", cat: "consumibles", unit: "pieza", qty: "6", min: "8", price: "690" },
      { name: "Anestesia lidocaína (caja 50)", cat: "consumibles", unit: "caja", qty: "5", min: "4", price: "950" },
      { name: "Cubrebocas tricapa (caja 50)", cat: "consumibles", unit: "caja", qty: "30", min: "20", price: "70" },
      { name: "Desinfectante de superficies", cat: "limpieza", unit: "litro", qty: "4", min: "6", price: "210" },
    ],
    suppliers: [{ name: "Depósito Dental del Noroeste", categories: "materiales dentales" }, { name: "Biomédica Culiacán", categories: "mantenimiento de equipo" }],
    assets: [
      { name: "Unidad dental · Consultorio 1", cat: "maquinaria", serial: "UD-SIR-1101", cost: "165000", plan: { name: "Mantenimiento preventivo", days: "180", lastDays: -170 } },
      { name: "Unidad dental · Consultorio 2", cat: "maquinaria", serial: "UD-SIR-1102", cost: "165000", plan: { name: "Mantenimiento preventivo", days: "180", lastDays: -60 } },
      { name: "Autoclave 23 L", cat: "maquinaria", serial: "AC-23-5521", cost: "58000", plan: { name: "Validación de esterilización", days: "30", lastDays: -33 } },
      { name: "Equipo de rayos X intraoral", cat: "maquinaria", serial: "RX-IO-889", cost: "120000", plan: { name: "Revisión de seguridad radiológica", days: "365", lastDays: -300 } },
    ],
    docs: [{ title: "Aviso de funcionamiento COFEPRIS", category: "Permisos" }, { title: "Manual de esterilización", category: "Calidad" }, { title: "Reglamento interno", category: "Reglamentos" }],
    notices: [["Jornada de limpieza dental gratuita", "El sábado 20 atenderemos a la comunidad de 9 a 14 h."]],
  },
];

async function build(sp: Spec, owner: { id: string }, ownerUser: Parameters<typeof C.createCompany>[0]) {
  const prev = await db.company.findFirst({ where: { legalName: sp.legalName } });
  if (prev && (await db.supplier.count({ where: { companyId: prev.id } }))) { console.log(`Ya existe: ${sp.tradeName}`); return null; }
  const resume = !!prev; // carga anterior interrumpida antes de proveedores: continuar desde inventario
  const co = prev ?? (await C.createCompany(ownerUser, { legalName: sp.legalName, tradeName: sp.tradeName, activity: sp.activity }));
  const ctxOf = () => loadCtx(owner.id, co.id, { id: "seed-owner", reauthAt: new Date(), twoFactorEnabled: true });
  let ctx = await ctxOf();
  const emps: string[] = [];
  const posIds = new Map<string, string>();
  const depIds = new Map<string, string>();
  for (const m of sp.modules) await C.setModule(ctx, m, true);
  ctx = await ctxOf();
  if (resume) {
    for (const d of await db.department.findMany({ where: { companyId: co.id } })) depIds.set(d.name, d.id);
    for (const p of await db.position.findMany({ where: { companyId: co.id } })) posIds.set(p.title, p.id);
  }
  if (!resume) {

  // Estructura
  const slots: { positionId: string; title: string; deptId: string }[] = [];
  let dirId: string | undefined;
  for (const d of sp.depts) {
    const dep = await S.saveDepartment(ctx, null, { name: d.name, ...(dirId && d.name !== "Dirección" ? { parentId: dirId } : {}) });
    if (d.name === "Dirección") dirId = dep.id;
    depIds.set(d.name, dep.id);
    for (const p of d.positions) {
      const pos = await S.savePosition(ctx, null, { title: p.title, departmentId: dep.id, headcount: String(Math.max(p.n, 1)), ...(p.boss ? { parentPositionId: posIds.get(p.boss) } : {}) });
      posIds.set(p.title, pos.id);
      for (let i = 0; i < p.n; i++) slots.push({ positionId: pos.id, title: p.title, deptId: dep.id });
    }
  }
  const me = await db.employee.findFirstOrThrow({ where: { companyId: co.id, userId: owner.id } });
  await E.changeAssignment(ctx, me.id, { positionId: posIds.get(sp.ownerTitle)!, reason: "Configuración inicial" });
  ctx = await ctxOf();

  // Personal
  const taken = new Set<string>();
  for (const s of slots.filter((x) => x.title !== sp.ownerTitle)) {
    let first: string, last: string;
    do { first = pick(NOMBRES); last = `${pick(APELLIDOS)} ${pick(APELLIDOS)}`; } while (taken.has(first + last));
    taken.add(first + last);
    const complete = rnd() > 0.3;
    const e = await E.createEmployee(ctx, {
      firstName: first, lastName: last, positionId: s.positionId, hireDate: day(-int(30, 2600)),
      email: rnd() > 0.4 ? `${first}.${last.split(" ")[0]}`.normalize("NFD").replace(/[^\w.]/g, "").toLowerCase() + "@ejemplo.test" : "",
      ...(complete ? { birthDate: day(-int(19, 58) * 365 - int(0, 364)), phone: `667${int(1000000, 9999999)}`, address: `${pick(CALLES)} ${int(10, 2999)}, ${sp.city}` } : {}),
    });
    emps.push(e!.id);
    if (complete && rnd() > 0.35) await E.setBankAccount(ctx, e!.id, { holderName: `${first} ${last}`, clabe: clabe() });
    if (rnd() > 0.55) await D.uploadDocument(ctx, { title: `INE ${first} ${last.split(" ")[0]}`, docType: "INE_FRONT", employeeId: e!.id, expiresOn: day(int(-20, 1500)) }, pdf(`ine-${emps.length}`));
    if (rnd() > 0.7) await D.uploadDocument(ctx, { title: `Comprobante de domicilio`, docType: "PROOF_ADDRESS", employeeId: e!.id }, pdf(`dom-${emps.length}`));
    if (rnd() > 0.6) await E.addContract(ctx, e!.id, { title: rnd() > 0.5 ? "Contrato por tiempo indeterminado" : "Contrato por temporada", startDate: day(-int(60, 700)), ...(rnd() > 0.5 ? { endDate: day(int(5, 200)) } : {}) });
    if (rnd() > 0.85) await E.addNote(ctx, e!.id, { kind: pick(["NOTE", "INCIDENT"] as const), body: pick(["Solicitó cambio de turno (dato sintético).", "Retardo de 20 minutos (dato sintético).", "Reconocimiento por desempeño (dato sintético)."]) });
  }
  // Dos bajas por empresa para tener exempleados.
  for (const id of emps.slice(-2)) await E.terminate(ctx, id, { date: day(-int(10, 300)), reason: pick(["RESIGNATION", "CONTRACT_END"] as const), notes: "Baja sintética" });

  // Documentos de la empresa
  for (const d of sp.docs) await D.uploadDocument(ctx, { title: d.title, category: d.category, ...(rnd() > 0.5 ? { expiresOn: day(int(15, 400)) } : {}) }, pdf(d.title));
  const conf = await D.createFolder(ctx, { name: "Dirección", confidential: "on" });
  await D.uploadDocument(ctx, { title: "Estados financieros", folderId: conf.id }, pdf("finanzas"));

  }
  // Inventario, proveedores, compras
  const cat = new Map<string, string>();
  for (const k of sp.cats) cat.set(k, (await I.activateSuggested(ctx, k)).id);
  const items = [];
  for (const it of sp.items) items.push({ ...it, id: (await db.item.findFirst({ where: { companyId: co.id, name: it.name } }))?.id ?? (await I.createItem(ctx, { name: it.name, categoryId: cat.get(it.cat), unit: it.unit, initialQuantity: it.qty, minQuantity: it.min })).id });
  const sups = [];
  for (const s of sp.suppliers) sups.push(await P.createSupplier(ctx, s));
  for (let n = 0; n < 6; n++) {
    const lines = [...items].sort(() => rnd() - 0.5).slice(0, int(1, 3)).map((it) => ({ kind: "STOCK", itemId: it.id, quantity: String(int(2, 40)), unitPrice: it.price }));
    const po = await PU.createPurchase(ctx, { supplierId: pick(sups).id, orderedOn: day(-int(3, 120)), currency: "MXN", lines });
    if (n === 5) continue; // una en borrador
    await PU.confirmPurchase(ctx, po.id);
    if (n === 4) continue; // una confirmada sin recibir
    const fp = await PU.getPurchase(ctx, po.id);
    await PU.receivePurchase(ctx, po.id, { idempotencyKey: randomUUID(), lines: fp.purchase.lines.map((l) => ({ lineId: l.id, quantity: n === 3 ? String(Math.max(1, Math.floor(Number(l.quantity) / 2))) : String(Number(l.quantity)) })) });
  }

  // Activos y mantenimiento
  for (const a of sp.assets) {
    const as = await I.createAsset(ctx, { name: a.name, categoryId: cat.get(a.cat), serial: a.serial, costAmount: a.cost, ...(a.usage ? { usageKind: a.usage, initialReading: a.reading } : {}), supplierId: sups[0].id });
    if (a.plan) await M.createPlan(ctx, as.id, { name: a.plan.name, ...(a.plan.days ? { intervalDays: a.plan.days, lastServiceOn: day(a.plan.lastDays) } : {}), ...(a.plan.every ? { intervalReading: a.plan.every, lastServiceReading: a.plan.last } : {}) });
  }

  for (const [title, body] of sp.notices) await A.publish(ctx, { title, body, audience: "all" });
  await AL.scanCompany(co.id);
  console.log(`${resume ? "Completada" : "Creada"}: ${sp.tradeName}`);
  return { co, posIds, depIds, ctxOf };
}
for (const sp of SPECS) await build(sp, me0, meUser);

// ── Empresas donde el operador es EMPLEADO, cada una con un perfil de permisos distinto ──
const { randomBytes } = await import("node:crypto");
type Profile = { company: Spec; ownerEmail: string; ownerName: [string, string]; myPosition: string; full?: boolean; grants: { p: string; scope?: "OWN" | "DEPARTMENTS" | "COMPANY"; depts?: string[] }[] };
const PROFILES: Profile[] = [
  {
    ownerEmail: "dueno.hotel@demo.test", ownerName: ["Rodolfo", "Paredes"], myPosition: "Gerente de Recursos Humanos",
    // RH: todo el personal, datos personales, documentos y solicitudes; SIN datos bancarios ni costos.
    grants: ["employees.read", "employees.create", "employees.edit", "employees.offboard", "employees.personal.read", "employees.personal.edit", "employees.documents.view", "employees.documents.preview", "employees.documents.download", "employees.documents.upload", "employees.notes.read", "employees.notes.edit", "joinRequests.review", "announcements.publish", "documents.view", "documents.preview", "audit.read", "ai.use"].map((p) => ({ p })),
    company: {
      legalName: "Hotel Playa Dorada de Mazatlán SA de CV", tradeName: "Hotel Playa Dorada", activity: "Hotelería", city: "Mazatlán, Sin.", modules: ["inventory", "suppliers", "purchases", "maintenance", "ai"], ownerTitle: "Director general",
      depts: [
        { name: "Dirección", positions: [{ title: "Director general", n: 1 }] },
        { name: "Recursos Humanos", positions: [{ title: "Gerente de Recursos Humanos", n: 0, boss: "Director general" }, { title: "Auxiliar de RH", n: 1, boss: "Gerente de Recursos Humanos" }] },
        { name: "Recepción", positions: [{ title: "Jefe de recepción", n: 1, boss: "Director general" }, { title: "Recepcionista", n: 5, boss: "Jefe de recepción" }] },
        { name: "Ama de llaves", positions: [{ title: "Ama de llaves", n: 1, boss: "Director general" }, { title: "Camarista", n: 9, boss: "Ama de llaves" }] },
        { name: "Alimentos y bebidas", positions: [{ title: "Gerente de A y B", n: 1, boss: "Director general" }, { title: "Cocinero", n: 4, boss: "Gerente de A y B" }, { title: "Mesero", n: 6, boss: "Gerente de A y B" }, { title: "Bartender", n: 2, boss: "Gerente de A y B" }] },
        { name: "Mantenimiento", positions: [{ title: "Jefe de mantenimiento", n: 1, boss: "Director general" }, { title: "Técnico de mantenimiento", n: 3, boss: "Jefe de mantenimiento" }] },
      ],
      cats: ["limpieza", "consumibles", "mobiliario", "maquinaria"],
      items: [
        { name: "Toallas de baño", cat: "consumibles", unit: "pieza", qty: "240", min: "150", price: "95" },
        { name: "Juego de sábanas matrimonial", cat: "consumibles", unit: "pieza", qty: "120", min: "100", price: "380" },
        { name: "Amenidades (kit)", cat: "consumibles", unit: "pieza", qty: "300", min: "400", price: "18" },
        { name: "Cloro para alberca", cat: "limpieza", unit: "kg", qty: "60", min: "40", price: "52" },
      ],
      suppliers: [{ name: "Blancos del Pacífico", categories: "blancos, toallas" }, { name: "Químicos para Albercas Mazatlán", categories: "cloro, químicos" }],
      assets: [
        { name: "Caldera de agua caliente", cat: "maquinaria", serial: "CAL-HPD-01", cost: "320000", plan: { name: "Revisión de quemador", days: "90", lastDays: -80 } },
        { name: "Bomba de alberca principal", cat: "maquinaria", serial: "BOM-ALB-02", usage: "HOURS", reading: "6100", cost: "68000", plan: { name: "Cambio de sellos", every: "2000", last: "4500", lastDays: -150 } },
      ],
      docs: [{ title: "Reglamento interior de trabajo", category: "Reglamentos" }, { title: "Licencia de uso de suelo", category: "Permisos" }],
      notices: [["Temporada alta de diciembre", "Se abren vacantes temporales de camarista y mesero."]],
    },
  },
  {
    ownerEmail: "dueno.ferreteria@demo.test", ownerName: ["Gilberto", "Montoya"], myPosition: "Jefe de almacén",
    // Almacén: inventario, compras y proveedores completos; personal solo de su departamento (sin datos personales).
    grants: [{ p: "inventory.read" }, { p: "inventory.manage" }, { p: "inventory.move" }, { p: "purchases.read" }, { p: "purchases.manage" }, { p: "purchases.receive" }, { p: "suppliers.read" }, { p: "suppliers.manage" }, { p: "maintenance.read" }, { p: "costs.read" }, { p: "documents.view" }, { p: "documents.preview" }, { p: "ai.use" }, { p: "employees.read", scope: "DEPARTMENTS", depts: ["Almacén"] }],
    company: {
      legalName: "Ferretera Culiacán del Norte SA de CV", tradeName: "Ferretera Culiacán", activity: "Venta de ferretería y materiales", city: "Culiacán, Sin.", modules: ["inventory", "suppliers", "purchases", "maintenance", "ai"], ownerTitle: "Director general",
      depts: [
        { name: "Dirección", positions: [{ title: "Director general", n: 1 }] },
        { name: "Almacén", positions: [{ title: "Jefe de almacén", n: 0, boss: "Director general" }, { title: "Almacenista", n: 4, boss: "Jefe de almacén" }, { title: "Chofer repartidor", n: 3, boss: "Jefe de almacén" }] },
        { name: "Ventas", positions: [{ title: "Gerente de ventas", n: 1, boss: "Director general" }, { title: "Vendedor de mostrador", n: 6, boss: "Gerente de ventas" }, { title: "Cajero", n: 2, boss: "Gerente de ventas" }] },
        { name: "Administración", positions: [{ title: "Contador", n: 1, boss: "Director general" }] },
      ],
      cats: ["materiales", "consumibles", "vehiculos", "herramientas"],
      items: [
        { name: "Cemento gris 50 kg", cat: "materiales", unit: "pieza", qty: "320", min: "200", price: "238" },
        { name: "Varilla 3/8\"", cat: "materiales", unit: "pieza", qty: "450", min: "300", price: "142" },
        { name: "Tubo PVC 4\" (6 m)", cat: "materiales", unit: "pieza", qty: "60", min: "80", price: "310" },
        { name: "Pintura vinílica blanca 19 L", cat: "materiales", unit: "pieza", qty: "35", min: "20", price: "1290" },
        { name: "Tornillo para tablaroca (caja)", cat: "consumibles", unit: "caja", qty: "90", min: "50", price: "98" },
        { name: "Cable THW calibre 12", cat: "materiales", unit: "rollo", qty: "14", min: "20", price: "1450" },
      ],
      suppliers: [{ name: "Cementos del Pacífico", categories: "cemento, mortero" }, { name: "Aceros de Sinaloa", categories: "varilla, alambrón" }, { name: "Plásticos y Tubería del Norte", categories: "PVC, conexiones" }, { name: "Pinturas Sinaloa", categories: "pintura" }],
      assets: [
        { name: "Camión de reparto Isuzu ELF", cat: "vehiculos", serial: "VIN-ISZ-4410", usage: "KM", reading: "96500", cost: "780000", plan: { name: "Servicio de motor", every: "10000", last: "88000", days: "120", lastDays: -110 } },
        { name: "Montacargas Toyota 2.5 t", cat: "vehiculos", serial: "MTC-TY-2501", usage: "HOURS", reading: "4120", cost: "520000", plan: { name: "Servicio de 500 horas", every: "500", last: "3700", lastDays: -60 } },
      ],
      docs: [{ title: "Licencia de funcionamiento", category: "Permisos" }, { title: "Política de devoluciones", category: "Operación" }],
      notices: [["Inventario físico anual", "El sábado 30 se cierra el almacén para conteo general."]],
    },
  },
  {
    ownerEmail: "directora.colegio@demo.test", ownerName: ["Leticia", "Ibarra"], myPosition: "Docente de primaria",
    // Empleado básico: solo su propio expediente, avisos y documentos generales.
    grants: [{ p: "employees.personal.edit", scope: "OWN" }, { p: "employees.documents.upload", scope: "OWN" }, { p: "employees.bank.edit", scope: "OWN" }, { p: "documents.view" }, { p: "documents.preview" }, { p: "ai.use" }],
    company: {
      legalName: "Colegio Bilingüe del Valle AC", tradeName: "Colegio del Valle", activity: "Educación básica privada", city: "Culiacán, Sin.", modules: ["inventory", "suppliers", "purchases", "maintenance", "ai"], ownerTitle: "Directora general",
      depts: [
        { name: "Dirección", positions: [{ title: "Directora general", n: 1 }, { title: "Coordinadora académica", n: 1, boss: "Directora general" }] },
        { name: "Primaria", positions: [{ title: "Docente de primaria", n: 7, boss: "Coordinadora académica" }] },
        { name: "Secundaria", positions: [{ title: "Docente de secundaria", n: 6, boss: "Coordinadora académica" }] },
        { name: "Servicios", positions: [{ title: "Intendente", n: 3, boss: "Directora general" }, { title: "Secretaria escolar", n: 2, boss: "Directora general" }] },
      ],
      cats: ["papeleria", "limpieza", "mobiliario"],
      items: [
        { name: "Hojas blancas (paquete 500)", cat: "papeleria", unit: "paquete", qty: "45", min: "30", price: "115" },
        { name: "Marcadores para pizarrón", cat: "papeleria", unit: "caja", qty: "6", min: "10", price: "160" },
        { name: "Gel antibacterial", cat: "limpieza", unit: "litro", qty: "20", min: "15", price: "68" },
      ],
      suppliers: [{ name: "Papelería Escolar Culiacán", categories: "papelería" }],
      assets: [
        { name: "Proyector aula 3", cat: "mobiliario", serial: "PRJ-A3-2023", cost: "14500" },
        { name: "Pupitres (lote 30)", cat: "mobiliario", serial: "PUP-L30-01", cost: "45000" },
      ],
      docs: [{ title: "Calendario escolar", category: "Académico" }, { title: "Reglamento docente", category: "Reglamentos" }],
      notices: [["Junta de consejo técnico", "El viernes no hay clases; junta de 8 a 13 h."], ["Entrega de calificaciones", "Captura las calificaciones del bimestre antes del día 25."]],
    },
  },
];
for (const pr of PROFILES) {
  const ex = await db.company.findFirst({ where: { legalName: pr.company.legalName } });
  if (ex && (await db.membership.findFirst({ where: { companyId: ex.id, userId: me0.id } }))) { console.log(`Ya existe: ${pr.company.tradeName}`); continue; }
  let o = await db.user.findUnique({ where: { email: pr.ownerEmail } });
  if (!o) {
    await auth.api.signUpEmail({ body: { email: pr.ownerEmail, password: randomBytes(12).toString("base64url") + "A1", name: pr.ownerName[0], lastName: pr.ownerName[1], phone: "6670000000", acceptTerms: true } as never });
    o = await db.user.update({ where: { email: pr.ownerEmail }, data: { emailVerified: true } });
  }
  const r = await build(pr.company, o, o);
  if (!r) continue;
  const ctx = await r.ctxOf();
  const co = await db.company.findUniqueOrThrow({ where: { id: r.co.id } });
  const req = await C.requestJoin(me0.id, "127.0.0.1", co.joinCode, "Solicitud de ingreso (dato sintético)");
  await C.approveJoinRequest(ctx, req.id, { mode: "new", positionId: r.posIds.get(pr.myPosition) });
  const m = await db.membership.findFirstOrThrow({ where: { companyId: co.id, userId: me0.id } });
  for (const g of pr.grants) await C.addGrant(ctx, { subjectType: "MEMBER", subjectId: m.id, permission: g.p, effect: "ALLOW", scope: g.scope ?? "COMPANY", scopeDepartmentIds: (g.depts ?? []).map((d) => r.depIds.get(d)) });
  await AL.scanCompany(co.id);
  console.log(`Te uní como empleado: ${pr.company.tradeName} · ${pr.myPosition}`);
}
process.exit(0);
