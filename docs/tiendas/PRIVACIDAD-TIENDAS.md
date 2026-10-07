# Respuestas de privacidad para tiendas (derivadas del código actual)

## Apple — App Privacy («Datos vinculados a ti», sin rastreo)
| Tipo | Uso | Vinculado | Rastreo |
|---|---|---|---|
| Nombre, correo, teléfono (opcional) | Funcionalidad de la app (cuenta) | Sí | No |
| Fotos (solo las que eliges subir) | Funcionalidad | Sí | No |
| Otro contenido del usuario (expedientes, documentos, notas) | Funcionalidad | Sí | No |
No se recopilan: ubicación, contactos, identificadores de publicidad, datos de uso para analítica, diagnósticos de terceros.
Manifiesto: `apps/client/ios/App/App/PrivacyInfo.xcprivacy` (sin APIs de motivo requerido propias; los SDK de Capacitor traen el suyo).

## Google Play — Seguridad de los datos
- Datos recopilados: información personal (nombre, correo, teléfono opcional), fotos y archivos (los que el usuario sube), otro contenido.
- Finalidad: funcionalidad de la app y administración de la cuenta. No se comparten con terceros para publicidad.
- Cifrado en tránsito: sí (HTTPS obligatorio en producción).
- Eliminación: el usuario puede eliminar su cuenta en la app (Mi cuenta) y mediante la web `/eliminar-cuenta`.
- Permisos Android: solo `INTERNET` (cámara mediante la aplicación de cámara del sistema/selector, sin permiso propio declarado).
- Copias de seguridad automáticas: desactivadas (`allowBackup=false`, reglas de extracción vacías).

## Proveedores en la app instalada
Ninguno de analítica ni publicidad. Bibliotecas: Capacitor (Ionic, MIT), @aparajita/capacitor-secure-storage (MIT), Lucide (ISC), React (MIT),
Tauri (MIT/Apache-2.0), keyring (MIT/Apache-2.0). La IA se ejecuta en el servidor, no en el dispositivo.
