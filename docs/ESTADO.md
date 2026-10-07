# Estado del proyecto — 2026-10-06 (etapa 3: rediseño premium)

## Etapa 3 — rediseño marfil/piedra/salvia/grafito (PROMPT_03)
- Implementado: nuevo `globals.css` (tokens en DESIGN.md; azul eliminado), acceso compartido web/cliente (`src/lib/ui/auth.tsx`: entrar, registro, recuperar, restablecer, verificar, 2FA) con CTA único y alternativa separada por divisor; navegación con selección salvia; Mis empresas y Mi cuenta como `.standalone` (crear/unirse plegados, abiertos si no hay empresas); colores fijos retirados.
- Probado: typecheck web y cliente; lint 0 errores; vitest 83/83; e2e 15/15; rutas internas sin errores de consola; matriz 1440/768/390/320 y zoom 200% sin desbordamiento; cliente (vite) desktop/móvil sin errores; app macOS de pruebas reconstruida y abierta.
- Capturas: `.impeccable/review/antes/` y `.impeccable/review/despues/` (acceso, registro, inicio, expediente, personal, empresas, cliente).
- Rendimiento (2026-10-07): módulos del cliente bajo demanda (arranque 319→258 KB, el resto es React) con precarga en reposo; sin `backdrop-filter`; esqueleto con pulso de opacidad; `content-visibility` en listas móviles; iconos con importación nominal en la web. Medido con CPU 6× más lenta a 360 px: ~0.8 s por pantalla y 60 fps al desplazar sin cuadros lentos (`scripts/.perf.ts`).
- Animaciones: solo opacidad/transform, ≤ 260 ms, desactivadas con movimiento reducido (entrada de pantalla escalonada, listas, paneles, barras de completitud, botón presionado, contador de alertas).
- Android: APK debug recompilado y probado en emulador (login, barra inferior, expediente, token en almacén seguro). Se eliminó un duplicado `config 2.xml` creado por la sincronización de macOS.
- IA local gratuita (2026-10-07): Ollama (app oficial en /Applications) + `qwen2.5:7b`, `AI_PROVIDER=openai-compatible`, base `http://127.0.0.1:11434/v1`. Activada en todas las empresas con límites (300/mes, 30/día por persona) vía `scripts/enable-ai.ts`. Nueva herramienta `resumen_empresa` (usa el tablero, respeta permisos). Tras reiniciar la Mac hay que abrir Ollama.
- Datos sintéticos del operador: `scripts/seed-owner.ts` (4 empresas como propietario + Hotel/Ferretera/Colegio como empleado con perfiles RH, almacén y básico).
- Pendiente: iOS (requiere Xcode).

# Etapa 2: 40 puntos, diseño y apps

**Resumen honesto:** la plataforma web, la API v1 y los clientes de Android y macOS están **implementados, compilados y probados**
en local. iOS/iPadOS y Mac App Store están **implementados pero sin compilar** (falta Xcode). Windows tiene **configuración de
compilación lista, sin ejecutar** (requiere un equipo o runner Windows). **Nada está firmado para distribución, enviado ni publicado**:
faltan dominio y servidor de producción, cuentas de desarrollador, firmas y revisión legal. IA real, SMTP, S3 y ClamAV real siguen
sin verificar contra servicios externos.

