import Link from "next/link";
import { OPERATOR } from "@/lib/operator";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="doc">
      <div className="brand"><b>EasyWork</b></div>
      <h1>{title}</h1>
      <p className="muted">Versión {OPERATOR.legalVersion}. Responsable: {OPERATOR.name} ({OPERATOR.kind}, {OPERATOR.location}). Contacto: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.</p>
      {OPERATOR.legalDraft && (
        <p className="msg warn" role="note">Borrador pendiente de revisión legal. Describe el funcionamiento real del servicio, pero aún no ha sido validado por un profesional en derecho.</p>
      )}
      {children}
      <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "32px 0 16px" }} />
      <nav className="row small" aria-label="Documentos legales">
        <Link href="/privacidad">Privacidad</Link> · <Link href="/terminos">Términos</Link> · <Link href="/cookies">Cookies y almacenamiento</Link> · <Link href="/eliminar-cuenta">Eliminar cuenta</Link> · <Link href="/entrar">Entrar</Link>
      </nav>
    </main>
  );
}
