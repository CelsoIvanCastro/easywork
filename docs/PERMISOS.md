# Permisos efectivos

Separación: **cuenta** (identidad) · **membresía** (acceso a una empresa) · **expediente** (relación laboral) ·
**puesto/departamento** (posición) · **concesiones** (`grant`). Un título de puesto no otorga nada por sí mismo.

## Dimensiones
1. Recurso/acción (`employees.read`, `documents.download`, `purchases.receive`, … — catálogo en `src/server/permissions.ts`).
2. Alcance para personal y auditoría: `OWN` (propio expediente), `DEPARTMENTS` (lista), `COMPANY`.
3. Grupos de campos como permisos separados: básicos (`employees.read`), personales sensibles (`employees.personal.*`),
   bancarios (`employees.bank.*`), documentos (`employees.documents.view|preview|download|upload`), notas internas
   (`employees.notes.*`), costes (`costs.read`).

## Algoritmo (único, en `resolvePermissions`)
1. **Propietario** (Company.ownerId con membresía activa): todo, en toda la empresa. Nada lo restringe.
2. **Denegar por defecto.**
3. **Acceso completo operativo** (`membership.fullAccess`, solo lo concede el propietario): todos los permisos concedibles
   en toda la empresa. Excluye los reservados: `permissions.manage` y `company.owner` (módulos, IA, código, retención,
   anonimizar, acceso completo). No transfiere propiedad.
4. **ALLOW** directos + del **puesto actual** + del **departamento actual** (estos dos solo si el expediente está Activo):
   se unen alcances (empresa domina; departamentos se suman; propios se añade).
5. **DENY** (de cualquier origen) se aplican al final y **prevalecen** sobre 3 y 4: de empresa eliminan el permiso; por
   departamentos excluyen esos departamentos; propios quita el alcance propio.

Implícito sin concesiones: el titular ve su expediente básico, datos personales, banco enmascarado y sus documentos
(no ve notas internas, ni edita puesto/estado). Completar sus propios datos requiere concesión con alcance `OWN`.

**Retirar un acceso heredado:** quitar la concesión del puesto/departamento, o añadir un DENY a la persona. La pantalla
“Permisos efectivos” muestra cada permiso con su origen.

## Momento de efecto
El contexto se recalcula en **cada solicitud** desde la base (sin caché de sesión en cookie): revocar, suspender o dar de
baja afecta a la siguiente solicitud. Un archivo ya descargado no puede recuperarse.

## Acciones de alto riesgo
Conceder/retirar permisos o acceso completo, retención, IA, anonimizar: propietario + **reautenticación** (contraseña y TOTP
si está activo, válida 10 min) + **2FA obligatorio** (`REQUIRE_PRIVILEGED_2FA`, por defecto activo).
