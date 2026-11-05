# STO · Sistema de Turnos Odontológicos

Aplicación web para que una odontóloga gestione turnos, pacientes, historial de trabajos y cobros.

- Documentación técnica: [docs/DOCUMENTACION_TECNICA.md](docs/DOCUMENTACION_TECNICA.md)
- Diseño de la interfaz: [docs/diseno/DESIGN.md](docs/diseno/DESIGN.md) y [docs/diseno/ACCESIBILIDAD.md](docs/diseno/ACCESIBILIDAD.md)

Stack: Next.js (App Router) en Vercel Hobby, PostgreSQL en Neon Free, Drizzle ORM, Tailwind v4 con los tokens de diseño, `husky` en lugar de CI.

## Estado

Fase 0 (cimientos): ingreso con email y clave, sesiones con cierre a los 30 minutos de inactividad, permisos por rol, auditoría inalterable, esquema base con la restricción que impide turnos superpuestos, y los scripts de respaldo y restauración.

Fase 1 (agenda):
- **Pacientes:** alta, edición y búsqueda sin importar tildes; alerta de posibles duplicados (mismo documento, que no se puede repetir, o nombre muy parecido, que pide confirmar).
- **Horario laboral y bloqueos** (menú Configuración): hasta dos franjas por día; bloqueos puntuales (vacaciones) o semanales (almuerzo). Un bloqueo que cae sobre turnos ya dados pide confirmación y no los cancela.
- **Agenda semanal y turnos:** dar, mover, marcar atendido o ausente, liberar el horario de una ausencia y cancelar con motivo. La base impide la superposición aun con dos pedidos simultáneos; los bloqueos son un error, y salir del horario laboral pide confirmar.
- Todo queda en la auditoría.

Fase 2 (historial clínico, desde el paciente → "Ver historial clínico"; solo con permiso clínico, la secretaria no lo ve):
- **Trabajos con versiones:** al corregir un trabajo se ve primero qué cambia y se guarda como versión nueva; la anterior queda en el "Registro de cambios" y la base impide modificarla o borrarla. Eliminar solo oculta el trabajo, con motivo.
- **Odontograma y ficha por diente:** mapa de piezas con numeración FDI (permanentes y temporarias); al elegir una pieza se ve todo lo que se le hizo.
- **Atendidos sin trabajo:** la agenda lista los turnos atendidos que todavía no tienen trabajo registrado.
- Leer una historia clínica queda en la auditoría. 
Fase 3 (cobros y reportes):
- Desde el paciente → "Ver la cuenta": cargos, cobros parciales o totales, pagos a cuenta y saldo. El cargo de un trabajo se genera desde el trabajo; la ausencia se puede cobrar desde el turno.
- Un cobro no se borra: se anula con otra fila negativa, con motivo y usuario. Un cargo anulado queda tachado. La base impide cobrar de más o aplicar un cobro a un cargo ajeno.
- "Cobros": pacientes que deben y pacientes con saldo a favor. "Reportes": resumen mensual por profesional (lo cargado, lo cobrado por medio, atención y deuda de hoy). La secretaria registra cobros pero no anula ni ve reportes.
- Pendiente para más adelante: huecos libres sugeridos (RF-26).

## Cómo correrlo en tu PC

Por ahora se trabaja todo en local, sin Neon ni Vercel. Necesitás Node 22 o más nuevo y Docker (o un Postgres 16+ propio con `btree_gist` y `pg_trgm`).

```bash
npm install          # también instala los ganchos de husky
npm run db:local     # enciende Postgres, crea la base, migra y carga datos de prueba
npm run dev          # http://localhost:3000
```

Ingresá con `doctora@ejemplo.test` (profesional) o `secretaria@ejemplo.test`; la clave de ambos es `clave-de-prueba-123`. Son datos inventados y solo existen en tu PC.

| Comando | Qué hace |
| --- | --- |
| `npm run db:local` | Deja todo listo. Se puede repetir: no pisa nada. Si ya hay un Postgres en la URL de `.env.local` lo usa y no toca Docker; si no, corre `docker compose up -d --wait`. Crea `.env.local` si falta. |
| `npm run db:semilla` | Carga los datos de prueba si todavía no están (12 pacientes, 13 turnos y 3 trabajos clínicos). |
| `npm run db:reiniciar` | Borra la base local y la rearma desde cero, con datos de prueba. |
| `npm run db:detener` | Apaga el Postgres de Docker; los datos se conservan. |
| `npm run db:migrar` | Solo aplica migraciones nuevas. |

Estos comandos se niegan a trabajar si `DATABASE_URL` apunta a otro equipo (por ejemplo Neon), para no borrar una base real por error.

Para tus propios usuarios: `npm run crear-usuario -- --email vos@ejemplo.com --nombre "Dra. Ana" --matricula 1234` (pide la clave por teclado, mínimo 12 caracteres). Si la olvidás: `npm run reiniciar-clave -- --email vos@ejemplo.com`. No hay registro público ni recuperación por email.

## Pruebas y ganchos

| Comando | Qué hace |
| --- | --- |
| `npm test` | Pruebas unitarias (reglas de sesión, permisos). No necesitan base. |
| `npm run test:db` | Pruebas contra Postgres: solapamientos, auditoría inalterable, restricciones. Crean y borran una base temporal en el servidor de `TEST_DATABASE_URL`. |
| `npm run lint` · `npm run tipos` | ESLint y TypeScript. |

`husky` corre `lint`, `tipos`, `test` y un chequeo de secretos antes de cada commit, y `test:db`, `npm audit` y `build` antes de cada push (hace falta la base local encendida: `npm run db:local`). Se pueden saltear con `--no-verify` o `HUSKY=0`; sin CI, la última barrera es el build de Vercel.

## Despliegue (pendiente: se hará cuando se decida salir de local)

1. Crear el proyecto en Neon (región São Paulo si el plan Free la permite; no se puede cambiar después) y una rama `pruebas` **antes** de cargar pacientes reales.
2. En Vercel, importar este repositorio y cargar `DATABASE_URL` (conexión agrupada) y `DATABASE_URL_DIRECT` (conexión directa) en cada entorno: producción con la rama principal de Neon, preview con la rama `pruebas`.
3. El comando de build es `npm run vercel-build`: aplica las migraciones y después compila. Si una migración falla, el build falla y producción sigue como estaba.
4. Crear el primer usuario desde tu PC con `DATABASE_URL_DIRECT` apuntando a producción.

## Respaldos

`npm run respaldo` hace un `pg_dump`, lo cifra con `age` y guarda 35 días de copias. Programalo con el Programador de tareas de Windows o con `cron`. Necesita `.env.respaldo` (ver `.env.example`), `pg_dump` y `age` instalados. Para restaurar y verificar: [sección 8 de la documentación](docs/DOCUMENTACION_TECNICA.md) y `npm run verificar-restauracion`.

## Diferencias con la documentación técnica

- Las migraciones son archivos SQL aplicados por `scripts/migrar.mjs` (con registro en `_migraciones`) y no por `drizzle-kit`, porque las restricciones de exclusión y los triggers se escriben a mano. `src/server/db/esquema.ts` es el espejo tipado.
- Se instaló Next.js 16 (la documentación decía "15 o más nuevo").
- El chequeo de secretos del `pre-commit` rechaza `.env*` y conexiones `postgres://` con clave hacia hosts remotos; permite `localhost` y los marcadores de ejemplo.
- Las reglas de permisos y el rol `sto_app` de mínimos privilegios todavía no están: hoy la inalterabilidad de la auditoría se garantiza con triggers, que valen para cualquier rol.
