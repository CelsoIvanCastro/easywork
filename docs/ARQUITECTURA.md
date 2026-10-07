# Arquitectura

Monolito modular en **Next.js 16 (App Router) + TypeScript**, **PostgreSQL** con **Prisma 7**, validación con **Zod 4**,
autenticación con **Better Auth 1.7** (correo/contraseña, verificación, recuperación, sesiones en base de datos, TOTP).
Un **worker** Node separado procesa tareas persistentes de la base.

```
src/
  app/                 Interfaz (páginas = lectura, actions.ts = acciones de servidor). Sin lógica de negocio.
  components/          Formularios y piezas de UI reutilizables.
  lib/                 Código compartido sin servidor: catálogos y validadores mexicanos (CURP/RFC/NSS/CLABE).
  server/
    context.ts         Contexto por solicitud: identidad → membresía → permisos efectivos → módulos.
    permissions.ts     Catálogo y algoritmo único de permisos (función pura, probada).
    services/          Casos de uso por dominio. TODA autorización y validación crítica vive aquí.
    ai/                Adaptador de proveedor, herramientas de solo lectura y orquestación.
    audit.ts crypto.ts storage.ts files.ts mail.ts jobs.ts util.ts env.ts
  worker/index.ts      Bucle del worker (alertas, limpieza de huérfanos, análisis de archivos).
prisma/                Esquema y migraciones (incluye SQL propio: índices parciales, CHECK, triggers, privilegios).
scripts/               db local, setup, seed, backup/restore, rotación de claves, e2e.
tests/                 Vitest contra PostgreSQL real (base *_test).
```

## Reglas
- Páginas, acciones, rutas, worker e IA llaman a `services/*`, que reciben un `Ctx` construido en el servidor
  (`loadCtx(userId, companyId)`). El `companyId` del cliente solo *selecciona*; la membresía activa lo autoriza.
- Toda tabla de empresa lleva `companyId` y sus relaciones usan **FK compuestas `(companyId, id)`**: la base impide
  enlazar un empleado, departamento, proveedor, documento, etc. de otra empresa. Los servicios además filtran por empresa.
- Operaciones con varias entidades en **transacción**, con **auditoría en la misma transacción**.
- Concurrencia: bloqueos de fila (`FOR UPDATE`) en aprobaciones, bajas, versiones, recepciones; UPDATE condicional
  para existencias (sin saldo negativo); control optimista (`version`) en ediciones; **claves de idempotencia** en
  movimientos y recepciones; índices únicos parciales (una solicitud pendiente, un periodo abierto, una alerta abierta
  por condición, una cuenta bancaria vigente).
- Dinero y cantidades con `Decimal` (Prisma/decimal.js), nunca floats; importes de línea redondeados a centavos (mitad
  hacia arriba) en el servidor. Fechas de eventos en UTC (`timestamp` + sesión `TimeZone=UTC`); fechas civiles como
  `date` y se muestran sin conversión horaria; “hoy” se calcula en la zona de la empresa.
- Listados paginados en servidor con índices.

## Modelo (resumen)
Identidad: `user`, `session`, `account`, `verification`, `two_factor`, `rate_limit`.
Empresa: `company` (propietario = `ownerId`), `company_settings`, `company_module`, `membership`, `join_request`, `grant`, `counter`.
Estructura y personal: `department`, `position` (jerarquía = autoridad), `employee` (expediente por empresa; campos
sensibles cifrados + índices ciegos), `employment_period`, `assignment_history`, `employee_note`, `employee_contract`, `bank_account`.
Documentos: `folder`, `document` (vínculo por FK real a una sola entidad), `document_version`.
Operación: `category`, `item`, `stock_movement` (libro), `asset`, `asset_event`, `usage_reading`, `supplier`, `purchase`,
`purchase_line`, `receipt`, `receipt_line`, `price_record`, `maintenance_plan`, `maintenance_record`.
Comunicación: `announcement`, `announcement_department`, `alert`, `notification`. Sistema: `audit_log`, `job`, `worker_heartbeat`, `ai_usage`.

**Identidad vs. expediente:** el perfil global (nombre, apellidos, correo, teléfono) se copia al expediente al ingresar.
Después, cada empresa controla su copia; editar el perfil no reescribe expedientes. Borrar una cuenta no borra expedientes
(`employee.userId` se desvincula) ni auditoría (sin FK).

**Supervisor:** se deriva de la jerarquía de puestos (ocupantes del puesto superior). No existe un campo supervisor
independiente, para no tener dos fuentes de autoridad.

## Estados del expediente
| Estado | Acceso a la empresa | Organigrama | Alertas |
|---|---|---|---|
| Activo | según permisos (directos + puesto + departamento) | sí | sí |
| Suspendido | ninguno (inmediato) | sí, marcado | sí |
| Baja en proceso | solo su propio expediente (sin herencia de grupos) | sí, marcado | sí |
| Exempleado | ninguno; membresía revocada, sin acceso completo ni concesiones directas | no | se cierran |
Recontratar crea un periodo nuevo en el mismo expediente y reactiva la membresía **sin** permisos anteriores.

