import { auth } from "@/server/auth";
import { loadCtx } from "@/server/context";
import { readVersion } from "@/server/services/documents";
import { AppError } from "@/server/errors";

// Entrega autorizada por backend: cada solicitud revalida sesión, membresía y permisos actuales.
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string; versionId: string }> }) {
  const { companyId, versionId } = await params;
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s || !s.user.emailVerified) return new Response("No autenticado", { status: 401 });
  const mode = new URL(req.url).searchParams.get("modo") === "descargar" ? "download" : "preview";
  try {
    const ctx = await loadCtx(s.user.id, companyId);
    const f = await readVersion(ctx, versionId, mode);
    return new Response(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `${mode === "download" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (e) {
    const code = e instanceof AppError ? e.code : "UNAVAILABLE";
    const msg = e instanceof AppError && code === "VALIDATION" ? e.message : "No puedes ver este documento o no existe.";
    return new Response(msg, { status: code === "VALIDATION" ? 409 : 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
}