## Evidencia de esta etapa
| Comprobación | Resultado |
|---|---|
| Tipos (`tsc`) web y cliente | sin errores |
| Lint | 0 errores, 4 avisos intencionales (recarga completa tras login/logout) |
| Vitest con PostgreSQL real | **83/83** en 13 archivos (antes 61) |
| E2E navegador web (escritorio + 390 px) con nuevo diseño y CSP con nonce | **15/15** |
| Cliente empaquetable en navegador (17 rutas, escritorio y móvil) | sin errores ni desbordamiento; vista previa privada y revelación auditada OK |
| Android 16 (emulador API 36, APK debug) | login, navegación, token en Keystore, reanudación tras cierre forzado, revocación remota → «Entrar» |
| AAB de release (sin firmar, URL `.invalid`) | compila; sin `.env`, claves ni credenciales dentro |
| macOS (Tauri, `.app` de pruebas, firma ad hoc) | compila (3.2 MB), abre, sin secretos; prueba Rust de enlaces externos OK |
| Producción (`next build` + `next start` con config segura) | 1 sola CSP con nonce, HSTS sin includeSubDomains, `.env`/`.local`/esquema → 404, `/api/salud/listo` 503 sin detalles |
| Migración incremental + rotación a clave nueva (copia desechable) | aplicadas; 2 registros recifrados y verificados solo con la clave nueva |
| Detector Impeccable sobre UI cambiada | 0 hallazgos; contraste medido (todo texto ≥ 4.5:1, bordes de control 3.58:1) |
| Revisión web-design-guidelines (reglas en vivo) | 6 hallazgos, todos corregidos |

## Hallazgos de la inspección y estado
| Hallazgo | Estado | Evidencia |
|---|---|---|
| Aviso de privacidad marcador | Corregido (borrador identificado, pendiente revisión legal) | `/privacidad`, `/terminos`, `/cookies`, `src/lib/operator.ts` |
| Sin eliminación de cuenta | Corregido: web, app y página pública `/eliminar-cuenta` | `tests/accounts.test.ts` |
| Cuota de IA no atómica | Corregido: reserva con candado, todos los intentos cuentan, tokens y concurrencia | `tests/ai.test.ts` (concurrencia, fallos, presupuesto, abandonadas) |
| Revocación parcial de alcance en IA | Corregido: huella de autorización por herramienta; respuesta descartada | `tests/ai.test.ts` «revocación parcial» |
| Escaneo no obligatorio en producción | Corregido: arranque falla sin ClamAV obligatorio; cuarentena y reintento | `tests/hardening.test.ts` (analizador caído → cuarentena → liberado) |
| Sin control por cuenta ni eventos de seguridad | Corregido: límites por cuenta+origen y por cuenta; bitácora `security` sin correo/tokens | `tests/auth.test.ts` |
| Confianza en `X-Forwarded-For` | Corregido: `IP_HEADER` obligatorio en producción; con XFF se toma el último valor | `tests/hardening.test.ts` |
| CSP con `unsafe-inline` / HSTS con subdominios | Corregido: nonce por petición; HSTS subdominios solo si se declara | prueba de producción |
| Anonimización incompleta | Corregido: contratos, notas de baja, títulos de alertas/notificaciones, mensajes, auditoría de documentos; búsqueda de residuos en todas las columnas de texto = 0 | `tests/accounts.test.ts` |
| Borrado de archivos tras commit silencioso | Corregido: tarea durable `storage.delete` idempotente | `tests/hardening.test.ts` |
| Salud sin readiness | Corregido: `/api/salud` (vida) y `/api/salud/listo` (503 si worker caído) | prueba de producción |
| Diseño provisional, jerga técnica | Corregido: sistema de diseño (DESIGN.md), Inicio, expediente por secciones, «Domicilio fiscal» | capturas `.impeccable/review/` |
| Sin clientes nativos | Android y macOS compilados y probados; iOS y Windows preparados | ver plataformas |

## Plataformas
| Canal | Implementado | Compilado | Probado | Firmado | Enviado | Publicado | Falta |
|---|---|---|---|---|---|---|---|
| Web/PWA | Sí | Sí | Sí | n/a | n/a | No | Dominio y servidor HTTPS |
| Android (Google Play) | Sí | APK debug y AAB release | Emulador API 36 | No | No | No | Clave de subida, cuenta Play, servidor, (cuenta personal: prueba cerrada 12 testers/14 días) |
| iOS/iPadOS (App Store) | Sí (proyecto Capacitor) | **No** | No | No | No | No | **Xcode**, Apple Developer, añadir PrivacyInfo al target |
| macOS descarga directa | Sí (Tauri) | `.app` de pruebas | Abre; UI no automatizable en macOS | Ad hoc (no válida para distribuir) | No | No | Developer ID + notarización |
| Mac App Store | Sí (entitlements sandbox) | No | No | No | No | No | Xcode, perfil MAS |
| Windows | Sí (Tauri NSIS/MSI) | **No** | No | No | No | No | Runner Windows (workflow listo), certificado de firma |

