import { nativeForgot } from "@/server/api/nativeAuth";
import { errorResponse, json, readLimited } from "@/server/api/http";

export async function POST(req: Request) {
  try {
    const raw = new TextDecoder().decode(await readLimited(req, 8 * 1024));
    return json(await nativeForgot(req, raw ? JSON.parse(raw) : {}));
  } catch (e) {
    return errorResponse(e);
  }
}
