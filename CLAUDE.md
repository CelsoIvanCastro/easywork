@AGENTS.md

# EasyWork — reglas del proyecto
Especificación original: `/Users/tytruby32/Documents/Codex/2026-10-06/ten-este-proyecto/outputs/PROMPT_CLAUDE_CODE_PLATAFORMA_EMPRESARIAL.md`.
Estado y próximo paso: `docs/ESTADO.md` (leer al reanudar). Arquitectura: `docs/ARQUITECTURA.md`.

Diseño: DESIGN.md (tokens obligatorios) y PRODUCT.md. Apps: `apps/client` (ver docs/RELEASE.md).
Comandos: `npm run db` (PG local) · `npm run dev` · `npm run worker` · `npm test` · `npm run test:e2e` · `npm run typecheck` · `npm run lint`.

Reglas:
- Lógica, validación y autorización SOLO en `src/server/services/*` con un `Ctx` de `loadCtx`. Páginas/acciones/IA/worker los llaman.
- Toda entidad lleva `companyId` y FK compuestas `(companyId, id)`; filtra siempre por empresa.
- Mutaciones en transacción con `audit()` en el mismo `tx`. Dinero/cantidades con `Decimal`. Fechas civiles `@db.Date`.
- Nunca `prisma migrate reset` ni comandos destructivos sobre bases de trabajo; pruebas solo en `easywork_test`.
- Toda operación nueva para apps va en `src/server/api/ops.ts` llamando a un servicio existente; nunca lógica en la ruta.
