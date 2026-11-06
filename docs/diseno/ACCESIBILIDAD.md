# Accesibilidad del sistema Mintlify (tema claro)

Contraste calculado con la fórmula de WCAG 2.1 el 2026-11-06. Objetivo del producto: RNF-22 (texto 4,5:1), RNF-23 (áreas táctiles de 44 × 44 px), RNF-24 (el color no es el único indicador).

## Texto sobre Canvas `#ffffff` y Surface `#f7f7f7`

| Color | Sobre Canvas | Sobre Surface | Uso permitido para texto |
| --- | --- | --- | --- |
| ink `#0a0a0a` | 19,80 | 18,48 | Sí |
| charcoal `#1c1c1e` | 17,01 | 15,88 | Sí |
| slate `#3a3a3c` | 11,35 | 10,59 | Sí |
| steel `#5a5a5c` | 6,88 | 6,42 | Sí: texto secundario |
| success-text `#0b7a58` | 5,33 | 4,98 | Sí (derivado) |
| danger-text `#b83a3a` | 5,67 | 5,29 | Sí (derivado) |
| warn-text `#8a5600` | 6,16 | 5,75 | Sí (derivado) |
| tag-text `#2a5db0` | 6,38 | 5,96 | Sí (derivado) |
| brand-tag `#3772cf` | 4,70 | 4,38 | Solo bordes y fondos; como texto, usar tag-text |
| stone `#888888` | 3,54 | 3,31 | **No** como texto; sí para bordes de controles (3:1) |
| brand-annotate `#1ba673` | 3,11 | 2,90 | **No** como texto |
| brand-error `#d45656` | 3,99 | 3,72 | **No** como texto |
| brand-warn `#c37d0d` | 3,35 | 3,13 | **No** como texto |
| brand-green `#00d4a4` | 1,92 | 1,79 | **No** como texto ni como único borde de foco |
| muted `#a8a8aa` | 2,37 | 2,22 | **No**; solo elementos deshabilitados |

Texto `ink` sobre brand-green: 10,33. Sobre brand-green-deep: 7,44. Por eso todo botón o etiqueta con fondo verde lleva texto negro, nunca blanco. Blanco sobre `primary`: 19,80.

Los `brand-*` de error, advertencia y éxito del original no alcanzan 4,5:1 como texto sobre blanco. Se agregaron los derivados `danger-text`, `warn-text`, `success-text` y `tag-text`, que sí lo cumplen.

## Bordes y foco (WCAG 1.4.11 pide 3:1)

- Hairline (1,26) y hairline-soft son decorativos: bordes de tarjetas y separadores de filas.
- Borde de `input`, `select`, `textarea` y botón secundario: `stone` (3,54).
- Foco: contorno de 2 px en `ink` (19,80) con 2 px de separación, en todos los controles. Los campos además cambian el borde a `brand-green`; el verde solo acompaña, no es el indicador de foco.

## Otras reglas

- Áreas táctiles: botones y enlaces de navegación con `min-height` y `min-width` de 44 px en pantallas táctiles (`.objetivo-tactil`).
- Estados: turnos con texto e ícono (Programado, Atendido, Ausente, Cancelado); errores con ícono y mensaje; sección activa con `aria-current`, peso 500 y fondo, además de la línea verde.
- Estados de interfaz: enviando (botón deshabilitado con texto "Ingresando…"), error (mensaje con `role="alert"`), éxito (`role="status"`), vacío (mensaje explicativo), deshabilitado, foco y hover/presionado.
- Acento verde: como máximo un acento por vista, nunca como único portador de información.
- Tema: solo claro. Se agregó `color-scheme: light`.
- Tipografía: Inter variable y Geist Mono variable, autoalojadas con `@fontsource-variable`.
- Movimiento: `prefers-reduced-motion` anula animaciones y transiciones.
