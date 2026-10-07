import { chromium } from "playwright-core";
const br = await chromium.launch({ channel: "chrome", headless: true });
for (const [n, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]] as const) {
  const p = await (await br.newContext({ viewport: vp })).newPage();
  await p.goto("http://localhost:5173/#/");
  await p.getByRole("button", { name: "Crear cuenta" }).waitFor();
  await p.screenshot({ path: `.impeccable/review/despues/app-entrar-${n}.png`, fullPage: true });
  await p.getByRole("button", { name: "Crear cuenta" }).click();
  await p.screenshot({ path: `.impeccable/review/despues/app-registro-${n}.png`, fullPage: true });
}
await br.close();
