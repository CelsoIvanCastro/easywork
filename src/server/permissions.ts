// Catálogo de permisos y algoritmo único de permisos efectivos (ver docs/PERMISOS.md).
// Módulo puro: sin acceso a base de datos, para poder probarlo de forma aislada.

export type Scope = "OWN" | "DEPARTMENTS" | "COMPANY";

type PermDef = { label: string; group: string; module: string; scoped?: boolean; ownerOnly?: boolean };

export const PERMISSIONS = {
  "employees.read": { label: "Consultar personal (datos básicos)", group: "Personal", module: "employees", scoped: true },
  "employees.create": { label: "Dar de alta expedientes", group: "Personal", module: "employees" },
  "employees.edit": { label: "Editar datos básicos, puesto y departamento", group: "Personal", module: "employees", scoped: true },
  "employees.offboard": { label: "Bajas, suspensiones y recontrataciones", group: "Personal", module: "employees", scoped: true },
  "employees.personal.read": { label: "Ver datos personales sensibles (CURP, RFC, NSS, domicilio, nacimiento)", group: "Personal", module: "employees", scoped: true },
  "employees.personal.edit": { label: "Editar datos personales sensibles", group: "Personal", module: "employees", scoped: true },
  "employees.bank.read": { label: "Ver información bancaria", group: "Personal", module: "employees", scoped: true },
  "employees.bank.edit": { label: "Editar información bancaria", group: "Personal", module: "employees", scoped: true },
  "employees.notes.read": { label: "Ver notas internas e incidencias", group: "Personal", module: "employees", scoped: true },
  "employees.notes.edit": { label: "Registrar notas internas e incidencias", group: "Personal", module: "employees", scoped: true },
  "employees.documents.view": { label: "Ver documentos de expedientes", group: "Personal", module: "employees", scoped: true },
  "employees.documents.preview": { label: "Previsualizar documentos de expedientes", group: "Personal", module: "employees", scoped: true },
  "employees.documents.download": { label: "Descargar documentos de expedientes", group: "Personal", module: "employees", scoped: true },
  "employees.documents.upload": { label: "Subir y versionar documentos de expedientes", group: "Personal", module: "employees", scoped: true },
  "structure.read": { label: "Ver organigrama", group: "Estructura", module: "employees" },
  "structure.manage": { label: "Administrar departamentos y puestos", group: "Estructura", module: "employees" },
  "joinRequests.review": { label: "Revisar solicitudes de ingreso", group: "Estructura", module: "employees" },
  "documents.view": { label: "Ver repositorio documental", group: "Documentos", module: "documents" },
  "documents.preview": { label: "Previsualizar documentos", group: "Documentos", module: "documents" },
  "documents.download": { label: "Descargar documentos", group: "Documentos", module: "documents" },
  "documents.upload": { label: "Subir documentos nuevos", group: "Documentos", module: "documents" },
  "documents.version": { label: "Reemplazar y restaurar versiones", group: "Documentos", module: "documents" },
  "documents.manage": { label: "Carpetas, mover y archivar documentos", group: "Documentos", module: "documents" },
  "documents.confidential": { label: "Acceder a documentos confidenciales", group: "Documentos", module: "documents" },
  "inventory.read": { label: "Consultar inventario y activos", group: "Inventario", module: "inventory" },
  "inventory.manage": { label: "Administrar categorías, artículos y activos", group: "Inventario", module: "inventory" },
  "inventory.move": { label: "Registrar movimientos de existencias", group: "Inventario", module: "inventory" },
  "costs.read": { label: "Ver costes, precios e importes", group: "Inventario", module: "inventory" },
  "suppliers.read": { label: "Consultar proveedores", group: "Compras", module: "suppliers" },
  "suppliers.manage": { label: "Administrar proveedores", group: "Compras", module: "suppliers" },
  "purchases.read": { label: "Consultar compras", group: "Compras", module: "purchases" },
  "purchases.manage": { label: "Crear, confirmar y cancelar compras", group: "Compras", module: "purchases" },
  "purchases.receive": { label: "Registrar y revertir recepciones", group: "Compras", module: "purchases" },
  "maintenance.read": { label: "Consultar mantenimiento", group: "Mantenimiento", module: "maintenance" },
  "maintenance.manage": { label: "Planes, lecturas y registros de mantenimiento", group: "Mantenimiento", module: "maintenance" },
  "announcements.publish": { label: "Publicar y archivar avisos", group: "Comunicación", module: "announcements" },
  "alerts.manage": { label: "Configurar alertas", group: "Comunicación", module: "core" },
  "audit.read": { label: "Consultar auditoría", group: "Administración", module: "core", scoped: true },
  "settings.manage": { label: "Editar datos de la empresa", group: "Administración", module: "core" },
  "ai.use": { label: "Usar la IA empresarial", group: "Administración", module: "ai" },
  // Reservados al propietario: no se pueden conceder.
  "permissions.manage": { label: "Administrar permisos y acceso completo", group: "Propietario", module: "core", ownerOnly: true },
  "company.owner": { label: "Acciones de propietario (módulos, IA, código, retención)", group: "Propietario", module: "core", ownerOnly: true },
} as const satisfies Record<string, PermDef>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const GRANTABLE = ALL_PERMISSIONS.filter((p) => !(PERMISSIONS[p] as PermDef).ownerOnly);
export const isScoped = (p: Permission) => !!(PERMISSIONS[p] as PermDef).scoped;
export const isPermission = (p: string): p is Permission => p in PERMISSIONS;

