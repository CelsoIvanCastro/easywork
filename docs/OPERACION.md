# Operación

## Desarrollo local (verificado en macOS arm64, Node 24)
```bash
npm install                 # dependencias (npm 11 pide aprobar scripts de instalación: ya listados en package.json → allowScripts)
npm run setup               # crea .env con secretos aleatorios (no sobrescribe uno existente)
npm run db                  # PostgreSQL 18 embebido en 127.0.0.1:54329 (dejar abierto; Ctrl+C para detener)
npm run db:migrate          # aplica migraciones (no destructivo)
npm run generate            # genera el cliente Prisma
npm run seed                # datos sintéticos; credenciales en .local/demo-credenciales.txt
npm run dev                 # http://localhost:3000
npm run worker              # tareas: alertas, limpieza de huérfanos, análisis de archivos
```
Detener: Ctrl+C en `dev`, `worker` y `db` (en ese orden). Correos de desarrollo: `.local/mailbox/*.json`.

Docker no estaba disponible en el equipo de desarrollo; en otro entorno basta cualquier PostgreSQL ≥ 15:
crea las bases `easywork` y `easywork_test`, el rol `easywork_app` con contraseña, y ajusta las URL de `.env`.

## Pruebas
```bash
npm run typecheck && npm run lint
npm test                    # Vitest contra easywork_test (se niega a correr contra otra base). No destructivo.
npm run test:e2e            # navegador (Chrome instalado) contra la app en marcha (dev + worker)
```
El e2e crea dos cuentas por ejecución; el límite de registro es 5 cada 5 min por IP: espera entre ejecuciones seguidas.

## Base de datos y privilegios
- Migraciones con el propietario (`MIGRATE_DATABASE_URL`); la app usa `easywork_app` (`DATABASE_URL`) con SELECT/INSERT/
  UPDATE/DELETE y **sin UPDATE/DELETE sobre `audit_log`**. Un trigger además rechaza modificar la auditoría salvo la
  función `audit_redact_entity` (retención autorizada). Límite: un superusuario de PostgreSQL puede desactivar el trigger;
  protege ese acceso a nivel de infraestructura.
- Producción: `npm run db:migrate` (`prisma migrate deploy`) en cada despliegue; nunca `migrate reset`.

## Copias de seguridad y restauración
```bash
npm run backup                        # → .local/backups/<fecha>/ (manifest con SHA-256 de cada archivo)
npm run restore -- .local/backups/<fecha>   # restauración DE PRUEBA en directorio y puerto propios (54399), con verificación
```
- Con `pg_dump` en PATH (o `PG_BIN`) la copia es lógica y en caliente. Sin él (PostgreSQL embebido) se hace **copia en frío**:
  detén `npm run db` antes. Verificado: copia en frío → restauración desechable → relaciones, FK compuestas, trigger de
  auditoría, integridad de 12 archivos, descifrado y acceso a un documento (propietario sí, otra empresa no).
- **Claves necesarias para restaurar:** `ENCRYPTION_KEYS`/`ENCRYPTION_KEY_CURRENT`, `BLIND_INDEX_KEY`, `BETTER_AUTH_SECRET`.
  No van en la copia: guárdalas en un gestor de secretos aparte. Sin ellas los campos cifrados son irrecuperables.
- La restauración nunca escribe sobre la base de trabajo. Para restaurar producción de verdad, hazlo en una instancia nueva,
  verifica y luego cambia la conexión.

## Claves
- Cifrado de campos: AES-256-GCM (Node `crypto`) con AAD empresa+campo, claves versionadas (`k1`, `k2`…).
  Rotación: añade `k2` a `ENCRYPTION_KEYS`, pon `ENCRYPTION_KEY_CURRENT=k2`, ejecuta `npm run keys:rotate`, y cuando
  reporte 0 pendientes retira `k1`. `BLIND_INDEX_KEY` no se rota sin reindexar.
