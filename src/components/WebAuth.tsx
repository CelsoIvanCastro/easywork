"use client";
import Link from "next/link";
import { AuthShell } from "@/lib/ui/auth";

/** Marco de acceso de la web: enlaces legales con navegación de Next. */
export function WebAuth({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell
      homeHref="/"
      legal={<><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link><Link href="/cookies">Cookies</Link><Link href="/eliminar-cuenta">Eliminar cuenta</Link></>}
    >
      {children}
    </AuthShell>
  );
}
