"use server";
import { headers } from "next/headers";
import { reauthenticate } from "@/server/reauth";
import { run, type ActionResult } from "@/server/web";

/** Reautenticación para acciones de alto riesgo: contraseña + TOTP si está activo. Vigencia 10 minutos. */
export async function reauthAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  return run(async () => reauthenticate(await headers(), String(f.get("password") ?? ""), String(f.get("code") ?? "")), "Identidad confirmada.");
}
