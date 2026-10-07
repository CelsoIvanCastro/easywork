import { z } from "zod";
import { OPS } from "@/server/api/ops";
import { companyCtx, errorResponse, json, readLimited, userFrom } from "@/server/api/http";
import { AppError } from "@/server/errors";

const envelope = z.object({ op: z.string().max(60), companyId: z.string().max(80).optional(), input: z.unknown().optional() });

// API v1: POST { op, companyId?, input } → { data } | { error }. Límite de 256 KB por petición.
export async function POST(req: Request) {
  try {
    const body = envelope.parse(JSON.parse(new TextDecoder().decode(await readLimited(req, 256 * 1024)) || "{}"));
    const op = OPS[body.op];
    if (!op) throw new AppError("NOT_FOUND", "Operación desconocida.");
    const user = await userFrom(req);
    const input = op.input.parse(body.input ?? {});
    if (op.scope === "user") return json(await op.run(user, input as never));
    if (!body.companyId) throw new AppError("VALIDATION", "Falta la empresa.");
    const ctx = await companyCtx(user, body.companyId);
    return json((await op.run(ctx, input as never, user)) ?? { ok: true });
  } catch (e) {
    if (e instanceof SyntaxError) return errorResponse(new AppError("VALIDATION", "JSON inválido."));
    return errorResponse(e);
  }
}
