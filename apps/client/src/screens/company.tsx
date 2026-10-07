import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import { Bell, Boxes, ChevronRight, CircleUser, FolderClosed, History, IdCard, Inbox, LayoutDashboard, Megaphone, Menu, Network, Search as SearchIcon, Settings, ShieldCheck, ShoppingCart, Sparkles, Store, Truck, UserMinus, Users, Wrench, type LucideIcon } from "lucide-react";

const I = { LayoutDashboard, IdCard, Megaphone, Bell, Sparkles, Users, UserMinus, Network, Inbox, FolderClosed, Boxes, Truck, Store, ShoppingCart, Wrench, History, ShieldCheck, Settings, ChevronRight, CircleUser, Menu, Search: SearchIcon };
import { rpc } from "../api";
import { go, href } from "../router";
import { Async, Badge, Empty, Loading, ErrorView, PageHead, useData } from "../ui";
// Cada módulo se descarga al abrirlo por primera vez: arranque más ligero en teléfonos modestos.
const people = () => import("./people"), docs = () => import("./docs"), ops = () => import("./ops"), admin = () => import("./admin");
const People = lazy(() => people().then((m) => ({ default: m.People })));
const Person = lazy(() => people().then((m) => ({ default: m.Person })));
const OrgChart = lazy(() => people().then((m) => ({ default: m.OrgChart })));
const JoinRequests = lazy(() => people().then((m) => ({ default: m.JoinRequests })));
const Documents = lazy(() => docs().then((m) => ({ default: m.Documents })));
const DocumentView = lazy(() => docs().then((m) => ({ default: m.DocumentView })));
const Inventory = lazy(() => ops().then((m) => ({ default: m.Inventory })));
const ItemView = lazy(() => ops().then((m) => ({ default: m.ItemView })));
const Assets = lazy(() => ops().then((m) => ({ default: m.Assets })));
const AssetView = lazy(() => ops().then((m) => ({ default: m.AssetView })));
const Maintenance = lazy(() => ops().then((m) => ({ default: m.Maintenance })));
const Purchases = lazy(() => ops().then((m) => ({ default: m.Purchases })));
const PurchaseView = lazy(() => ops().then((m) => ({ default: m.PurchaseView })));
const Suppliers = lazy(() => ops().then((m) => ({ default: m.Suppliers })));
const Members = lazy(() => admin().then((m) => ({ default: m.Members })));
const Modules = lazy(() => admin().then((m) => ({ default: m.Modules })));
const Audit = lazy(() => admin().then((m) => ({ default: m.Audit })));
const Announcements = lazy(() => admin().then((m) => ({ default: m.Announcements })));
const Assistant = lazy(() => admin().then((m) => ({ default: m.Assistant })));
/** Precarga en reposo los módulos frecuentes para que la primera navegación sea instantánea. */
const prefetchModules = () => { people(); docs(); };

export type CompanyCtx = {
  id: string; tradeName: string; timezone: string; isOwner: boolean; fullAccess: boolean; employeeId: string | null;
  modules: Record<string, boolean>; can: Record<string, boolean>; unread: number;
};
const Ctx = createContext<{ c: CompanyCtx; reload: () => void } | null>(null);
export const useCompany = () => useContext(Ctx)!;

type Item = { to: string; label: string; icon: keyof typeof I; count?: number };

