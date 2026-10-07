"use server";
import * as c from "@/server/services/companies";
import { fd, getCtx, run, type ActionResult } from "@/server/web";

type A = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;
const ctx = (f: FormData) => getCtx(String(f.get("c")));
const path = (f: FormData) => `/e/${f.get("c")}/configuracion`;

export const companyAction: A = async (_, f) => run(async () => c.updateCompany(await ctx(f), fd(f), Number(f.get("version"))), "Datos de la empresa guardados.", path(f));
export const joinCodeAction: A = async (_, f) => run(async () => c.regenerateJoinCode(await ctx(f)), "Código regenerado. El anterior deja de funcionar.", path(f));
export const moduleAction: A = async (_, f) =>
  run(async () => c.setModule(await ctx(f), String(f.get("module")), f.get("enabled") === "1"), "Módulo actualizado. Los datos se conservan.", path(f));
export const settingsAction: A = async (_, f) =>
  run(
    async () =>
      c.updateSettings(await ctx(f), {
        ...fd(f),
        requiredEmployeeFields: f.getAll("requiredEmployeeFields").map(String),
        requiredDocTypes: f.getAll("requiredDocTypes").map(String),
      }),
    "Configuración guardada.",
    path(f),
  );
export const retentionAction: A = async (_, f) =>
  run(async () => c.setRetention(await ctx(f), f.get("years") ? Number(f.get("years")) : null), "Política de retención guardada.", path(f));
export const aiSettingsAction: A = async (_, f) => {
  const { setAiSettings } = await import("@/server/ai/settings");
  return run(async () => setAiSettings(await ctx(f), fd(f)), "Configuración de IA guardada.", path(f));
};
export const logoAction: A = async (_, f) => {
  const { setCompanyLogo } = await import("@/server/services/images");
  return run(async () => setCompanyLogo(await ctx(f), f.get("file") as File), "Logotipo actualizado.", path(f));
};
export const transferAction: A = async (_, f) => {
  const { startTransfer } = await import("@/server/services/accounts");
  return run(async () => startTransfer(await ctx(f), String(f.get("membershipId"))), "Propuesta enviada. Surtirá efecto cuando la otra persona la acepte.", path(f));
};
export const cancelTransferAction: A = async (_, f) => {
  const { cancelTransfer } = await import("@/server/services/accounts");
  return run(async () => cancelTransfer(await ctx(f)), "Transferencia cancelada.", path(f));
};
export const closeCompanyAction: A = async (_, f) => {
  const { closeCompany } = await import("@/server/services/accounts");
  const r = await run(async () => closeCompany(await ctx(f), { confirm: String(f.get("confirm") ?? ""), reason: String(f.get("reason") ?? "") }), "Empresa cerrada.");
  if (r.ok) {
    const { redirect } = await import("next/navigation");
    redirect("/empresas");
  }
  return r;
};
