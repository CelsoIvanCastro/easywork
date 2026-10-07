"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArrowLeftRight, Bell, Boxes, Building2, CircleUser, FolderClosed, History, IdCard, Inbox, LayoutDashboard, Megaphone, Menu, Network, Search, Settings, ShieldCheck, ShoppingCart, Sparkles, Store, Truck, UserMinus, Users, Wrench } from "lucide-react";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number };
export type NavGroup = { title: string; items: NavItem[] };

// Un solo juego de iconos (Lucide, ISC), mismo trazo en toda la app.
export const ICONS = {
  home: LayoutDashboard, me: IdCard, megaphone: Megaphone, bell: Bell, sparkles: Sparkles, users: Users, userx: UserMinus,
  tree: Network, building: Building2, inbox: Inbox, folder: FolderClosed, boxes: Boxes, truck: Truck, store: Store,
  cart: ShoppingCart, wrench: Wrench, history: History, settings: Settings, shield: ShieldCheck, search: Search, menu: Menu,
  account: CircleUser, swap: ArrowLeftRight,
} as const;

function isCurrent(href: string, path: string, query: string) {
  const [p, q] = href.split("?");
  if (q) return path === p && query.includes(q);
  if (/^\/e\/[^/]+$/.test(p)) return path === p;
  return (path === p || path.startsWith(p + "/")) && !query.includes("view=former");
}

export function NavLink({ item, className = "nav-item" }: { item: NavItem; className?: string }) {
  const path = usePathname();
  const query = useSearchParams().toString();
  const Icon = ICONS[item.icon];
  return (
    <Link href={item.href} className={className} aria-current={isCurrent(item.href, path, query) ? "page" : undefined}>
      <Icon className="icon" aria-hidden="true" />
      <span>{item.label}</span>
      {item.count ? <span className="count" aria-label={`${item.count} sin leer`}>{item.count}</span> : null}
    </Link>
  );
}

export function SideNav({ groups }: { groups: NavGroup[] }) {
  return (
    <nav aria-label="Principal" style={{ display: "grid", gap: 8 }}>
      {groups.map((g) => (
        <div className="nav-group" key={g.title}>
          <h2>{g.title}</h2>
          {g.items.map((i) => <NavLink key={i.href} item={i} />)}
        </div>
      ))}
    </nav>
  );
}

/** Barra inferior en teléfono: destinos frecuentes + "Más" con el resto (según permisos). Se cierra al navegar. */
export function TabBar({ primary, groups, extra }: { primary: NavItem[]; groups: NavGroup[]; extra: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path, query]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <nav className="tabbar" aria-label="Accesos rápidos">
      {primary.map((i) => <NavLink key={i.href} item={i} className="" />)}
      <details ref={ref}>
        <summary aria-label="Más secciones">
          <Menu className="icon" aria-hidden="true" />
          <span>Más</span>
        </summary>
        <div className="more-panel">
          {extra}
          <SideNav groups={groups} />
        </div>
      </details>
    </nav>
  );
}
