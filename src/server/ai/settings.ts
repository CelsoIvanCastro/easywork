import "server-only";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { type Ctx, requireOwner, requireRecentReauth } from "../context";
import { invalid } from "../errors";
import { providerInfo } from "./provider";

/** Activar la IA es una decisión consciente del propietario: reconoce qué datos pueden salir hacia el proveedor. */
export async function setAiSettings(ctx: Ctx, raw: Record<string, unknown>) {
  requireOwner(ctx);
  requireRecentReauth(ctx);
  const s = z
    .object({
      enabled: z.enum(["0", "1"]).transform((v) => v === "1"),
      acknowledge: z.string().optional().transform((v) => v === "on"),
      monthly: z.coerce.number().int().min(1).max(100000),
      daily: z.coerce.number().int().min(1).max(10000),
      tokens: z.coerce.number().int().min(1000).max(1_000_000_000),
    })
    .parse(raw);
  if (s.enabled && !s.acknowledge) throw invalid("Debes confirmar que entiendes qué datos se envían al proveedor.", { acknowledge: "Requerido" });
  if (s.enabled && !providerInfo().configured) throw invalid("El servidor no tiene un proveedor de IA configurado (AI_PROVIDER).");
  await db.$transaction(async (tx) => {
    await tx.companySettings.update({
      where: { companyId: ctx.companyId },
      data: {
        aiEnabled: s.enabled,
        aiMonthlyRequestLimit: s.monthly,
        aiDailyUserLimit: s.daily,
        aiMonthlyTokenLimit: s.tokens,
        ...(s.enabled ? { aiAcknowledgedAt: new Date(), aiAcknowledgedById: ctx.userId } : {}),
      },
    });
    await audit(tx, ctx, { action: s.enabled ? "ai.enable" : "ai.disable", module: "ai", entityType: "company", entityId: ctx.companyId, changes: { monthly: s.monthly, daily: s.daily, tokens: s.tokens } });
  });
}