function navFor(c: CompanyCtx): { title: string; items: Item[] }[] {
  const g: { title: string; items: Item[] }[] = [];
  const general: Item[] = [{ to: "", label: "Inicio", icon: "LayoutDashboard" }];
  if (c.employeeId) general.push({ to: `personal/${c.employeeId}`, label: "Mi expediente", icon: "IdCard" });
  if (c.modules.announcements) general.push({ to: "avisos", label: "Avisos", icon: "Megaphone" });
  general.push({ to: "alertas", label: "Notificaciones", icon: "Bell", count: c.unread });
  if (c.modules.ai && c.can["ai.use"]) general.push({ to: "ia", label: "Consultas con IA", icon: "Sparkles" });
  g.push({ title: "General", items: general });
  const people: Item[] = [];
  if (c.can["employees.read"]) people.push({ to: "personal", label: "Personal", icon: "Users" }, { to: "personal?view=former", label: "Exempleados", icon: "UserMinus" });
  if (c.can["structure.read"] || c.can["structure.manage"]) people.push({ to: "organigrama", label: "Organigrama", icon: "Network" });
  if (c.can["joinRequests.review"]) people.push({ to: "solicitudes", label: "Solicitudes de ingreso", icon: "Inbox" });
  g.push({ title: "Personas", items: people });
  const ops: Item[] = [];
  if (c.can["documents.view"]) ops.push({ to: "documentos", label: "Documentos", icon: "FolderClosed" });
  if (c.can["inventory.read"]) ops.push({ to: "inventario", label: "Inventario", icon: "Boxes" }, { to: "activos", label: "Activos", icon: "Truck" });
  if (c.can["suppliers.read"]) ops.push({ to: "proveedores", label: "Proveedores", icon: "Store" });
  if (c.can["purchases.read"]) ops.push({ to: "compras", label: "Compras", icon: "ShoppingCart" });
  if (c.can["maintenance.read"]) ops.push({ to: "mantenimiento", label: "Mantenimiento", icon: "Wrench" });
  if (ops.length) g.push({ title: "Operación", items: ops });
  const admin: Item[] = [];
  if (c.can["audit.read"]) admin.push({ to: "auditoria", label: "Auditoría", icon: "History" });
  if (c.isOwner) admin.push({ to: "miembros", label: "Miembros y permisos", icon: "ShieldCheck" }, { to: "modulos", label: "Módulos", icon: "Settings" });
  if (admin.length) g.push({ title: "Administración", items: admin });
  return g;
}

function NavLink({ base, item, current, className = "nav-item" }: { base: string; item: Item; current: string; className?: string }) {
  const Icon = I[item.icon] as LucideIcon;
  const target = item.to ? `${base}/${item.to}` : base;
  const active = item.to === "" ? current === "" : current === item.to || (current.startsWith(item.to.split("?")[0] + "/") && !item.to.includes("?"));
  return (
    <a className={className} href={href(target)} aria-current={active ? "page" : undefined}>
      <Icon className="icon" aria-hidden="true" />
      <span>{item.label}</span>
      {item.count ? <span className="count">{item.count}</span> : null}
    </a>
  );
}

