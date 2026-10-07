import { NextResponse, type NextRequest } from "next/server";

// CORS solo para los orígenes de las apps empaquetadas (sin cookies: usan Authorization: Bearer).
// La web usa el mismo origen y no necesita CORS. Nunca se refleja un origen arbitrario.
const ALLOWED = new Set(
  (process.env.CLIENT_ORIGINS ?? "capacitor://localhost,https://localhost,tauri://localhost,http://tauri.localhost" + (process.env.NODE_ENV !== "production" ? ",http://localhost:5173" : ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** CSP con nonce por petición para páginas: sin 'unsafe-inline' en scripts (guía local de Next 16). */
function pageWithCsp(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // atributos style de React; no ejecutan código
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) return pageWithCsp(req);
  const origin = req.headers.get("origin");
  const allowed = origin && ALLOWED.has(origin);
  if (req.method === "OPTIONS") {
    if (!allowed) return new NextResponse(null, { status: 403 });
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }
  const res = NextResponse.next();
  if (allowed) for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  return res;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Expose-Headers": "set-auth-token, content-disposition",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export const config = {
  matcher: [
    "/api/v1/:path*", "/api/auth/:path*", "/api/archivos/:path*", "/api/foto/:path*", "/api/logo/:path*",
    { source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
};
