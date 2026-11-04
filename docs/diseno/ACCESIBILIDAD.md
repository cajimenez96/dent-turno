# Ajustes de accesibilidad sobre la paleta Linear

Contraste calculado con la fórmula de WCAG 2.1 el 2026-11-04. Objetivo del producto: RNF-22 (texto 4,5:1), RNF-23 (áreas táctiles de 44 × 44 px), RNF-24 (el color no es el único indicador).

## Texto sobre Carbon `#0f1011` (tarjetas) y Void `#08090a` (fondo)

| Color | Sobre Carbon | Sobre Void | Uso permitido para texto |
| --- | --- | --- | --- |
| paper | 19,05 | 19,93 | Sí |
| bone | 15,13 | 15,83 | Sí |
| mist | 13,04 | 13,64 | Sí |
| fog | 5,86 | 6,13 | Sí: texto secundario |
| acid-lime | 15,44 | 16,15 | Sí |
| teal | 7,92 | 8,29 | Sí |
| green | 6,01 | 6,29 | Sí |
| coral-red | 5,47 | 5,73 | Sí |
| lavender | 4,50 | 4,71 | Justo en el límite: solo texto de 16 px o más |
| iris-violet | 4,26 | 4,46 | **No** como texto; solo decorativo o con fondo propio |
| ash | 3,30 | 3,45 | **No** como texto; solo decorativo o texto deshabilitado |

Texto Void sobre Acid Lime: 16,15. Papel sobre iris-violet como fondo: 4,47 (no alcanza para texto pequeño).

## Bordes de controles (WCAG 1.4.11 pide 3:1)

Graphite (1,24) y Smoke (1,69) sobre Carbon **no alcanzan** para el borde de un campo o un botón secundario. Regla:

- Separadores y bordes de tarjetas: Graphite, como indica DESIGN.md (son decorativos).
- Borde de `input`, `select`, `textarea` y botón Ghost: Ash (3,30) o Fog (5,86). El foco sube a Mist, más un contorno de 2 px.

## Otras reglas

- Áreas táctiles: el botón primario de DESIGN.md (10 × 16 px de relleno) queda de unos 36–40 px de alto. En pantallas táctiles se fuerza `min-height: 44px` y `min-width: 44px`.
- Estados de turno: cada estado lleva etiqueta de texto y un ícono además del color (Programado, Atendido, Ausente, Cancelado).
- Acid Lime una vez por vista: en la agenda es "Nuevo turno"; en la ficha del paciente, "Registrar trabajo".
- Tema: solo oscuro. Confirmar con la doctora si lo quiere así para uso diurno en consultorio; si no, se agrega un tema claro con los mismos tokens.
- Tipografía: Inter Variable sale de Google Fonts o se autoaloja (`next/font`). Berkeley Mono es de pago: se reemplaza por JetBrains Mono, que ya figura como alternativa en la variable `--linear-mono`.
