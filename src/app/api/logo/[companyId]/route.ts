import { fileTypeFromBuffer } from "file-type";
import { auth } from "@/server/auth";
import { readCompanyLogo } from "@/server/services/images";

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const s = await auth.api.getSession({ headers: req.headers });
  const data = s ? await readCompanyLogo(s.user.id, (await params).companyId) : null;
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": (await fileTypeFromBuffer(data))?.mime ?? "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
