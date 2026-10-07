// Pruebas de navegador de flujos críticos contra la app en ejecución (npm run dev + npm run worker).
// Usa Chrome instalado (playwright-core, sin descargar navegadores). Crea sus propios usuarios y empresa
// con datos sintéticos únicos; no toca los datos de demostración.
import { chromium, type Page, type BrowserContext } from "playwright-core";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";

const BASE = process.env.E2E_URL ?? "http://localhost:3000";
const MAILBOX = ".local/mailbox";
const run = Date.now().toString(36);
const PASSWORD = `E2e-${run}-Segura!`;
let step = 0;
let current: Page | null = null;
const log = (m: string) => console.log(`✓ ${++step}. ${m}`);
const fail = (m: string): never => {
  throw new Error(m);
};

async function linkFor(email: string, subject: RegExp) {
  for (let i = 0; i < 30; i++) {
    for (const f of readdirSync(MAILBOX).sort().reverse()) {
      const m = JSON.parse(readFileSync(`${MAILBOX}/${f}`, "utf8"));
      if (m.to === email && subject.test(m.subject)) return m.text.match(/https?:\/\/\S+/)![0];
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return fail(`No llegó el correo para ${email}`);
}

async function expectText(page: Page, text: string | RegExp, timeout = 15000) {
  await page.getByText(text).first().waitFor({ timeout });
}

async function register(page: Page, email: string, name: string) {
  await page.goto(`${BASE}/registro`);
  await page.getByLabel("Nombre(s)").fill(name);
  await page.getByLabel("Apellidos").fill("E2E");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Teléfono (opcional)").fill("5551112233");
  await page.getByLabel("Contraseña (mínimo 10 caracteres)").fill(PASSWORD);
  await page.getByLabel("Repite la contraseña").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /Acepto los/ }).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expectText(page, /Te enviamos un enlace/);
  await page.goto(await linkFor(email, /Confirma tu correo/));
  await page.waitForURL(/\/empresas/);
}

async function submitIn(page: Page, section: string | RegExp, button: string) {
  await page.locator("section, details, form").filter({ hasText: section }).getByRole("button", { name: button }).first().click();
}

