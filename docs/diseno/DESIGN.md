# Mintlify · Guía de estilo de STO

> **Tema:** claro · **Voz:** documentación sobria, de alto contraste, con un solo acento verde.

Adaptación del sistema de diseño de [Mintlify](https://www.mintlify.com/) (referencia vigente: el sitio oficial) para una aplicación interna. Reemplaza la guía anterior estilo Linear (oscura, Acid Lime). Inter para la interfaz, Geist Mono para datos y horarios, botones primarios negros en forma de píldora, bordes finos (hairline) en lugar de sombras y el verde de marca solo como acento.

**Alcance:** se usan los tokens y componentes que aplican a una app (botones, campos, tarjetas, pestañas, etiquetas, tablas, navegación y estados). Quedan fuera los de marketing: bandas hero con cielo, testimonios, tarjetas de precios, comparativas, muro de logos, banner promocional. Sus tokens (`hero-*`, `testimonial-*`) no se cargan en el código.

Los valores viven en `theme.css` (Tailwind v4), `variables.css` y `design-tokens.json`, generados desde la misma lista. Reglas de contraste: `ACCESIBILIDAD.md`.

## Colores

| Token | Valor | Uso |
| --- | --- | --- |
| `primary` / `ink` | `#0a0a0a` | Texto principal, botón primario, foco |
| `on-primary` | `#ffffff` | Texto sobre botón primario |
| `canvas` | `#ffffff` | Fondo de página, tarjetas, campos |
| `surface` / `surface-soft` | `#f7f7f7` / `#fafafa` | Hover de filas, nav activa, paneles |
| `hairline` / `hairline-soft` | `#e5e5e5` / `#ededed` | Bordes de tarjetas y separadores (decorativos) |
| `charcoal` | `#1c1c1e` | Botón primario presionado o con hover |
| `slate` / `steel` | `#3a3a3c` / `#5a5a5c` | Texto secundario (steel: mínimo permitido para texto de apoyo) |
| `stone` | `#888888` | Borde de campos y botones secundarios (3,54:1) |
| `muted` | `#a8a8aa` | Solo elementos deshabilitados |
| `brand-green` | `#00d4a4` | Acento: indicador de sección activa, borde de campo enfocado. **Nunca como color de texto** |
| `brand-green-deep` / `-soft` | `#00b48a` / `#7cebcb` | Variantes del acento; tampoco para texto |
| `brand-tag` | `#3772cf` | Borde de avisos que piden confirmación |
| `danger-text` | `#b83a3a` | Derivado AA: errores y acciones destructivas |
| `success-text` | `#0b7a58` | Derivado AA: confirmaciones |
| `warn-text` | `#8a5600` | Derivado AA: advertencias |
| `tag-text` | `#2a5db0` | Derivado AA: etiquetas informativas |
| `brand-error`, `brand-warn`, `brand-annotate` | `#d45656`, `#c37d0d`, `#1ba673` | Del original; no llegan a 4,5:1 como texto sobre blanco, por eso hay derivados |
| `surface-code`, `on-dark*`, `canvas-dark`, `hairline-dark` | — | Bloques oscuros (código); no se usan hoy |

Los derivados `*-text` no existen en Mintlify: se agregaron para cumplir WCAG AA.

## Tipografía

Inter (variable) para la interfaz; Geist Mono para horarios, piezas dentales y datos técnicos. Pesos 400, 500, 600.

| Rol | Tamaño / interlineado | Uso |
| --- | --- | --- |
| heading-3 | 28 / 1,25, 600 | Título de pantalla de ingreso |
| heading-4 | 22 / 1,3, 600 | Título de página |
| body-md | 16 / 1,5 | Texto largo |
| body-sm | 14 / 1,5 | Texto de interfaz, botones (500) |
| caption | 13 / 1,4 | Etiquetas de campo, ayudas, errores |
| micro-uppercase | 11 / 1,4, 0,5 px | Encabezados de sección en mayúsculas |
| code-sm / code-md | 13–14 / 1,4–1,5 | Geist Mono |

## Espaciado y formas

Espaciado: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 y 96 px. Radios: 4 (`xs`), 6 (`sm`), 8 (`md`: campos, ghost), 12 (`lg`: tarjetas), 16, 24 y píldora (`full`: botones). Relleno de tarjeta 20–24 px; ancho máximo de contenido 1200 px.

## Componentes

- **Botón primario:** fondo `primary`, texto `on-primary`, píldora, relleno 10 × 20 px, hover `charcoal`. Deshabilitado o enviando: opacidad reducida y cursor de espera.
- **Botón secundario:** transparente, borde `stone` (el original usa hairline; no alcanza 3:1), texto `ink`, píldora, hover `surface`.
- **Botón peligroso:** borde y texto `danger-text`.
- **Ghost / enlace:** sin fondo; el enlace va subrayado.
- **Acento verde (`brand-green`):** botón de acento solo con texto negro encima (10,3:1). Hoy se usa como línea de la sección activa y como borde de campo enfocado, siempre junto a otro indicador.
- **Campo:** fondo `canvas`, borde `stone`, radio 8, alto mínimo 40 (44 en pantallas táctiles). Foco: borde `brand-green` más contorno `ink` de 2 px. Error: borde `danger-text` con texto e ícono.
- **Tarjeta:** `canvas`, borde `hairline`, radio 12, relleno 20–24. Sin sombras.
- **Navegación principal:** ítems 14 px `steel`; activo con fondo `surface`, texto `ink` en peso 500, `aria-current="page"` y línea `brand-green` de 2 px.
- **Etiqueta de estado:** texto + ícono + color; nunca solo color.
- **Fila de lista / tabla:** separador `hairline`, hover `surface`.
- **Aviso que pide confirmación:** borde `brand-tag`, fondo `surface`.

## Qué hacer y qué no

- Usar `primary` para la acción principal de cada vista y mantener `canvas` como fondo.
- No usar colores fuera de los tokens; los derivados `*-text` están documentados arriba.
- No usar `brand-green` como color de texto ni como único indicador de estado.
- Separar superficies con hairline, no con sombras.