- Esto es cifrado de datos en la aplicación; distinto del cifrado del disco/almacenamiento y de TLS en tránsito. Configura
  los tres en producción.

## Producción (no desplegado ni auditado: notas de configuración)
Con `NODE_ENV=production` la app **no arranca** si: `APP_URL` no es https, `STORAGE_DRIVER=local`, `MAIL_DRIVER=local`,
`BETTER_AUTH_SECRET` < 32 caracteres, no hay `FILE_SCAN=clamav` + `FILE_SCAN_REQUIRED=true`, o falta `IP_HEADER` (verificado). Además:
- `STORAGE_DRIVER=s3` + `S3_*` (bucket privado, sin acceso público, cifrado en reposo). Adaptador S3 implementado con
  firma SigV4 (aws4fetch); **no probado contra un servicio real**.
- `MAIL_DRIVER=smtp` + `SMTP_URL` (nodemailer). **No probado contra un servidor real.**
- `FILE_SCAN=clamav`, `FILE_SCAN_REQUIRED=true` y un `clamd` accesible. Sin analizador, las cargas quedan en cuarentena.
- Detrás de un proxy, asegúrate de que sobrescriba `X-Forwarded-For` (los límites por IP lo usan). HSTS se envía en producción.
- Ejecuta al menos un `worker`; varios son seguros (coordinación por la base).
- Salud: `GET /api/salud` (vida del proceso, público y mínimo) y `GET /api/salud/listo` (disponibilidad: 503 si base,
  almacenamiento o worker fallan; el detalle solo en desarrollo o con `Authorization: Bearer $HEALTH_TOKEN`). Tareas fallidas: tabla `job` (`status=FAILED`,
  `lastError`); reintento con `retryJob(id)` en `src/server/jobs.ts`.

## IA empresarial
1. En el servidor: `AI_PROVIDER=anthropic`, `AI_MODEL=claude-opus-5-5`, `AI_API_KEY=<clave de la organización>`
   (o `AI_PROVIDER=openai-compatible` + `AI_BASE_URL` + `AI_MODEL` para un servidor compatible que tú administres).
   Nunca se reutilizan credenciales personales ni de Claude Code.
2. Reinicia `dev`/`start`. 3. Como propietario: Configuración → IA empresarial → activar el módulo y autorizar
   (reconociendo qué datos salen; requiere 2FA + reautenticación). 4. Concede `ai.use` a quien deba usarla.
Con Anthropic se envía `fallbacks: "default"` (respaldo del servidor ante rechazos por políticas) y se maneja
`stop_reason: "refusal"`. Estado actual: **no verificada con un proveedor real** (no hay credenciales configuradas);
el adaptador, las herramientas, la autorización y los límites están cubiertos por pruebas de contrato con un doble de prueba.

## Apps (iOS, Android, macOS, Windows)
Ver [RELEASE.md](RELEASE.md). Desarrollo del cliente: `cd apps/client && npm ci && npx vite` (http://localhost:5173, contra la API local).
Prueba en Android: `VITE_API_URL=http://localhost:3000 VITE_INSECURE_TEST_BUILD=true npx vite build && npx cap sync android &&
(cd android && ./gradlew assembleDebug)`, `adb reverse tcp:3000 tcp:3000` e instalar el APK de `android/app/build/outputs/apk/debug/`.

## Eliminaciones y copias
Tras restaurar una copia antigua ejecuta `npx tsx --conditions=react-server scripts/reapply-erasures.ts` para reaplicar las
eliminaciones de cuentas y anonimizaciones registradas después (libro `ERASURE_LEDGER`, guárdalo fuera de los backups).
La migración incremental y la rotación a una clave nueva se pueden ensayar sobre una copia: `RESTORE_MIGRATE=1
RESTORE_ROTATE_KEYS="k1:…,k2:…" RESTORE_ROTATE_CURRENT=k2 npm run restore -- .local/backups/<fecha>`.