async function main() {
  mkdirSync(".local/e2e", { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors: string[] = [];
  const watch = (ctx: BrowserContext) =>
    ctx.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  try {
    // ───── CEO (escritorio) ─────
    const ceoCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    watch(ceoCtx);
    const page = await ceoCtx.newPage();
    current = page;
    page.on("dialog", (d) => d.accept());
    const ceoEmail = `ceo-${run}@example.test`;
    await register(page, ceoEmail, "Cecilia");
    log("Registro y verificación de correo");

    await page.getByLabel("Nombre comercial").fill(`E2E ${run}`);
    await page.getByLabel("Nombre legal / razón social").fill(`E2E ${run} SA de CV`);
    await page.getByRole("button", { name: "Crear empresa" }).click();
    await page.waitForURL(/\/e\/[^/]+$/);
    const companyUrl = page.url();
    log("Crear empresa (propietaria)");

    // 2FA con TOTP real.
    await page.goto(`${BASE}/cuenta`);
    const twofa = page.locator("section").filter({ hasText: "Verificación en dos pasos" });
    await twofa.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await twofa.getByRole("button", { name: "Activar" }).click();
    const uri = await twofa.locator("code").first().innerText();
    const secret = new TextDecoder().decode(base32.decode(new URL(uri).searchParams.get("secret")!));
    const totp = () => createOTP(secret).totp();
    await twofa.getByLabel("Código de 6 dígitos").fill(await totp());
    await twofa.getByRole("button", { name: "Confirmar código" }).click();
    await expectText(page, "Verificación en dos pasos activada.");
    log("Activar verificación en dos pasos (TOTP)");

    // Módulos.
    await page.goto(`${companyUrl}/configuracion`);
    for (const m of ["Inventario y activos", "Proveedores", "Compras", "Mantenimiento"]) {
      await page.locator("li").filter({ hasText: m }).first().getByRole("button", { name: "Activar" }).click();
      await page.locator("li").filter({ hasText: m }).first().getByText("Activo", { exact: true }).waitFor();
    }
    const joinCode = (await page.locator("section").filter({ hasText: "Código para unirse" }).locator("code").innerText()).trim();
    log("Activar módulos y leer código de ingreso");

    // Estructura.
    await page.goto(`${companyUrl}/estructura`);
    const newDept = page.locator("form").filter({ has: page.getByRole("button", { name: "Crear" }) }).first();
    await newDept.getByLabel("Nombre").fill("Sistemas");
    await newDept.getByRole("button", { name: "Crear" }).click();
    await page.getByRole("cell", { name: "Sistemas" }).waitFor();
    const newPos = page.locator("section").filter({ hasText: "Nuevo puesto" }).locator("form");
    await newPos.getByLabel("Título").fill("Desarrollador");
    await newPos.getByRole("button", { name: "Crear" }).click();
    await page.getByRole("cell", { name: "Desarrollador" }).waitFor();
    log("Crear departamento y puesto");

    // Alta de expediente.
    await page.goto(`${companyUrl}/personal/nuevo`);
    await page.getByLabel("Nombre(s)").fill("Ana");
    await page.getByLabel("Apellidos").fill("Prueba");
    await page.getByLabel("Departamento").selectOption({ label: "Sistemas" });
    await page.getByRole("button", { name: "Guardar expediente" }).click();
    await page.waitForURL(/\/personal\/[^/]+$/);
    await page.getByLabel("Completitud del expediente").waitFor();
    const empUrl = page.url();
    log("Alta de expediente incompleto (borrador)");

    // Documento y nueva versión.
    await page.goto(`${empUrl}?tab=documentos`);
    await page.getByLabel("Tipo de documento").selectOption("INE_FRONT");
    await page.getByLabel("Título").fill("INE frente");
    await page.getByLabel("Archivo").setInputFiles({ name: "ine.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e v1\n%%EOF") });
    await page.getByRole("button", { name: "Subir" }).click();
    await page.getByRole("link", { name: "INE frente" }).click();
    await page.waitForURL(/\/documentos\/[^/]+$/);
    await page.getByLabel("Archivo").setInputFiles({ name: "ine.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e v2\n%%EOF") });
    await page.getByRole("button", { name: "Subir nueva versión" }).click();
    await expectText(page, "v2 (vigente)");
    const bad = await page.request.get(`${BASE}/api/archivos/${companyUrl.split("/").pop()}/00000000-0000-0000-0000-000000000000`);
    if (bad.status() !== 404) fail("Acceso directo a archivo inexistente no devolvió 404");
    log("Subir documento, reemplazar versión y rechazar acceso directo inválido");

    // Baja y recontratación.
    await page.goto(`${empUrl}?tab=estado`);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await page.getByLabel("Fecha de baja").fill(today);
    await page.getByLabel(/^Motivo/).selectOption("RESIGNATION");
    await page.getByRole("button", { name: "Dar de baja" }).click();
    await expectText(page, "Exempleado: sin acceso a esta empresa");
    await page.getByLabel("Fecha de reingreso").fill(tomorrow);
    await page.getByRole("button", { name: "Recontratar" }).click();
    await page.getByRole("button", { name: "Dar de baja" }).waitFor();
    await page.goto(`${empUrl}?tab=historial`);
    await expectText(page, "Vigente");
    log("Baja con conservación del expediente y recontratación como nuevo periodo");

    // Inventario, proveedor, compra y recepción.
    await page.goto(`${companyUrl}/inventario`);
    await page.getByRole("button", { name: "+ Consumibles" }).click();
    await page.getByRole("button", { name: "+ Maquinaria" }).click();
    await page.locator("li").filter({ hasText: "Maquinaria" }).first().waitFor();
    await page.reload();
    const itemForm = page.locator("section").filter({ hasText: "Nuevo artículo" });
    await itemForm.getByLabel("Nombre").fill("Cemento");
    await itemForm.getByLabel("Unidad").selectOption("kg");
    await itemForm.getByLabel("Saldo inicial").fill("5");
    await itemForm.getByRole("button", { name: "Crear artículo" }).click();
    await page.waitForURL(/\/inventario\/[^/]+$/);
    const itemUrl = page.url();
    await page.goto(`${companyUrl}/proveedores`);
    await page.getByLabel("Nombre", { exact: true }).fill("Cementera E2E");
    await page.getByRole("button", { name: "Crear proveedor" }).click();
    await page.waitForURL(/\/proveedores\/[^/]+$/);
    await page.goto(`${companyUrl}/compras/nueva`);
    await page.getByLabel("Fecha").fill(today);
    await page.getByLabel(/^Artículo/).selectOption({ index: 1 });
    await page.getByLabel("Cantidad").fill("100");
    await page.getByLabel("Precio unitario").fill("3.335");
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.waitForURL(/\/compras\/[^/]+$/);
    await expectText(page, "333.50 MXN");
    await page.getByRole("button", { name: "Confirmar compra" }).click();
    await page.getByRole("button", { name: "Registrar recepción" }).waitFor();
    await page.getByLabel(/^L1 Cemento/).fill("40");
    await page.getByRole("button", { name: "Registrar recepción" }).click();
    await expectText(page, "Recibida parcialmente");
    await page.goto(itemUrl);
    await expectText(page, "45 kg");
    log("Compra con total calculado en servidor y recepción parcial que suma solo lo recibido");

    // Activo y mantenimiento.
    await page.goto(`${companyUrl}/activos/nuevo`);
    await page.getByLabel("Nombre").fill("Revolvedora");
    await page.getByLabel("Tipo de uso").selectOption("HOURS");
    await page.getByLabel("Lectura inicial (si aplica)").fill("100");
    await page.getByRole("button", { name: "Crear activo" }).click();
    await page.waitForURL(/\/activos\/[^/]+$/);
    const plan = page.locator("div").filter({ has: page.getByRole("heading", { name: "Nuevo plan preventivo" }) }).last();
    await plan.getByLabel("Nombre").fill("Engrase");
    await plan.getByLabel("Cada cuántos h").fill("50");
    await plan.getByLabel("Último servicio (lectura, opcional)").fill("40");
    await plan.getByRole("button", { name: "Crear plan" }).click();
    await expectText(page, /Engrase.*siguiente/);
    const rec = page.locator("div").filter({ has: page.getByRole("heading", { name: "Programar o registrar mantenimiento" }) }).last();
    await rec.getByLabel("Plan (si es preventivo)").selectOption({ label: "Engrase" });
    await rec.getByLabel("Trabajo a realizar").fill("Engrase general");
    await rec.getByRole("button", { name: "Guardar" }).click();
    await page.getByRole("link", { name: /^MT-/ }).first().click();
    await page.waitForURL(/\/mantenimiento\/[^/]+$/);
    await page.getByLabel("Fecha de realización").fill(today);
    await page.getByLabel("Lectura al servicio").fill("105");
    await page.getByRole("button", { name: "Completar" }).click();
    await expectText(page, "Completado");
    log("Plan preventivo por horas y cierre de mantenimiento");

    // ───── Empleado (teléfono) ─────
    const empCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    watch(empCtx);
    const ep = await empCtx.newPage();
    current = ep;
    const empEmail = `emp-${run}@example.test`;
    await register(ep, empEmail, "Emilio");
    await ep.getByLabel("Código de la empresa").fill(joinCode);
    await ep.getByRole("button", { name: "Buscar" }).click();
    await ep.getByLabel("Confirma el código").fill(joinCode);
    await ep.getByRole("button", { name: /Solicitar unirme/ }).click();
    await expectText(ep, "Solicitud enviada");
    log("Empleado (móvil): registro y solicitud con código");

    await page.goto(`${companyUrl}/solicitudes`);
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expectText(page, "Solicitud aprobada");
    log("CEO aprueba la solicitud");

    await ep.goto(companyUrl);
    await ep.getByRole("heading", { name: /^Hola/ }).waitFor();
    await ep.getByRole("navigation", { name: "Accesos rápidos" }).getByText("Más").click();
    const menu = await ep.locator(".tabbar .more-panel").innerText();
    if (/Personal\n|Auditoría|Miembros y permisos/.test(menu)) fail(`El empleado ve módulos sin permiso: ${menu}`);
    await ep.goto(`${companyUrl}/personal`);
    await expectText(ep, "No disponible");
    await ep.goto(`${companyUrl}/auditoria`);
    await expectText(ep, "No disponible");
    await ep.goto(companyUrl);
    await ep.getByRole("navigation", { name: "Accesos rápidos" }).getByRole("link", { name: "Mi expediente" }).click();
    await expectText(ep, "Datos personales");
    const overflow = await ep.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 2) fail(`Desbordamiento horizontal en móvil: ${overflow}px`);
    await ep.screenshot({ path: ".local/e2e/empleado-movil.png" });
    log("Empleado ve solo su expediente y funciones concedidas; sin desbordamiento en 390px");
    current = page;

    // Reautenticación + 2FA al conceder un permiso.
    await page.goto(`${companyUrl}/permisos`);
    await page.getByLabel("Destinatario").selectOption({ label: "Persona: Emilio E2E" });
    await page.getByLabel("Permiso").selectOption("employees.read");
    await page.getByRole("button", { name: "Guardar concesión" }).click();
    await expectText(page, "Confirma tu contraseña");
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByLabel(/Código de verificación/).fill(await totp());
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expectText(page, "Identidad confirmada");
    await page.getByRole("button", { name: "Guardar concesión" }).click();
    await expectText(page, "Concesión guardada");
    await ep.goto(`${companyUrl}/personal`);
    await expectText(ep, "Personal activo");
    log("Conceder permiso exige reautenticación con 2FA y surte efecto en la siguiente solicitud");

    // Cierre de sesión y recuperación (no revela si existe la cuenta).
    await page.goto(`${BASE}/recuperar`);
    await page.getByLabel("Correo").fill(`noexiste-${run}@example.test`);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expectText(page, "Si existe una cuenta");
    log("Recuperación con respuesta neutra");

    if (errors.length) fail(`Errores de JavaScript en página: ${errors.join(" | ")}`);
    writeFileSync(".local/e2e/resultado.txt", `OK ${new Date().toISOString()} · ${step} pasos\n`);
    console.log(`\nE2E OK: ${step} pasos.`);
  } catch (e) {
    if (current) {
      await current.screenshot({ path: ".local/e2e/fallo.png" }).catch(() => {});
      console.error("URL:", current.url(), "\nTexto:", (await current.locator("main").innerText().catch(() => "")).slice(0, 1500));
    }
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch(async (e) => {
  console.error(`✗ Falló en el paso ${step + 1}: ${e.message}`);
  process.exit(1);
});
