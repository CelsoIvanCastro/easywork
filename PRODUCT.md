# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Interfaz web adaptable; los clientes de iOS/Android y escritorio empaquetan esta misma interfaz y su lenguaje visual es web, no nativo.)

## Users
- **Dueños de pymes** (fundador/CEO), en México, que administran personal, documentos y operación ellos mismos, muchas veces desde el teléfono entre otras tareas.
- **RH / administración**: llevan expedientes, documentos, solicitudes de ingreso, bajas y permisos, a diario y en escritorio.
- **Empleados**: consultan y completan su propio expediente, suben documentos con la cámara y leen avisos; principalmente desde el teléfono.
- **Operación / almacén**: inventario, compras y recepciones, activos y mantenimiento (constructoras, talleres y similares), en escritorio y en piso.

## Product Purpose
Administrar una empresa (o varias) desde un solo lugar: personas y estructura, expedientes y documentos privados con versiones, inventario y activos, proveedores y compras, mantenimiento, avisos, alertas, búsqueda, auditoría y una IA de consulta. Éxito: que una pyme deje hojas de cálculo y carpetas sueltas, encuentre cualquier dato en segundos y nunca pierda historial.

## Positioning
Las tres cosas juntas: **todo en un solo lugar** (personal, documentos, inventario, compras y mantenimiento con permisos por empresa, departamento y campo), **fácil sin capacitación** (cualquiera lo usa sin manual) y **control y confianza** (datos sensibles cifrados, auditoría inmutable, nada se borra al dar de baja o archivar).

## Operating Context
Multiempresa: una persona puede ser dueña de una empresa y empleada en otra. Uso diario y repetido; las tareas frecuentes son revisar pendientes, buscar a alguien, abrir un expediente, subir un documento, registrar movimientos o recepciones. Idioma: español de México. Fechas civiles y zona horaria de cada empresa. Moneda MXN con soporte de USD/EUR.

## Capabilities and Constraints
- Funciones y reglas: ver `docs/ARQUITECTURA.md` y `docs/PERMISOS.md`. La navegación depende de módulos activos y permisos efectivos; el empleado básico no ve administración.
- Fuera de alcance: nómina, pagos, CRM, asistencia, obras, tareas.
- Sin servicios externos de fuentes, analítica ni rastreo.

## Brand Commitments
Nombre: EasyWork. Dirección visual vigente aprobada por el usuario (2026-10-06, reemplaza la azul): **marfil, piedra, salvia suave y grafito; lujo discreto, composición precisa y mucha claridad**, con el cuidado de producto que el usuario asocia a Shopify. Pasteles solo en superficies y selecciones; texto y acciones con contraste fuerte. Una sola sans; tema claro. La versión azul anterior queda rechazada.

## Evidence on Hand
Datos de demostración sintéticos (`npm run seed`). No hay clientes, testimonios, cifras de uso ni certificaciones: no deben inventarse.

## Product Principles
1. Lo urgente primero: cada pantalla dice qué requiere atención y lleva a resolverlo.
2. Sin manual: lenguaje de negocio, consecuencias explicadas antes de actuar, nada de jerga técnica.
3. Confianza visible: estado, historial y permisos siempre a la vista; ningún dato se pierde en silencio.
4. Mismo producto en cualquier pantalla: el teléfono no es una versión recortada.

## Accessibility & Inclusion
WCAG 2.2 AA: contraste medido, teclado completo, foco visible, lectores de pantalla, zoom al 200 %, objetivos táctiles cómodos y estados que no dependan solo del color.
