import { nativeLogout } from "@/server/api/nativeAuth";
import { errorResponse, json, readLimited } from "@/server/api/http";

export async function POST(req: Request) {
  try {
    const raw = new TextDecoder().decode(await readLimited(req, 8 * 1024));
    void raw;
    return json(await nativeLogout(req));
  } catch (e) {
    return errorResponse(e);
  }
}
