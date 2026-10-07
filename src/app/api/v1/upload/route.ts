import * as docs from "@/server/services/documents";
import { companyCtx, errorResponse, json, readLimited, userFrom } from "@/server/api/http";
import { AppError } from "@/server/errors";
import { MAX_FILE_BYTES } from "@/server/files";

// Carga de documentos para las apps: multipart con límite real de 10 MB + margen de campos.
export async function POST(req: Request) {
  try {
    const user = await userFrom(req);
    const bytes = await readLimited(req, MAX_FILE_BYTES + 64 * 1024);
    const form = await new Response(new Uint8Array(bytes), { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
    const companyId = String(form.get("companyId") ?? "");
    if (!companyId) throw new AppError("VALIDATION", "Falta la empresa.");
    const ctx = await companyCtx(user, companyId);
    const file = form.get("file") as File | null;
    const fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
    if (fields.documentId) return json({ version: await docs.addVersion(ctx, fields.documentId, file) });
    const d = await docs.uploadDocument(ctx, fields, file);
    return json({ id: d.id });
  } catch (e) {
    return errorResponse(e);
  }
}
