import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const PW = readFileSync(".local/demo-credenciales.txt", "utf8").split("\n")[1].trim();
const CID = readFileSync(".local/cid", "utf8").trim();
const B = "http://localhost:3000";
const br = await chromium.launch({ channel: "chrome", headless: true });
for (const [n, vp] of [["768", { width: 768, height: 1024 }], ["zoom200", { width: 720, height: 450 }]] as const) {
  const ctx = await br.newContext({ viewport: vp, deviceScaleFactor: n === "zoom200" ? 2 : 1 });
  const p = await ctx.newPage();
  await p.goto(`${B}/registro`);
  const ov = () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(n, "registro overflow", await ov());
  await p.screenshot({ path: `/tmp/${n}-registro.png`, fullPage: true });
  await p.goto(`${B}/entrar`);
  await p.getByLabel("Correo").fill("ceo@demo.test");
  await p.getByLabel("Contraseña", { exact: true }).fill(PW);
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.waitForURL(/empresas/);
  for (const path of ["", "personal", "documentos"]) {
    await p.goto(`${B}/e/${CID}/${path}`); await p.waitForLoadState("networkidle");
    console.log(n, path || "inicio", "overflow", await ov());
  }
  await p.goto(`${B}/e/${CID}`); await p.waitForLoadState("networkidle");
  await p.screenshot({ path: `/tmp/${n}-inicio.png` });
}
await br.close();
