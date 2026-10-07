# Versión de prueba en la nube (gratis)

Servidor en Render + base en Neon + archivos en Backblaze B2 + correo con Brevo + código en GitHub (privado).
`DEPLOY_STAGE=beta`: todo como producción salvo el antivirus de archivos (los archivos quedan "sin analizar").
Secretos generados en `.local/nube-variables.txt` (no se sube a GitHub).

## Cuentas (en este orden)
1. **GitHub** (github.com) → crear cuenta. El repositorio privado lo crea Claude tras `gh auth login`.
2. **Neon** (neon.tech) → proyecto `easywork`, región AWS US East. Copiar la *Connection string* (con contraseña).
3. **Backblaze B2** (backblaze.com/b2) → Buckets → Create bucket `easywork-prueba-<algo>` **privado**.
   App Keys → Add a New Application Key con acceso solo a ese bucket (Read and Write). Guardar keyID y applicationKey.
   Anotar el *Endpoint* del bucket (p. ej. `s3.us-east-005.backblazeb2.com`).
4. **Brevo** (brevo.com) → verificar tu correo como remitente. *SMTP & API → SMTP*: login y generar clave SMTP.
5. **Render** (render.com) → entrar con GitHub → *New → Blueprint* → elegir el repositorio (usa `render.yaml`).
   Capturar las variables de `.local/nube-variables.txt`. La dirección queda como `https://easywork-prueba.onrender.com`.

## Después
- Probar `/entrar`, crear cuenta (llega el correo de verificación), crear empresa, subir un documento.
- Instaladores: GitHub → Actions → *desktop* → Run workflow con la URL de Render → descargar `.dmg` (Mac) y `.exe` (Windows).
- Plan gratuito: el servidor se duerme tras 15 min sin uso; la primera visita tarda ~1 min en despertar.
- Sin firma de Apple/Microsoft: en Mac, clic derecho → Abrir; en Windows, "Más información → Ejecutar de todas formas".
- IA: desactivada en la nube (no hay proveedor gratuito que no comparta datos).
