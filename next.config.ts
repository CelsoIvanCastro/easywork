import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// La CSP de las páginas la fija src/proxy.ts con nonce por petición (una sola cabecera CSP por respuesta).
const headers = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // HSTS solo en producción servida por HTTPS (APP_URL https obligatorio en producción).
  // HSTS solo en producción HTTPS; includeSubDomains únicamente si se declaró que todos los subdominios usan HTTPS.
  ...(isProd ? [{ key: "Strict-Transport-Security", value: `max-age=31536000${process.env.HSTS_INCLUDE_SUBDOMAINS === "true" ? "; includeSubDomains" : ""}` }] : []),
];

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [
      // La vista previa de archivos se incrusta en la propia app (mismo origen); el resto no admite marcos.
      { source: "/((?!api/archivos/).*)", headers },
      { source: "/api/archivos/:path*", headers: [...headers.filter((h) => !["X-Frame-Options", "Content-Security-Policy"].includes(h.key)), { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default config;
