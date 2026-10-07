import { describe, expect, it } from "vitest";
import { allows, resolvePermissions, type GrantInput } from "@/server/permissions";

const g = (p: Partial<GrantInput>): GrantInput => ({
  id: "g", permission: "employees.read", effect: "ALLOW", scope: "COMPANY", scopeDepartmentIds: [], subjectType: "MEMBER", subjectLabel: "x", ...p,
});

describe("algoritmo de permisos", () => {
  it("deniega por defecto", () => {
    const s = resolvePermissions({ isOwner: false, fullAccess: false, inheritGroups: true, grants: [] });
    expect(allows(s, "employees.read", undefined, null)).toBe(false);
  });
  it("une alcances de departamento y respeta la restricción explícita", () => {
    const s = resolvePermissions({
      isOwner: false, fullAccess: false, inheritGroups: true,
      grants: [
        g({ scope: "DEPARTMENTS", scopeDepartmentIds: ["A"], subjectType: "POSITION" }),
        g({ scope: "DEPARTMENTS", scopeDepartmentIds: ["B"], subjectType: "DEPARTMENT" }),
        g({ effect: "DENY", scope: "DEPARTMENTS", scopeDepartmentIds: ["B"] }),
      ],
    });
    expect(allows(s, "employees.read", { departmentId: "A" }, null)).toBe(true);
    expect(allows(s, "employees.read", { departmentId: "B" }, null)).toBe(false);
    expect(allows(s, "employees.read", { departmentId: "C" }, null)).toBe(false);
  });
  it("acceso completo no incluye permisos reservados y cede ante DENY", () => {
    const s = resolvePermissions({ isOwner: false, fullAccess: true, inheritGroups: true, grants: [g({ permission: "employees.bank.read", effect: "DENY" })] });
    expect(allows(s, "employees.read", { departmentId: "X" }, null)).toBe(true);
    expect(allows(s, "permissions.manage", undefined, null)).toBe(false);
    expect(allows(s, "employees.bank.read", { departmentId: "X" }, null)).toBe(false);
  });
  it("sin herencia (expediente no activo) ignora concesiones de grupo", () => {
    const s = resolvePermissions({ isOwner: false, fullAccess: false, inheritGroups: false, grants: [g({ subjectType: "POSITION" })] });
    expect(s.size).toBe(0);
  });
  it("el propietario no puede ser restringido", () => {
    const s = resolvePermissions({ isOwner: true, fullAccess: false, inheritGroups: true, grants: [g({ effect: "DENY" })] });
    expect(allows(s, "employees.read", { departmentId: "Z" }, null)).toBe(true);
    expect(allows(s, "permissions.manage", undefined, null)).toBe(true);
  });
  it("alcance propio solo cubre el expediente de la persona", () => {
    const s = resolvePermissions({ isOwner: false, fullAccess: false, inheritGroups: true, grants: [g({ scope: "OWN", permission: "employees.personal.edit" })] });
    expect(allows(s, "employees.personal.edit", { employeeId: "me" }, "me")).toBe(true);
    expect(allows(s, "employees.personal.edit", { employeeId: "other" }, "me")).toBe(false);
  });
});
