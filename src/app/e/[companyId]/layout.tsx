import { Brand } from "@/lib/ui/auth";
import Link from "next/link";
import { Suspense } from "react";
import { Bell, CircleUser, Search } from "lucide-react";
import { getCtx } from "@/server/web";
import { can, moduleOn, type Ctx } from "@/server/context";
import { unreadCount } from "@/server/services/notifications";
import { db } from "@/server/db";
import { SideNav, TabBar, type NavGroup, type NavItem } from "@/components/Nav";

function navFor(ctx: Ctx, unread: number): NavGroup[] {
  const b = `/e/${ctx.companyId}`;
  const groups: NavGroup[] = [];
  const general: NavItem[] = [{ href: b, label: "Inicio", icon: "home" }];
  if (ctx.employee) general.push({ href: `${b}/personal/${ctx.employee.id}`, label: "Mi expediente", icon: "me" });
  if (moduleOn(ctx, "announcements")) general.push({ href: `${b}/avisos`, label: "Avisos", icon: "megaphone" });
  general.push({ href: `${b}/notificaciones`, label: "Notificaciones", icon: "bell", count: unread });
  if (moduleOn(ctx, "ai") && can(ctx, "ai.use")) general.push({ href: `${b}/ia`, label: "Consultas con IA", icon: "sparkles" });
  groups.push({ title: "General", items: general });
  const people: NavItem[] = [];
  if (can(ctx, "employees.read")) people.push({ href: `${b}/personal`, label: "Personal", icon: "users" }, { href: `${b}/personal?view=former`, label: "Exempleados", icon: "userx" });
  if (can(ctx, "structure.read") || can(ctx, "structure.manage")) people.push({ href: `${b}/organigrama`, label: "Organigrama", icon: "tree" });
  if (can(ctx, "structure.manage")) people.push({ href: `${b}/estructura`, label: "Departamentos y puestos", icon: "building" });
  if (can(ctx, "joinRequests.review")) people.push({ href: `${b}/solicitudes`, label: "Solicitudes de ingreso", icon: "inbox" });
  groups.push({ title: "Personas", items: people });
  const ops: NavItem[] = [];
  if (can(ctx, "documents.view")) ops.push({ href: `${b}/documentos`, label: "Documentos", icon: "folder" });
  if (can(ctx, "inventory.read")) ops.push({ href: `${b}/inventario`, label: "Inventario", icon: "boxes" }, { href: `${b}/activos`, label: "Activos", icon: "truck" });
  if (can(ctx, "suppliers.read")) ops.push({ href: `${b}/proveedores`, label: "Proveedores", icon: "store" });
  if (can(ctx, "purchases.read")) ops.push({ href: `${b}/compras`, label: "Compras", icon: "cart" });
  if (can(ctx, "maintenance.read")) ops.push({ href: `${b}/mantenimiento`, label: "Mantenimiento", icon: "wrench" });
  if (ops.length) groups.push({ title: "Operación", items: ops });
  const admin: NavItem[] = [];
  if (can(ctx, "audit.read")) admin.push({ href: `${b}/auditoria`, label: "Auditoría", icon: "history" });
  if (ctx.isOwner || can(ctx, "settings.manage") || can(ctx, "alerts.manage")) admin.push({ href: `${b}/configuracion`, label: "Configuración", icon: "settings" });
  if (ctx.isOwner) admin.push({ href: `${b}/permisos`, label: "Miembros y permisos", icon: "shield" });
  if (admin.length) groups.push({ title: "Administración", items: admin });
  return groups;
}

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const ctx = await getCtx(companyId);
  const unread = await unreadCount(ctx);
  const groups = navFor(ctx, unread);
  const logo = !!(await db.company.findUnique({ where: { id: companyId }, select: { logoKey: true } }))?.logoKey;
  const role = ctx.isOwner ? "Propietario" : ctx.fullAccess ? "Acceso completo" : ctx.employee ? "Miembro" : "Miembro";
  const b = `/e/${companyId}`;
  const company = (
    <div className="company">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img src={`/api/logo/${companyId}`} alt={`Logotipo de ${ctx.company.tradeName}`} width={140} height={36} />}
      <strong>{ctx.company.tradeName}</strong>
      <span className="small muted">{ctx.userLabel} · {role}</span>
      <Link className="switch" href="/empresas">Cambiar de empresa</Link>
    </div>
  );
  const primary: NavItem[] = [
    { href: b, label: "Inicio", icon: "home" },
    can(ctx, "employees.read") ? { href: `${b}/personal`, label: "Personal", icon: "users" } : ctx.employee ? { href: `${b}/personal/${ctx.employee.id}`, label: "Mi expediente", icon: "me" } : { href: `${b}/avisos`, label: "Avisos", icon: "megaphone" },
    { href: `${b}/notificaciones`, label: "Alertas", icon: "bell", count: unread },
  ];
  return (
    <div className="shell">
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <aside className="side" aria-label="Navegación de la empresa">
        <Brand />
        {company}
        <Suspense><SideNav groups={groups} /></Suspense>
        <div className="side-foot">
          <Link className="nav-item" href="/cuenta"><CircleUser className="icon" aria-hidden="true" />Mi cuenta</Link>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <form action={`${b}/buscar`} role="search" className="search">
            <label className="sr-only" htmlFor="q">Buscar en {ctx.company.tradeName}</label>
            <Search className="icon" aria-hidden="true" />
            <input id="q" name="q" type="search" placeholder="Buscar en la empresa…" maxLength={100} autoComplete="off" />
          </form>
          <div className="top-actions">
            <Link className="icon-btn" href={`${b}/notificaciones`} aria-label={unread ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}>
              <Bell className="icon" aria-hidden="true" />
              {unread > 0 && <span className="dot" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <Link className="icon-btn" href="/cuenta" aria-label="Mi cuenta"><CircleUser className="icon" aria-hidden="true" /></Link>
          </div>
        </header>
        <main className="main" id="contenido">{children}</main>
        <Suspense>
          <TabBar primary={primary} groups={groups} extra={company} />
        </Suspense>
      </div>
    </div>
  );
}