export function CompanyRoutes({ companyId, path, query }: { companyId: string; path: string[]; query: URLSearchParams }) {
  const q = useData(() => rpc<CompanyCtx>("company.context", {}, companyId), [companyId]);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const current = path.join("/") + (query.toString() ? `?${query}` : "");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (moreRef.current) moreRef.current.open = false;
  }, [current]);
  if (q.error) return <main className="main"><ErrorView error={q.error} retry={q.reload} /><p><a href={href("empresas")}>Volver a mis empresas</a></p></main>;
  if (!q.data) return <main className="main"><Loading /></main>;
  const c = q.data;
  const base = `c/${companyId}`;
  const groups = navFor(c);
  const company = (
    <div className="company">
      <strong>{c.tradeName}</strong>
      <span className="small muted">{c.isOwner ? "Propietario" : c.fullAccess ? "Acceso completo" : "Miembro"}</span>
      <a className="switch" href={href("empresas")}>Cambiar de empresa</a>
    </div>
  );
  const nav = (
    <nav aria-label="Principal" style={{ display: "grid", gap: 8 }}>
      {groups.map((g) => (
        <div className="nav-group" key={g.title}>
          <h2>{g.title}</h2>
          {g.items.map((i) => <NavLink key={i.to} base={base} item={i} current={current} />)}
        </div>
      ))}
    </nav>
  );
  const primary: Item[] = [
    { to: "", label: "Inicio", icon: "LayoutDashboard" },
    c.can["employees.read"] ? { to: "personal", label: "Personal", icon: "Users" } : c.employeeId ? { to: `personal/${c.employeeId}`, label: "Mi expediente", icon: "IdCard" } : { to: "avisos", label: "Avisos", icon: "Megaphone" },
    { to: "alertas", label: "Alertas", icon: "Bell", count: c.unread },
  ];
  return (
    <Ctx.Provider value={{ c, reload: q.reload }}>
      <div className="shell">
        <aside className="side" aria-label="Navegación de la empresa">
          <div className="brand"><b>EasyWork</b></div>
          {company}
          {nav}
          <div className="side-foot"><a className="nav-item" href={href("cuenta")}><I.CircleUser className="icon" aria-hidden="true" />Mi cuenta</a></div>
        </aside>
        <div className="content">
          <header className="topbar">
            <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); go(`${base}/buscar?q=${encodeURIComponent(search)}`); }}>
              <label className="sr-only" htmlFor="q">Buscar en {c.tradeName}</label>
              <I.Search className="icon" aria-hidden="true" />
              <input id="q" type="search" placeholder="Buscar en la empresa…" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} />
            </form>
            <div className="top-actions">
              <a className="icon-btn" href={href(`${base}/alertas`)} aria-label={c.unread ? `Notificaciones: ${c.unread} sin leer` : "Notificaciones"}>
                <I.Bell className="icon" aria-hidden="true" />
                {c.unread > 0 && <span className="dot" aria-hidden="true">{c.unread}</span>}
              </a>
              <a className="icon-btn" href={href("cuenta")} aria-label="Mi cuenta"><I.CircleUser className="icon" aria-hidden="true" /></a>
            </div>
          </header>
          <main className="main" id="contenido"><Suspense fallback={<Loading />}><Screen base={base} path={path} query={query} /></Suspense></main>
          <nav className="tabbar" aria-label="Accesos rápidos">
            {primary.map((i) => <NavLink key={i.to} base={base} item={i} current={current} className="" />)}
            <details ref={moreRef}>
              <summary aria-label="Más secciones"><I.Menu className="icon" aria-hidden="true" /><span>Más</span></summary>
              <div className="more-panel">{company}{nav}</div>
            </details>
          </nav>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function Screen({ base, path, query }: { base: string; path: string[]; query: URLSearchParams }) {
  const [a, b] = path;
  useEffect(() => {
    const t = setTimeout(prefetchModules, 1500);
    return () => clearTimeout(t);
  }, []);
  switch (a) {
    case undefined: return <Home base={base} />;
    case "alertas": return <Alerts />;
    case "buscar": return <Search q={query.get("q") ?? ""} base={base} />;
    case "personal": return b ? <Person id={b} base={base} /> : <People base={base} former={query.get("view") === "former"} />;
    case "organigrama": return <OrgChart base={base} />;
    case "solicitudes": return <JoinRequests />;
    case "documentos": return b ? <DocumentView id={b} base={base} /> : <Documents base={base} />;
    case "inventario": return b ? <ItemView id={b} base={base} /> : <Inventory base={base} />;
    case "activos": return b ? <AssetView id={b} base={base} /> : <Assets base={base} />;
    case "mantenimiento": return <Maintenance base={base} />;
    case "compras": return b ? <PurchaseView id={b} base={base} /> : <Purchases base={base} />;
    case "proveedores": return <Suppliers />;
    case "avisos": return <Announcements />;
    case "auditoria": return <Audit />;
    case "miembros": return <Members />;
    case "modulos": return <Modules />;
    case "ia": return <Assistant base={base} />;
    default: return <Empty title="No disponible">Esta sección no existe o no tienes acceso.</Empty>;
  }
}

type Dash = { kpis: { label: string; value: number; href: string; tone?: string }[]; alerts: { id: string; title: string; severity: string; link: string; type: string }[] };
const SEV: Record<string, [string, "bad" | "warn" | undefined]> = { danger: ["Urgente", "bad"], warning: ["Revisar", "warn"], info: ["Aviso", undefined] };
/** Convierte un enlace de la web (/e/:id/...) en ruta del cliente. */
export const toClient = (link: string) => link.replace(/^\/e\/([^/]+)/, "c/$1");