export type GrantInput = {
  id: string;
  permission: string;
  effect: "ALLOW" | "DENY";
  scope: Scope;
  scopeDepartmentIds: string[];
  subjectType: "MEMBER" | "POSITION" | "DEPARTMENT";
  subjectLabel: string;
};

export type Effective = {
  company: boolean;
  departments: Set<string>;
  excluded: Set<string>;
  own: boolean;
  origins: string[];
};

export type PermissionSet = Map<Permission, Effective>;

export type ResolveInput = {
  isOwner: boolean;
  fullAccess: boolean;
  // Herencia de puesto/departamento solo aplica a expedientes ACTIVOS.
  inheritGroups: boolean;
  grants: GrantInput[];
};

/**
 * Algoritmo de permisos efectivos:
 * 1. Propietario: todo, en toda la empresa. Nada puede restringirlo.
 * 2. Denegar por defecto.
 * 3. Acceso completo operativo: todos los permisos concedibles en toda la empresa.
 * 4. Concesiones ALLOW (directas, del puesto y del departamento actuales): se unen los alcances.
 *    Alcance de empresa domina; departamentos se suman; "propios" se añade.
 * 5. Restricciones DENY (de cualquier origen) se aplican al final y prevalecen sobre 3 y 4:
 *    DENY de empresa elimina el permiso; DENY de departamentos excluye esos departamentos.
 * Los permisos sin alcance (no "scoped") siempre se tratan como de empresa.
 */
export function resolvePermissions(input: ResolveInput): PermissionSet {
  const out: PermissionSet = new Map();
  if (input.isOwner) {
    for (const p of ALL_PERMISSIONS) out.set(p, { company: true, departments: new Set(), excluded: new Set(), own: true, origins: ["Propietario"] });
    return out;
  }
  const get = (p: Permission) => {
    let e = out.get(p);
    if (!e) out.set(p, (e = { company: false, departments: new Set(), excluded: new Set(), own: false, origins: [] }));
    return e;
  };
  if (input.fullAccess) {
    for (const p of GRANTABLE) {
      const e = get(p);
      e.company = true;
      e.origins.push("Acceso completo operativo");
    }
  }
  const applicable = input.grants.filter((g) => isPermission(g.permission) && (g.subjectType === "MEMBER" || input.inheritGroups));
  for (const g of applicable.filter((g) => g.effect === "ALLOW")) {
    const p = g.permission as Permission;
    if (!GRANTABLE.includes(p)) continue;
    const e = get(p);
    const scope: Scope = isScoped(p) ? g.scope : "COMPANY";
    if (scope === "COMPANY") e.company = true;
    else if (scope === "DEPARTMENTS") g.scopeDepartmentIds.forEach((d) => e.departments.add(d));
    else e.own = true;
    e.origins.push(`${g.subjectLabel}${scope === "COMPANY" ? "" : scope === "OWN" ? " (propios)" : " (departamentos)"}`);
  }
  for (const g of applicable.filter((g) => g.effect === "DENY")) {
    const p = g.permission as Permission;
    const e = out.get(p);
    if (!e) continue;
    const scope: Scope = isScoped(p) ? g.scope : "COMPANY";
    if (scope === "COMPANY") {
      out.delete(p);
      continue;
    }
    if (scope === "DEPARTMENTS") {
      for (const d of g.scopeDepartmentIds) {
        e.departments.delete(d);
        e.excluded.add(d);
      }
    } else e.own = false;
    e.origins.push(`Restringido por ${g.subjectLabel}`);
    if (!e.company && !e.departments.size && !e.own) out.delete(p);
  }
  return out;
}

export type Target = { departmentId?: string | null; employeeId?: string | null };

export function allows(set: PermissionSet, p: Permission, target: Target | undefined, selfEmployeeId: string | null): boolean {
  const e = set.get(p);
  if (!e) return false;
  if (!target) return e.company || e.departments.size > 0 || e.own;
  const dept = target.departmentId ?? null;
  if (e.company && !(dept && e.excluded.has(dept))) return true;
  if (dept && e.departments.has(dept)) return true;
  return e.own && !!selfEmployeeId && target.employeeId === selfEmployeeId;
}
