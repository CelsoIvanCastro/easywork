---
name: EasyWork
description: Estudio en marfil y piedra — sobrio, cálido y fácil de usar para administrar una empresa
colors:
  bg: "#f6f5f1"
  surface: "#ffffff"
  nav: "#efeee8"
  stone-2: "#e9e8e1"
  sand: "#f0e8da"
  text: "#252a27"
  text-2: "#626962"
  placeholder: "#6f756d"
  divider: "#deded5"
  control-line: "#858c82"
  primary: "#303d35"
  primary-hover: "#243229"
  primary-active: "#1b2620"
  select: "#e5ece1"
  ink: "#426247"
  ink-hover: "#33503a"
  ok: "#2e6b43"
  ok-bg: "#e3efe4"
  warn: "#7a4e0e"
  warn-bg: "#f5ead3"
  bad: "#a0342a"
  bad-bg: "#f6e2de"
  info: "#3e5468"
  info-bg: "#e6ebee"
typography:
  hero: { fontFamily: "system-ui stack", fontSize: "2.125rem", fontWeight: 600, letterSpacing: "-0.015em" }
  title: { fontFamily: "system-ui stack", fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.015em" }
  section: { fontFamily: "system-ui stack", fontSize: "1.125rem", fontWeight: 600 }
  body: { fontFamily: "system-ui stack", fontSize: "0.9375rem (1rem en táctil)", fontWeight: 400, lineHeight: 1.55 }
  label: { fontFamily: "system-ui stack", fontSize: "0.875rem", fontWeight: 500 }
  meta: { fontFamily: "system-ui stack", fontSize: "0.8125rem", fontWeight: 500 }
rounded:
  control: "9px"
  panel: "14px"
  pill: "999px"
spacing: { s1: "4px", s2: "8px", s3: "12px", s4: "16px", s5: "24px", s6: "32px", s7: "48px", s8: "64px" }
sizes: { control: "44px", cta: "48px", sidebar: "240px", auth-panel: "420px" }
motion: { duration: "160ms", ease: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
components:
  button-primary: { backgroundColor: "{colors.primary}", textColor: "#fff", rounded: "{rounded.control}", height: "44px" }
  button-cta: { extends: button-primary, height: "48px", width: "100%" }
  button-secondary: { backgroundColor: "{colors.surface}", textColor: "{colors.text}", border: "{colors.divider}" }
  button-subtle: { backgroundColor: "transparent", textColor: "{colors.ink}", hover: "{colors.select}" }
  button-danger: { backgroundColor: "{colors.surface}", textColor: "{colors.bad}", hover: "fill {colors.bad}" }
  input: { backgroundColor: "{colors.surface}", border: "{colors.control-line}", rounded: "{rounded.control}", height: "44px" }
  nav-item-current: { backgroundColor: "{colors.select}", textColor: "{colors.text}", weight: 600 }
  folio: { backgroundColor: "{colors.sand}", textColor: "{colors.text}", typography: "{typography.meta}" }
  panel: { backgroundColor: "{colors.surface}", border: "{colors.divider}", rounded: "{rounded.panel}", padding: "24px" }
---

## Overview

EasyWork se ve como un estudio bien llevado: papel marfil sobre piedra clara, grafito verdoso para lo que se decide y salvia suave para lo que está seleccionado. Sustituye por completo la dirección azul anterior (rechazada). Producto operativo (modo Operate): familiaridad antes que sorpresa; el acabado premium vive en proporciones, espacio y contención, no en decoración.

- Paleta cálida y restringida: neutros marfil/piedra, un grafito como única acción, salvia solo para selección y enlaces.
- Un CSS (`src/app/globals.css`) para web, escritorio (Tauri) y móvil (Capacitor). Los componentes de acceso (`src/lib/ui/auth.tsx`) son compartidos.

## Colors

- **Grafito** `#303d35` (hover `#243229`, activo `#1b2620`): botón primario. Nunca para decorar.
- **Salvia** `#e5ece1`: elemento de navegación actual, hover de botón sutil, mensaje del usuario en IA. **Tinta salvia** `#426247`: enlaces, botones sutiles y anillo de foco.
- **Marfil** `#f6f5f1` fondo; **papel** `#fff` superficies; **piedra** `#efeee8` barra lateral y panel lateral de acceso; **arena** `#f0e8da` folios.
- Texto `#252a27` (13.4:1 sobre marfil); secundario `#626962` (≥ 4.6:1 sobre marfil, piedra y salvia); borde de control `#858c82` (≥ 3:1).
- Estados con texto siempre: ok `#2e6b43`, aviso `#7a4e0e`, crítico `#a0342a`, info `#3e5468`, cada uno con fondo y borde suaves.

## Typography

Pila del sistema. Títulos 600 con `-0.015em`; cuerpo 15px (16px en táctil para evitar zoom de iOS); etiquetas 14/500 persistentes encima del campo; números tabulares en datos y folios.

## Layout

- **Acceso** (`.auth-shell`): ≥ 980px dos columnas — panel de piedra con marca, frase y figura lineal; formulario de 420px en papel. < 980px una columna, sin panel lateral. Jerarquía fija: título → campos (24px entre sí) → CTA de bloque 48px → divisor → acción alternativa (“Crear cuenta” secundario / “Entrar” sutil) → enlaces legales. Nunca dos botones del mismo peso juntos.
- **Empresa**: barra lateral de 240px (marca, empresa + rol + “Cambiar de empresa”, grupos) con línea divisoria a toda altura; cabecera con búsqueda, alertas y cuenta; contenido hasta 1240px. < 980px barra inferior con 3 destinos + “Más”.
- **Páginas sueltas** (`.standalone`: Mis empresas, Mi cuenta): marca arriba, la lista principal primero; crear/unirse plegados en `.choices` (`details.choice`), abiertos solo si no hay empresas.
- Tablas `.stackable` → fichas etiqueta/valor en < 640px. Espaciado base 4.

## Elevation & Shapes

Paneles: borde `#deded5` + sombra mínima. Flotantes (panel “Más”, avisos): sombra amplia suave. Controles 9px, paneles 14px, insignias en píldora con punto de color.

## Components

- **Botones**: primario grafito 44px; CTA de bloque 48px con spinner y `aria-busy`; secundario papel con borde; sutil sin borde en tinta salvia; peligro con borde rojizo que se rellena al pasar.
- **Contraseña**: botón de mostrar/ocultar con `aria-pressed` y etiqueta accesible; enlace “¿Olvidaste tu contraseña?” alineado con la etiqueta.
- **Agenda / listas**: un panel con filas de 60px mín.: insignia, título y meta, chevron.
- **Completitud**: casilla por sección con “n de m”, barra y detalle desplegable.
- **Foco**: anillo doble (papel 2px + tinta salvia 4px) en todo lo interactivo.

## Do's and Don'ts

- **Haz**: una acción principal por vista; alternativas separadas por divisor y con menos peso; texto en cada estado; folio visible.
- **No**: azul; etiquetas en mayúsculas sobre títulos; degradados en texto; glass; bordes laterales de color; tarjeta dentro de tarjeta; transiciones de más de 200ms; colores escritos a mano fuera de los tokens.