function Home({ base }: { base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<Dash>("dashboard", {}, c.id), [c.id]);
  return (
    <>
      <PageHead title="Inicio" description={`Lo que requiere atención en ${c.tradeName}.`} />
      <Async q={q}>
        {(d) => {
          const alerts = [...d.alerts].sort((x, y) => ["danger", "warning", "info"].indexOf(x.severity) - ["danger", "warning", "info"].indexOf(y.severity));
          return (
            <div className="split">
              <section aria-labelledby="att">
                <h2 id="att" style={{ marginTop: 0 }}>Requiere atención</h2>
                {alerts.length ? (
                  <ol className="agenda">
                    {alerts.map((a) => (
                      <li key={a.id}><a href={href(toClient(a.link))}><Badge tone={SEV[a.severity]?.[1]}>{SEV[a.severity]?.[0] ?? "Aviso"}</Badge><span className="what"><span>{a.title}</span></span><I.ChevronRight className="icon go" aria-hidden="true" /></a></li>
                    ))}
                  </ol>
                ) : <Empty title="Todo al día">No hay pendientes que puedas ver.</Empty>}
              </section>
              {d.kpis.length > 0 && (
                <section aria-labelledby="sum">
                  <h2 id="sum" style={{ marginTop: 0 }}>Resumen</h2>
                  <div className="kpis">
                    {d.kpis.map((k) => (
                      <a key={k.label} className="kpi" href={href(toClient(k.href))}><strong>{k.value}</strong><span>{k.label}</span></a>
                    ))}
                  </div>
                </section>
              )}
              {!d.kpis.length && c.employeeId && <Empty title="Tu espacio"><a href={href(`${base}/personal/${c.employeeId}`)}>Ver mi expediente</a></Empty>}
            </div>
          );
        }}
      </Async>
    </>
  );
}

type Notif = { id: string; title: string; link: string | null; createdAt: string; readAt: string | null; resolved: boolean };
function Alerts() {
  const { c, reload } = useCompany();
  const q = useData(() => rpc<Notif[]>("notifications.list", {}, c.id), [c.id]);
  const act = async (id: string, op: string) => {
    await rpc("notifications.update", { id, op }, c.id);
    q.reload();
    reload();
  };
  return (
    <>
      <PageHead title="Notificaciones" actions={<button className="secondary" onClick={async () => { await rpc("notifications.readAll", {}, c.id); q.reload(); reload(); }}>Marcar todas como leídas</button>} />
      <Async q={q}>
        {(list) => list.length ? (
          <ul className="stack" style={{ listStyle: "none", padding: 0, maxWidth: "none" }}>
            {list.map((n) => (
              <li key={n.id} className="card" style={{ marginBottom: 0 }}>
                <div className="spread">
                  <span>{!n.readAt && <Badge tone="warn">Nueva</Badge>} {n.resolved && <Badge tone="ok">Resuelta</Badge>} {n.link ? <a href={href(toClient(n.link))}>{n.title}</a> : n.title}</span>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="secondary" onClick={() => act(n.id, n.readAt ? "unread" : "read")}>{n.readAt ? "No leída" : "Leída"}</button>
                  <button className="secondary" onClick={() => act(n.id, "snooze")}>Posponer 7 días</button>
                  <button className="secondary" onClick={() => act(n.id, "dismiss")}>Descartar</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="Sin notificaciones" />}
      </Async>
    </>
  );
}

type Hit = { label: string; detail?: string; href: string };
function Search({ q: text, base }: { q: string; base: string }) {
  const { c } = useCompany();
  const q = useData(() => rpc<{ sections: { title: string; hits: Hit[]; more: boolean }[]; restricted: boolean }>("search", { q: text }, c.id), [c.id, text]);
  void base;
  return (
    <>
      <PageHead title={`Búsqueda: “${text}”`} />
      <Async q={q}>
        {(r) => (
          <>
            {r.restricted && <p className="msg info">No tienes permiso para buscar por datos personales sensibles.</p>}
            {r.sections.length === 0 && <Empty title="Sin resultados que puedas ver" />}
            {r.sections.map((s) => (
              <section key={s.title}>
                <h2>{s.title}</h2>
                <ol className="agenda">{s.hits.map((h) => <li key={h.href}><a href={href(toClient(h.href))}><span /><span className="what"><span>{h.label}</span>{h.detail && <small>{h.detail}</small>}</span><I.ChevronRight className="icon go" aria-hidden="true" /></a></li>)}</ol>
              </section>
            ))}
          </>
        )}
      </Async>
    </>
  );
}
