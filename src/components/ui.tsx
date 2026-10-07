import Link from "next/link";

export function Pager({ page, total, pageSize, href }: { page: number; total: number; pageSize: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="muted small">{total} resultado(s)</p>;
  return (
    <nav className="pager" aria-label="Paginación">
      {page > 1 && <Link href={href(page - 1)}>← Anterior</Link>}
      <span className="muted small">
        Página {page} de {pages} · {total} resultado(s)
      </span>
      {page < pages && <Link href={href(page + 1)}>Siguiente →</Link>}
    </nav>
  );
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
}

/** Folio: código visible del registro (EMP-0001, OC-0003…). */
export function Folio({ children }: { children: React.ReactNode }) {
  return <span className="folio" translate="no">{children}</span>;
}

/** Estado vacío que explica qué falta y, si procede, cómo empezar. */
export function Empty({ children, title, action }: { children?: React.ReactNode; title?: string; action?: React.ReactNode }) {
  return (
    <div className="empty" role="status">
      {title && <strong>{title}</strong>}
      {children && <span>{children}</span>}
      {action}
    </div>
  );
}

/** Cabecera de página: volver, título con folio/estado, descripción y acciones. */
export function PageHead({ title, folio, status, description, back, actions }: { title: React.ReactNode; folio?: string; status?: React.ReactNode; description?: React.ReactNode; back?: { href: string; label: string }; actions?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div className="titles">
        {back && <Link className="crumb" href={back.href}>← {back.label}</Link>}
        <div className="row" style={{ gap: 10 }}>
          <h1>{title}</h1>
          {folio && <Folio>{folio}</Folio>}
          {status}
        </div>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Tabs({ items, current }: { items: [string, string][]; current: string }) {
  return (
    <nav className="tabs" aria-label="Secciones">
      {items.map(([href, label]) => (
        <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export const fmtDate = (d: Date | string | null | undefined, tz?: string) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: tz ?? "UTC" }).format(new Date(d)) : "—";
export const fmtDateTime = (d: Date | string | null | undefined, tz: string) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(d)) : "—";
// Fechas civiles (nacimiento, baja...) se guardan a medianoche UTC: se muestran en UTC para no cambiar de día.
export const fmtCivil = (d: Date | string | null | undefined) => fmtDate(d, "UTC");
export const fmtMoney = (v: { toString(): string } | string | null | undefined, currency = "MXN") =>
  v == null ? "—" : `${new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v.toString() as unknown as number)} ${currency}`; // cadena decimal exacta (Intl v3)
export const fmtQty = (v: { toString(): string } | string | null | undefined) => (v == null ? "—" : String(Number(v.toString())));
