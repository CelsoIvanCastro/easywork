// Activa la IA en todas las empresas de desarrollo con límites de consumo (punto 30). Requiere AI_API_KEY en .env.
export {};
try { process.loadEnvFile(".env"); } catch {}
if (process.env.NODE_ENV === "production") { console.error("Solo desarrollo."); process.exit(1); }
const { db } = await import("../src/server/db");
const { loadCtx } = await import("../src/server/context");
const { setModule } = await import("../src/server/services/companies");
const { setAiSettings } = await import("../src/server/ai/settings");
const { providerInfo } = await import("../src/server/ai/provider");
if (!providerInfo().configured) { console.error("Falta AI_API_KEY en .env."); process.exit(1); }
for (const c of await db.company.findMany({ select: { id: true, tradeName: true, ownerId: true } })) {
  if (!c.ownerId) continue;
  const ctx = await loadCtx(c.ownerId, c.id, { id: "enable-ai", reauthAt: new Date(), twoFactorEnabled: true });
  await setModule(ctx, "ai", true);
  await setAiSettings(await loadCtx(c.ownerId, c.id, { id: "enable-ai", reauthAt: new Date(), twoFactorEnabled: true }), { enabled: "1", acknowledge: "on", monthly: "300", daily: "30", tokens: "3000000" });
  console.log(`IA activada: ${c.tradeName}`);
}
process.exit(0);