Pendiente de prueba en dispositivo real: cámara/selector de fotos y carga desde el teléfono, VoiceOver/TalkBack, enlaces profundos
(requieren dominio con asociación de apps), apertura de PDF en iOS.

## Integraciones externas
| Servicio | Estado | Requisito exacto |
|---|---|---|
| Proveedor de IA | Adaptador (SDK oficial, `fallbacks: "default"`) probado con doble de contrato; **sin llamada real** | `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` y presupuesto autorizado |
| SMTP | Implementado (nodemailer), no verificado | Servicio SMTP y `SMTP_URL` |
| S3 | Implementado (SigV4), no verificado | Bucket privado y credenciales |
| ClamAV | Protocolo probado con servidor simulado; no con clamd real | `clamd` accesible |
| Actualizador de escritorio | No incluido | Dominio, clave de firma de actualizaciones |

## Base de 40 puntos
Estados: ✅ verificado con evidencia · 🟡 implementado sin probar · ⏳ pendiente · 🔒 bloqueado por requisito · N/A con motivo.
| ID | Aplica | Estado | Evidencia / motivo |
|---|---|---|---|
| 01 Privacidad | Sí | 🔒 | Borrador real en `/privacidad`; falta revisión legal y lista de proveedores de infraestructura |
| 02 Términos | Sí | 🔒 | `/terminos` + aceptación con versión/fecha registrada por el servidor (✅ prueba); falta revisión legal |
| 03 Reembolsos | No | N/A | Sin cobros |
| 04 Cookies | Sí | ✅ | Inventario verificado contra Better Auth (`/cookies`), incluye almacenamiento nativo |
| 05 Consentimiento cookies | No | N/A | Solo almacenamiento esencial; sin rastreo |
| 06 Consentimientos | Sí | ✅ | Casilla de términos separada; IA autorizada aparte por el propietario; permisos de cámara solo al usarla |
| 07 Minimización | Sí | ✅ | Teléfono opcional; IA sin archivos/CLABE; sin analítica; copias Android desactivadas |
| 08 SDK y terceros | Sí | 🟡 | Inventario en `docs/tiendas/PRIVACIDAD-TIENDAS.md`; proveedores de infraestructura por definir |
| 09 Patrones engañosos | Sí | ✅ | Salir, revocar y eliminar visibles; peligro diferenciado con texto, no solo color |
| 10 Cargos ocultos | No | N/A | Sin monetización |
| 11 Reseñas falsas | Revisado | N/A | Sin web pública ni testimonios; fichas sin reseñas |
| 12 Afirmaciones | Sí | ✅ | Textos sin certificaciones ni seguridad absoluta; capturas del producto real con datos sintéticos |
| 13 Alternativas textuales | Sí | 🟡 | `alt`, `aria-label` en iconos, organigrama textual; falta VoiceOver/TalkBack en dispositivo |
| 14 Contraste | Sí | ✅ | Tokens medidos (≥ 4.5:1 texto, 3.58:1 bordes) |
| 15 Teclado | Sí | 🟡 | Foco visible, enlace «saltar», Escape en menú; recorrido completo de teclado pendiente |
| 16 Identificación | Sí | 🟡 | Operador configurable (`src/lib/operator.ts`); confirmar datos y dominio de soporte |
| 17 Menores | Sí | ⏳ | Texto «dirigido a adultos»; confirmar política/jurisdicción |
| 18 Baja de correos | No | N/A | Sin marketing; transaccionales se conservan |
| 19 Licencias | Sí | ✅ | Fuentes del sistema; iconos Lucide ISC; icono propio; dependencias MIT/Apache/ISC |
| 20 Eliminación de datos | Sí | ✅ | Cuenta (app y web), anonimización integral, libro para reaplicar tras restaurar |
| 21 HSTS | Sí | 🟡 | Solo producción, sin subdominios salvo declaración; verificar en dominio real |
| 22 CSRF | Sí | ✅ | Origen de Better Auth/Server Actions; apps sin cookies (bearer) y CORS restringido |
| 23 Sesiones al cambiar contraseña | Sí | ✅ | Prueba: token de app rechazado tras cambio; revocación desde web en Android |
| 24 Recuperación | Sí | ✅ | Un solo uso con dos intentos simultáneos; caducidad 30 min |
| 25 Enumeración | Sí | ✅ | Respuesta idéntica cuenta existente/inexistente (login y recuperación) |
| 26 Archivos | Sí | ✅ | Tipo real, extensión, 10 MB, imágenes recodificadas, cuarentena; HEIC no admitido (decisión) |
| 27 Webhooks | No | N/A | Sin webhooks |
| 28 Precios en servidor | Sí | ✅ | Totales Decimal en servidor; recepción idempotente también desde la app |
| 29 Inyección de prompts | Sí | ✅ | Herramientas de solo lectura, permisos externos, revocación parcial, datos marcados no confiables |
| 30 Gasto de IA | Sí | ✅ | Reserva atómica, tokens, concurrencia, fallos cuentan, abandonadas |
| 31 Tamaño de peticiones | Sí | ✅ | 413 en RPC (256 KB) y carga (10 MB) leyendo el flujo; Server Actions 12 MB |
| 32 Recuperaciones limitadas | Sí | ✅ | 3/15 min por cuenta + IP; no bloquea el login |
| 33 Validar/sanitizar | Sí | ✅ | Zod en todas las entradas; SQL parametrizado; texto plano escapado |
| 34 CORS | Sí | ✅ | Lista cerrada de orígenes de apps; preflight ajeno 403 |
| 35 Directorios internos | Sí | ✅ | `.env`, `.local`, esquema → 404; bundles sin secretos |
| 36 Administración | Sí | ✅ | Propietario + reautenticación + 2FA; sin rutas admin por defecto; depuración WebView solo en debug |
| 37 Intentos fallidos | Sí | ✅ | Por cuenta+origen y por cuenta, temporal; víctima entra desde otro origen |
| 38 Eventos de seguridad | Sí | ✅ | Bitácora `security` sin correo en claro ni secretos; retención pendiente de definir |
| 39 Cookies seguras | Sí | ✅ | httpOnly/SameSite; `__Secure-` en producción; apps en Llavero/Keystore |
| 40 Permisos de BD | Sí | 🟡 | Rol sin UPDATE/DELETE de auditoría (✅ local); validar en el despliegue real |

## Decisiones de esta etapa
- Diseño: dirección aprobada «sobrio y premium» registrada en PRODUCT.md, DESIGN.md y `.impeccable/`. Revisiones de Impeccable
  hechas en el hilo (sin subagentes, por la regla de un solo agente).
- Apps: un único cliente React empaquetado (Capacitor/Tauri) sobre la API v1; sin `server.url`, sin secretos en binarios.
- Identificador de app **provisional** `com.celsocastro.easywork`: confirmar antes de subir a tiendas.
- `prisma migrate reset` nunca se usa (bloqueado para agentes y destructivo).

## Siguiente paso concreto
1. Confirmar identificador de app y dominio; contratar/indicar hosting HTTPS para el backend de producción y revisión.
2. Crear cuentas Apple Developer y Google Play Console (guía en la respuesta final); instalar Xcode.
3. Firmar (clave de subida Android, Developer ID/Apple Distribution, certificado Windows) y ejecutar el workflow de escritorio.
4. Revisión legal de privacidad/términos y confirmación de proveedores; configurar IA real con presupuesto si se desea.
