import Link from "next/link";
import { requireUser } from "@/server/web";
import { listMyCompanies } from "@/server/services/companies";
import { ActionForm, Field } from "@/components/ActionForm";
import { Badge, Empty, fmtDate } from "@/components/ui";
import { Brand } from "@/lib/ui/auth";
import { ChevronDown, ChevronRight } from "lucide-react";
import { acceptTransferAction, cancelRequestAction, createCompanyAction } from "./actions";
import { pendingTransfersFor } from "@/server/services/accounts";
import { JoinForm } from "./join";

const STATUS = { PENDING: ["Pendiente", "warn"], APPROVED: ["Aprobada", "ok"], REJECTED: ["Rechazada", "bad"], CANCELLED: ["Cancelada", undefined] } as const;

export default async function Empresas() {
  const s = await requireUser();
  const [{ companies, requests }, transfers] = await Promise.all([listMyCompanies(s.user.id), pendingTransfersFor(s.user.id)]);
  return (
    <main className="standalone">
      <div className="standalone-top"><Brand href="/empresas" /><Link href="/cuenta">Mi cuenta</Link></div>
      <header className="page-head"><div className="titles"><h1>Mis empresas</h1><p>Elige una empresa para trabajar.</p></div></header>
      {companies.length > 0 ? (
        <ol className="agenda" aria-label="Empresas">
          {companies.map((c) => (
            <li key={c.id}><Link href={`/e/${c.id}`}><Badge tone={c.isOwner ? "ok" : undefined}>{c.isOwner ? "Propietario" : "Miembro"}</Badge><span className="what"><span>{c.tradeName}</span></span><ChevronRight className="icon go" aria-hidden="true" /></Link></li>
          ))}
        </ol>
      ) : (
        <Empty title="Aún no perteneces a ninguna empresa">Crea una o solicita unirte con el código que te comparta la empresa.</Empty>
      )}
      {transfers.map((t) => (
        <section key={t.id} className="card" aria-label="Transferencia de propiedad" style={{ marginTop: 16 }}>
          <h2>Te ofrecen la propiedad de {t.company}</h2>
          <p className="small">Al aceptar serás el propietario: podrás administrar permisos, módulos y la empresa completa, y responderás por sus datos. La persona propietaria actual seguirá como miembro. La oferta vence el {fmtDate(t.expiresAt)}.</p>
          <ActionForm action={acceptTransferAction} submit="Aceptar la propiedad" confirm="¿Aceptas ser el nuevo propietario de la empresa?">
            <input type="hidden" name="id" value={t.id} />
          </ActionForm>
        </section>
      ))}
      {requests.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Mis solicitudes</h2>
          <ul className="stack" style={{ listStyle: "none", padding: 0, gap: 8 }}>
            {requests.map((r) => (
              <li key={r.id} className="row">
                {r.company} <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge> <span className="small muted">{fmtDate(r.createdAt)}</span>
                {r.note && <span className="small"> — {r.note}</span>}
                {r.status === "PENDING" && (
                  <ActionForm action={cancelRequestAction} submit="Cancelar" className="">
                    <input type="hidden" name="id" value={r.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="choices">
        <details className="choice" open={companies.length === 0}>
          <summary><span>Unirme con un código<small>La empresa decide si aprueba tu solicitud.</small></span><ChevronDown className="icon" aria-hidden="true" /></summary>
          <div className="body"><JoinForm /></div>
        </details>
        <details className="choice" open={companies.length === 0}>
          <summary><span>Crear empresa<small>Solo lo mínimo; el resto lo completas después.</small></span><ChevronDown className="icon" aria-hidden="true" /></summary>
          <div className="body">
            <ActionForm action={createCompanyAction} submit="Crear empresa">
              <Field label="Nombre comercial" name="tradeName" required maxLength={120} />
              <Field label="Nombre legal / razón social" name="legalName" required maxLength={200} />
              <Field label="Giro o actividad (opcional)" name="activity" maxLength={120} />
            </ActionForm>
          </div>
        </details>
      </div>
    </main>
  );
}
