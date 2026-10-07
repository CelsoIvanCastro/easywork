// Simula un Android básico: CPU 6x más lenta, pantalla 360x740. Mide carga y fluidez al desplazar.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const PW = readFileSync(".local/demo-credenciales.txt", "utf8").split("\n")[1].trim();
const CID = readFileSync(".local/cid", "utf8").trim();
const br = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await br.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
p.on("pageerror", (e) => console.log("ERROR:", e.message));
await p.goto("http://localhost:5173/#/");
await p.getByLabel("Correo").fill("ceo@demo.test");
await p.getByLabel("Contraseña", { exact: true }).fill(PW);
await p.getByRole("button", { name: "Entrar" }).click();
await p.getByRole("heading", { name: "Mis empresas" }).waitFor();
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
for (const [name, path, h] of [["inicio", `c/${CID}`, /./], ["personal", `c/${CID}/personal`, /Personal/], ["inventario", `c/${CID}/inventario`, /Inventario/]] as const) {
  const t0 = Date.now();
  await p.evaluate((u) => (location.hash = "#/" + u), path);
  await p.getByRole("heading", { level: 1, name: h }).first().waitFor();
  const ms = Date.now() - t0;
  console.log("h1:", await p.locator("h1").first().innerText());
  // fluidez: cuadros durante 1.5 s de desplazamiento
  const fr: { fps: number; long: number } = await p.evaluate(`new Promise((res) => {
    let n = 0, long = 0, last = performance.now(); const end = last + 1500;
    const step = (t) => { n++; if (t - last > 50) long++; last = t; scrollBy(0, 12); t < end ? requestAnimationFrame(step) : res({ fps: Math.round(n / 1.5), long }); };
    requestAnimationFrame(step);
  })`);
  console.log(`${name}: listo en ${ms} ms · ${fr.fps} fps al desplazar · ${fr.long} cuadros lentos (>50 ms)`);
}
await br.close();