## Documentos
Documento lógico + versiones físicas numeradas (bloqueo de fila; sin huecos ni duplicados). Restaurar = copiar una
versión previa como nueva vigente. Archivos en almacenamiento privado con claves UUID generadas (sin rutas del usuario),
escritura `wx` (sin sobrescritura). Validación por firma real (file-type), tamaño ≤ 10 MB, extensión coherente;
imágenes re-codificadas con sharp (sin EXIF/GPS). Entrega solo por `/api/archivos/...` con permisos evaluados en cada
solicitud (también versiones antiguas), `Cache-Control: private, no-store`, `nosniff`. Confidencialidad: propia o heredada
de cualquier carpeta ancestro; mover nunca amplía el acceso. Análisis: ClamAV (`FILE_SCAN=clamav`); sin analizador,
en desarrollo queda “sin analizar” (visible) y en producción (`FILE_SCAN_REQUIRED=true`) en cuarentena hasta que el worker lo analice.
Carga: archivo → metadatos en transacción; si falla la transacción se borra el archivo; huérfanos > 1 h los limpia el worker.

## Alertas y worker
El worker reclama tareas con `FOR UPDATE SKIP LOCKED`, reintenta con espera exponencial, marca `FAILED` al agotar intentos,
recupera tareas `RUNNING` abandonadas (>10 min) y programa tareas con claves por intervalo (sin duplicados).
Alertas: reconciliación por empresa bajo candado consultivo de transacción. Regla: condición presente → una alerta abierta
(índice único parcial); condición resuelta → `RESOLVED`; si reaparece → alerta nueva. Módulos desactivados: sus alertas
quedan en pausa (ni se crean ni se cierran) y no se muestran. Notificaciones se crean para quien tiene permiso y se
revalidan al consultarlas.

## Mantenimiento
Política visible: un plan vence al cumplirse **cualquiera** de sus umbrales; el siguiente vencimiento se calcula desde la
fecha y lectura **reales** del último servicio completado. Sin lectura (o > 30 días) el estado es “sin confirmar”.
Lecturas monótonas; corregir o cambiar de medidor exige evento explícito (el cambio de medidor acumula un desplazamiento
para que la lectura efectiva continúe).

## IA
Ver `docs/OPERACION.md` (configuración) y `src/server/ai/`. Herramientas tipadas de solo lectura que reutilizan los
servicios y permisos; permisos frescos antes de cada herramienta y antes de entregar; resultados marcados como datos no
confiables; límites de entrada, rondas, herramientas, tamaño, tiempo, ráfaga por persona, diario por persona y mensual por
empresa. No se guardan conversaciones; `ai_usage` registra solo estado, tokens, herramientas y duración.

## API v1 y apps
- `POST /api/v1/rpc` `{ op, companyId?, input }` → `{ data } | { error }` (registro en `src/server/api/ops.ts`). Cada operación
  valida con Zod, toma identidad (cookie o `Authorization: Bearer`) y empresa del servidor, y llama al mismo servicio que la web.
  Cuerpo limitado a 256 KB leyendo el flujo; `/api/v1/upload` a 10 MB + margen. Contrato público: `src/lib/api-contract.ts`.
- Autenticación de apps: `/api/v1/auth/{login,2fa,logout,forgot}` sobre Better Auth (plugin `bearer`); el reto de 2FA viaja como
  token opaco porque las apps no usan cookies. El token se guarda en Llavero/Keystore (móvil) o en el almacén de credenciales (escritorio).
- CORS solo para los orígenes de las apps (`src/proxy.ts`), sin credenciales. Las páginas reciben CSP con nonce por petición.
- Cliente `apps/client` (React + Vite) empaquetado con Capacitor (iOS/Android) y Tauri 2 (macOS/Windows). No contiene secretos ni
  base de datos; en producción exige `VITE_API_URL` https.

## Cuentas, propiedad y cierre
- Eliminar cuenta (`services/accounts.ts`): borra identidad, sesiones, 2FA, foto, solicitudes y accesos; desvincula expedientes
  (los conserva cada empresa); seudonimiza al autor en la auditoría (`audit_redact_actor`); registra la eliminación sin datos personales.
- El propietario no puede eliminar su cuenta con empresas activas: transfiere (el sucesor acepta con reautenticación) o cierra la
  empresa (`closedAt`: nadie opera; datos conservados según retención).

## IA: cuota y alcance
Reserva atómica antes de llamar al proveedor (candado por empresa), periodos de día/mes civiles de la empresa, presupuesto mensual
de tokens, máximo 2 consultas en curso por persona, reservas abandonadas recuperadas. Cada herramienta registra la huella de los
permisos efectivos con que leyó; si al final no coincide con la actual (departamento, campo, puesto, módulo, membresía, IA), se
descarta toda la respuesta. Del historial del cliente solo se usan preguntas.

## Decisiones
- PostgreSQL local con `embedded-postgres` (binarios oficiales vía npm) porque no hay Docker en el equipo de desarrollo.
  Su versión npm lleva sufijo `-beta.N` aunque los binarios son PostgreSQL 18.4 estable; solo se usa en desarrollo.
- Sin service worker en la PWA: evita cachear expedientes privados. El manifiesto permite instalarla.
- Diseño: ver DESIGN.md (tokens) y PRODUCT.md. Iconos Lucide (ISC). Sin fuentes externas.
- Avisos en texto plano (se muestra escapado): no se necesita sanitizador HTML.
- `docker-compose` no incluido: no se pudo verificar sin Docker.
