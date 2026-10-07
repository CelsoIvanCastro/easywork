import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Flash } from "@/components/Flash";
import "./globals.css";

export const metadata: Metadata = { title: "EasyWork", description: "Administración empresarial", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f5f1" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const flash = decodeURIComponent((await cookies()).get("ew_flash")?.value ?? "");
  return (
    <html lang="es">
      <body>
        <Flash key={flash} message={flash.split("|").slice(1).join("|") || null} />
        {children}
      </body>
    </html>
  );
}
