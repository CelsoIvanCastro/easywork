# Releases de las apps

## Preparación comprobada el 26 de octubre de 2026

- Destino de la primera entrega: Windows. El workflow `desktop` genera NSIS/MSI, comprueba disponibilidad del backend antes de compilar y falla si no se produjeron instaladores. Ejecución 40382756480 iniciada; falta comprobar resultado e instalación real.
- Antes de configurar el servicio: `npm run beta:check -- --env-file .local/nube-variables.txt`. Solo muestra nombres de variables pendientes, nunca secretos. Después: `npm run beta:check -- --url https://DIRECCION-REAL --online`.
- Render Free bloquea SMTP (25/465/587). La configuración usa `MAIL_DRIVER=brevo` y `BREVO_API_KEY` para enviar por HTTPS. Esta clave es distinta de la clave SMTP; requiere remitente verificado y una prueba real de entrega.
- Alternativa a Neon: Aiven PostgreSQL Free, sin caducidad fija, 1 GB de disco y máximo de 20 conexiones. `PG_POOL_MAX=5` limita el grupo de conexiones de cada proceso. Comprobar TLS y certificado del proveedor al conectarlo. El plan puede suspender servicios inactivos y no incluye garantía de disponibilidad.
- No usar Render Postgres Free para la empresa: caduca a los 30 días. No se creó esa base temporal.
- `render.yaml` conserva análisis obligatorio. Si no existe ClamAV en la dirección configurada, los archivos se quedan en cuarentena. No declarar documentos listos ni desactivar esta protección para poner datos laborales reales.
- Servidor publicado en https://easywork-tytruby32.onrender.com, conectado a Aiven/B2/Brevo con secretos privados en Render. Disponibilidad, TLS de base, almacenamiento privado real y CORS verificados. Pendientes entrega real de correo, restauración externa y uso desde Windows. No compartir los instaladores locales antiguos: apuntan a localhost.

Referencias: [Render Free](https://render.com/docs/free), [Aiven Free](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier), [Brevo HTTPS](https://developers.brevo.com/reference/send-transac-email).

Arquitectura: el servidor Next.js (web + API `/api/v1`) es la única fuente de verdad. Las apps empaquetan el cliente
`apps/client` (React + Vite, recursos locales) y hablan con la API por HTTPS con un token bearer revocable guardado en el
almacén seguro del sistema. Ningún binario contiene base de datos, claves de cifrado, SMTP ni proveedor de IA.

Identificador **provisional**: `com.celsocastro.easywork` (`apps/client/capacitor.config.ts`, `src-tauri/tauri.conf.json`).
Confírmalo antes de la primera subida: no se puede cambiar después en las tiendas.

## Requisitos previos (una vez)
- Servicio en producción con HTTPS y dominio propio (`APP_URL`, `CLIENT_ORIGINS` por defecto ya incluye los orígenes de las apps).
- `cd apps/client && npm ci`.
- Android: JDK 21, Android SDK (API 36). iOS/Mac App Store: **Xcode** (App Store) y cuenta Apple Developer. Escritorio: Rust (`rustup`).

## Compilación del cliente (siempre primero)
```bash
cd apps/client
VITE_API_URL=https://TU-DOMINIO npx vite build      # falla a propósito si la URL no es https
```

## Android (Google Play)
```bash
npx cap sync android
cd android && ./gradlew bundleRelease               # → app/build/outputs/bundle/release/app-release.aab (sin firmar)
```
Firma: crea tu clave de subida (guárdala fuera del repositorio y con copia de seguridad):
`keytool -genkeypair -v -keystore ~/easywork-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 9125`
y firma con `jarsigner` o configura `signingConfigs` leyendo la contraseña de variables de entorno. Activa **Play App Signing**.
Prueba local: `./gradlew assembleDebug` con `VITE_API_URL=http://10.0.2.2:3000 VITE_INSECURE_TEST_BUILD=true` (HTTP solo en la variante debug y solo hacia 10.0.2.2).

## iOS y iPadOS (App Store)
Requiere Xcode. `npx cap sync ios && npx cap open ios`; en Xcode: equipo de firma, añadir `App/PrivacyInfo.xcprivacy` al target,
versión/build, *Product → Archive → Distribute App*.

## macOS
- Descarga directa: `npx tauri build` → `.app` y `.dmg`. Para distribuir: firma con *Developer ID Application* + notarización
  (variables `APPLE_*`, ver workflow). Un `.dmg` sin firma solo sirve para pruebas internas.
- Mac App Store: requiere sandbox (`com.apple.security.app-sandbox`, `com.apple.security.network.client`) y perfil de Mac App Store;
  se prepara en `src-tauri/entitlements.mas.plist` con firma *Apple Distribution*.

## Windows
`.github/workflows/desktop.yml` (ejecución manual) compila NSIS (`.exe`) y MSI en un runner Windows. Para distribuir sin advertencias
de SmartScreen hace falta un certificado de firma de código (OV/EV) o Azure Trusted Signing.

## Versionado y compatibilidad
Versión de app en `package.json`, `tauri.conf.json` y Gradle/Xcode. La API es `/api/v1`: los cambios incompatibles irán a `/api/v2`
manteniendo `v1` mientras existan versiones instaladas que la usen. Las apps de tienda se actualizan por su tienda; la descarga
directa de macOS/Windows se actualizará con el actualizador firmado de Tauri cuando exista un dominio para publicar el manifiesto
(pendiente: requiere clave de firma de actualizaciones y URL).
