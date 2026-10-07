export const dynamic = "force-dynamic";

// Vida del proceso: sin consultar dependencias ni exponer detalles.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
