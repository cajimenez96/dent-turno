# STO · Documentación técnica v0.1

Versión 0.1 · 2026-11-04 · Carlos Jimenez

## Resumen de decisiones

El STO es una sola aplicación Next.js en Vercel Hobby con PostgreSQL en Neon Free, y no cuesta nada. Un proyecto propio no se rige por requisitos legales, así que se sacaron del diseño los pasos legales y los adjuntos, y se mantuvieron los controles técnicos que el producto pide (auditoría, sin borrado, acceso restringido). La regla "no hay turnos superpuestos" la garantiza la propia base de datos.

| Decisión | Elección | Motivo principal |
| --- | --- | --- |
| Tipo de base | Relacional (PostgreSQL) | Restricción de exclusión para solapamientos, transacciones para cobros y saldos, reportes con SQL |
| Proveedor | Neon Free | No pausa el proyecto por inactividad y da 1 GB; Supabase Free pausa tras 1 semana y no tiene respaldos |
| App | Next.js (App Router) en Vercel Hobby | Stack pedido, sin costo |
| Acceso a datos | Solo desde el servidor (Server Actions), con Drizzle ORM | Un único lugar donde se controlan permisos y auditoría |
| Autenticación | Propia y mínima: usuarios + sesiones en la base, hash `argon2id` | Permite la expiración por inactividad sin pagar un plan, y no depende de otro servicio |
| Datos clínicos | Tablas separadas de las administrativas, con versiones inmutables | La secretaria futura se habilita por permisos, sin migrar datos |
| Calidad de código | `husky`: chequeos antes de commitear y de pushear; sin GitHub Actions | Sin costo y sin depender de CI |
| Entornos | Local con Docker; pruebas con una rama de Neon + Vercel Preview | Todo gratuito; datos ficticios fuera de producción |
| Respaldos | Script propio diario desde tu PC, cifrado, con 35 días de copias | Neon Free solo conserva 6 horas de historial |
| Adjuntos | Fuera del MVP | Se agregan después, ver sección 10 |
| Costo | USD 0 por mes (dominio propio opcional) | Planes gratuitos verificados el 2026-11-04 |

Lo que se pierde por ir gratis: no hay respaldo en la nube garantizado (depende de que tu PC esté encendida), no hay SLA, la primera consulta tras 5 minutos de inactividad es más lenta, y los planes gratuitos pueden cambiar sus límites.

## 1. Arquitectura

Es un monolito Next.js: una sola aplicación, un solo repositorio y un solo despliegue. Para un usuario y un mantenedor, separar frontend, API y servicios agrega costo sin beneficio.

```
Navegador (celular, tablet o PC)
   |  HTTPS
   v
Vercel Hobby (gratis)
   Next.js (pantallas)
   Server Actions: 1) sesión y permiso  2) validación  3) auditoría y escritura
   |  SQL (TLS)
   v
Neon Free (gratis) - PostgreSQL
   datos administrativos | datos clínicos | auditoría (solo agregar) | usuarios y sesiones

Tu PC: respaldo diario (pg_dump cifrado con age) a disco externo o nube personal
```

Todo el acceso a los datos pasa por las Server Actions; el navegador nunca habla con la base.

El navegador nunca habla con la base de datos. Todo pasa por Server Actions, que verifican sesión y permiso, validan y escriben la auditoría en la misma transacción. Como no hay adjuntos en el MVP, no hace falta ningún otro servicio: dos piezas gratuitas más tu PC para el respaldo.

**Piezas y responsabilidades**

- **Next.js 15+ (App Router, TypeScript).** Pantallas con React Server Components; mutaciones con Server Actions; Route Handlers solo para `/api/salud` y, más adelante, exportaciones.
- **Drizzle ORM + drizzle-kit.** Esquema en TypeScript y migraciones versionadas en el repositorio. Permite SQL crudo donde hace falta (restricción de exclusión, triggers).
- **Driver de Neon con WebSocket (`@neondatabase/serverless`, `Pool`).** Las acciones necesitan transacciones interactivas (bloqueo, verificación e inserción), que el modo HTTP de Neon no ofrece. Para migraciones se usa la conexión directa, no la agrupada.
- **Zod.** Un esquema por acción, compartido entre formulario y servidor.
- **UI.** Tailwind CSS + componentes accesibles (Radix / shadcn/ui), para cumplir foco, teclado y contraste (RNF-22 a 24) sin construirlos a mano.
- **Fechas.** Se guardan en UTC (`timestamptz`) y se muestran en `America/Argentina/Buenos_Aires`; la conversión vive en un único módulo `lib/tiempo.ts` (RNF-26).
- **Calidad.** Vitest para pruebas, ESLint y `tsc`, ejecutados por `husky` (sección 9).

**Estructura del repositorio**

```
app/            rutas: ingresar/, agenda/, pacientes/[id]/, cobros/, reportes/, configuracion/
server/
  acciones/     Server Actions por módulo (turnos.ts, trabajos.ts, cobros.ts…)
  auth/         hash, sesiones, expiración por inactividad
  permisos.ts   exigir(usuario, permiso, recurso)
  auditoria.ts  registrar(evento) dentro de la transacción
  db/           esquema Drizzle, migraciones, SQL de restricciones y triggers
lib/            tiempo.ts, dinero.ts, fdi.ts (piezas dentarias)
scripts/        respaldo.mjs, restaurar.mjs, migrar.mjs
tests/          unitarios y de base de datos (Vitest)
.husky/         pre-commit, pre-push
```

## 2. Base de datos: decisión

Se elige PostgreSQL en Neon Free. Las tres reglas más críticas del producto (sin solapamientos, cobros sin borrado y saldos exactos, registro de cambios inalterable) son garantías nativas de una base relacional y en NoSQL habría que programarlas a mano.

| Criterio | PostgreSQL | NoSQL (Firestore, MongoDB Atlas, DynamoDB) |
| --- | --- | --- |
| Sin turnos superpuestos (RF-22) | Restricción `EXCLUDE` con rangos de tiempo: la base rechaza el segundo turno aunque lleguen dos pedidos a la vez | No hay restricción por rango; hay que leer, comparar y escribir en una transacción propia, con riesgo de carrera |
| Cobros y saldos (RF-40 a 44) | Transacciones ACID, `numeric` exacto, saldos por suma o vista | Posible, pero con desnormalización y contadores que pueden desalinearse |
| Registro de cambios (RF-35) | Tabla de versiones con permisos que prohíben `UPDATE` y `DELETE` | Depende de reglas de la app; más fácil de romper |
| Reportes mensuales (RF-50) | Un `GROUP BY` | Agregaciones o índices especiales por cada reporte |
| Roles y separación clínica (RNF-40/41) | Claves foráneas + tablas separadas | Documentos anidados mezclan datos clínicos y administrativos |
| Esquema flexible | Columnas `jsonb` donde haga falta (ficha por diente) | Punto a favor, pero aquí el dominio es estable |

NoSQL se descarta porque su ventaja (escala horizontal y esquema libre) no aplica a un consultorio y sus costos caen justo en las reglas críticas.

### Proveedor gratuito: Neon frente a Supabase

Los dos tienen plan gratuito con Postgres. Gana **Neon** porque no pausa el proyecto por inactividad, y un consultorio puede quedar una semana cerrada. Como los adjuntos salieron del MVP, tampoco se necesita lo que Supabase suma (archivos, login).

|  | Neon Free | Supabase Free |
| --- | --- | --- |
| Pausa por inactividad | No pausa; el cómputo se apaga tras 5 minutos sin uso y arranca con la siguiente consulta ([Neon](https://neon.com/pricing)) | Pausa tras 1 semana de poca actividad; se reactiva a mano, y se puede restaurar hasta 1 año después ([Supabase](https://supabase.com/docs/guides/platform/free-project-pausing)) |
| Almacenamiento | 1 GB por proyecto | 500 MB |
| Respaldos | Historial de 6 horas, sin restauración instantánea | No incluidos ([precios](https://supabase.com/pricing)) |
| Ramas para pruebas | Hasta 10 por proyecto | No evaluado |
| Login incluido | No (propio, sección 6) | Sí, pero el cierre por inactividad es solo de plan Pro ([docs](https://supabase.com/docs/guides/auth/sessions)) |
| Región São Paulo | Existe (`aws-sa-east-1`, [regiones](https://neon.com/docs/introduction/regions)); falta confirmar que el plan Free la permita | Existe (`sa-east-1`, [regiones](https://supabase.com/docs/guides/platform/regions)) |
| Precio | USD 0 | USD 0 |

**Riesgos de Neon Free, y qué se hace:**

- **Primera consulta lenta tras inactividad.** No se midió cuánto. La pantalla de ingreso dispara una consulta liviana al cargarse, para que la base ya esté despierta cuando la doctora termina de escribir su clave. Se mide contra RNF-30 (2 s).
- **Límite de cómputo.** El plan incluye 100 CU-hours por proyecto, y si se agota el cómputo se suspende hasta el siguiente período de facturación. Se revisa el consumo en el panel de Neon durante el primer mes; con un solo usuario y apagado automático no debería acercarse, pero no está medido.
- **La región no se cambia después de crear el proyecto.** Se elige al crearlo: São Paulo si Free lo permite; si no, la más cercana disponible, y las funciones de Vercel se alinean con ella.
- **Los planes gratuitos cambian.** Todo el acceso pasa por Drizzle y Postgres estándar, así que migrar a Supabase, a otro Postgres o al VPS con Coolify que ya contemplaste es un `pg_dump` / `pg_restore`.

**Regla:** se usa Neon solo como Postgres estándar, sin funciones propias de la plataforma, para poder mudarse sin reescribir nada.

## 3. Modelo de datos

El modelo se divide en cuatro dominios: identidad, administrativo, clínico y auditoría. Todo turno, cargo, cobro y trabajo referencia a un `profesional_id` (RNF-40), y ningún dato clínico vive en una tabla administrativa (RNF-41).

**Convenciones:** claves `uuid`; fechas y horas en `timestamptz` (UTC); dinero en `numeric(12,2)` en pesos, sin decimales flotantes; nada se borra físicamente, se usa `anulado_at` / `eliminado_at` con motivo; toda tabla tiene `creado_por` y `creado_at`.

### Identidad y configuración

| Tabla | Campos principales | Notas |
| --- | --- | --- |
| `profesionales` | nombre, matrícula, contacto, `duracion_minima_min` (60), `paso_min` (30), activo | Hoy una fila. Configuración de agenda por profesional |
| `usuarios` | email único, nombre, hash de la clave (argon2id), activo, `profesional_id` opcional | Un usuario puede ser o no un profesional |
| `roles` | clave, nombre | Semilla: `profesional`, `secretaria`. Datos, no código (RNF-43) |
| `rol_permisos` | rol, permiso | Los permisos son una lista fija en código (sec. 6); qué rol tiene cuáles es configurable |
| `asignaciones` | usuario, rol, `profesional_id` (alcance) | "Secretaria de la Dra. X" o "profesional con acceso a la agenda de Y" |
| sesiones | id (hash del token), usuario, creada, última actividad, vence, IP, navegador | El token va en una cookie; en la base solo su hash. La sesión vence a los 30 minutos sin actividad (sección 6) |

### Administrativo

| Tabla | Campos principales | Notas |
| --- | --- | --- |
| `pacientes` | nombre, apellido, tipo y número de documento, teléfono, nacimiento, email, activo | Compartidos por todo el consultorio. DNI único cuando existe. Índice trigram (`pg_trgm`) para buscar por nombre en menos de 1 s (RNF-31) |
| `horarios_laborales` | profesional, día de la semana, hora inicio y fin, vigencia desde/hasta | Varias franjas por día (mañana y tarde) |
| `bloqueos` | profesional, tipo (`puntual` / `semanal`), rango (puntual) o día + horas + vigencia (semanal), motivo, anulado | Vacaciones = puntual de varios días; almuerzo = semanal |
| `turnos` | profesional, paciente, `rango tstzrange`, estado, `horario_liberado` (ausencias), motivo de cancelación, `version` | La restricción de exclusión vive aquí (sec. 4) |
| `servicios` | nombre, precio de referencia, duración sugerida, activo | Catálogo opcional (S-03) |
| `cargos` | profesional, paciente, fecha, concepto administrativo, monto, origen (`trabajo` / `ausencia` / `otro`), `trabajo_id` opcional, anulado | Lo que el paciente debe. Separado del trabajo para que la secretaria cobre sin ver datos clínicos |
| `cobros` | profesional, paciente, fecha, monto (con signo), medio (`efectivo` / `transferencia`), tipo (`cobro` / `anulacion`), `anula_cobro_id` | Solo inserción. La anulación es otra fila con monto negativo |
| `imputaciones` | cobro, cargo, monto | Qué parte de un cobro paga qué cargo. Lo no imputado es pago a cuenta |

### Clínico

| Tabla | Campos principales | Notas |
| --- | --- | --- |
| `trabajos` | profesional, paciente, `turno_id` opcional, fecha, `version_actual`, eliminado (con motivo y usuario) | Cabecera estable. La eliminación es solo lógica (RF-37) |
| `trabajo_versiones` | trabajo, número de versión, descripción, `piezas jsonb`, monto informado, editado por, fecha, resumen del cambio | Solo inserción. La versión 1 es el original; la vigente es la mayor (RF-34/35) |

`piezas` guarda una lista como `[{"pieza": "36", "caras": ["O", "M"], "tratamiento": "Restauración"}]`, validada con Zod contra la numeración FDI (permanentes 11 a 48, temporarias 51 a 85). El odontograma del paciente se arma leyendo la versión vigente de cada trabajo; no hace falta otra tabla.

### Auditoría

| Tabla | Campos principales | Notas |
| --- | --- | --- |
| `auditoria` | momento, usuario, acción (`ver`, `crear`, `editar`, `anular`, `descargar`, `ingresar`, `ingreso_fallido`), entidad, id, paciente, profesional, `datos jsonb` (antes y después), IP, navegador | Solo inserción. Registra lecturas de datos clínicos, no solo cambios (RNF-07) |

### Vistas de saldo

- `v_saldo_cargo`: monto del cargo menos lo imputado por cobros no anulados (RF-43, por trabajo).
- `v_saldo_paciente`: suma de cargos vigentes menos suma de cobros con signo (RF-43, por paciente; base de RF-45).

Los saldos se calculan, no se guardan: con el volumen de un consultorio la suma tarda milisegundos y no hay contadores que puedan desalinearse.

## 4. Reglas críticas

Las reglas que no pueden fallar se garantizan en la base de datos; la aplicación solo las explica al usuario. Así un error de código o dos dispositivos guardando a la vez no pueden romperlas.

### 4.1 Sin turnos superpuestos (RF-22)

```sql
create extension if not exists btree_gist;

alter table turnos add constraint turnos_sin_solapamiento
  exclude using gist (profesional_id with =, rango with &&)
  where (estado in ('programado', 'atendido')
         or (estado = 'ausente' and not horario_liberado));
```

- Los rangos son semiabiertos `[inicio, fin)`: un turno de 10:00 a 11:00 y otro de 11:00 a 12:00 no chocan.
- Un turno cancelado o una ausencia con horario liberado dejan de ocupar lugar (S-01).
- Al crear o reprogramar, la acción abre una transacción, toma `pg_advisory_xact_lock` por profesional, verifica bloqueos y horario laboral, e inserta. Si Postgres responde `23P01` (violación de exclusión), la acción busca el turno en conflicto y devuelve un mensaje claro: "Se superpone con el turno de Ana Pérez, de 10:00 a 11:00".
- Los bloqueos no pueden ir en la misma restricción porque los semanales son reglas, no rangos. Se verifican con una función SQL `bloqueos_en(profesional, rango)` que expande los semanales en hora de Buenos Aires. El candado por profesional evita la carrera entre "crear bloqueo" y "crear turno".
- Duración: la acción exige un múltiplo de `paso_min` (30) y como mínimo `duracion_minima_min` (60). La base agrega un control mínimo: `fin > inicio`.
- Al crear un bloqueo que pisa turnos programados, la acción devuelve la lista de afectados y solo guarda si se reenvía con `confirmar = true` (flujo 6.7). Los turnos no se cancelan solos.

### 4.2 Estados del turno (RF-24)

- `programado` pasa a `atendido`, `ausente` o `cancelado`.
- `ausente` puede marcarse como `horario_liberado` (una sola vez, no se revierte).
- Corregir un estado mal cargado (por ejemplo, atendido que era ausente) se permite, queda en auditoría y vuelve a pasar por la restricción.
- Reprogramar (RF-25) cambia el `rango` del mismo turno, solo si está `programado`, con las mismas validaciones.
- La columna `version` evita que dos dispositivos se pisen: el `update` exige la versión que el usuario vio.

### 4.3 Trabajos inalterables (RF-34, RF-35, RF-37)

- Editar = insertar `trabajo_versiones` con el número siguiente y actualizar `trabajos.version_actual`, en una transacción y solo si la versión actual sigue siendo la que se editó.
- El resumen del cambio (flujo 6.5) se calcula en el servidor comparando versiones y se muestra antes de confirmar.
- Doble protección: el rol de la aplicación no tiene permiso `UPDATE` ni `DELETE` sobre `trabajo_versiones`, `auditoria`, `cobros` e `imputaciones`, y un trigger rechaza esas operaciones aunque las intente otro rol.

### 4.4 Cobros y saldos (RF-40 a RF-45)

- Registrar un cobro inserta la fila de `cobros` y sus `imputaciones` en una transacción. Un trigger impide imputar más que el monto del cobro.
- Imputar más que el saldo de un cargo no se permite: el excedente queda como pago a cuenta.
- Anular (RF-44) inserta una fila `anulacion` con el monto en negativo, motivo obligatorio y `anula_cobro_id` único, para que no se anule dos veces. Sus imputaciones dejan de contar.
- Si se cambia el monto de un trabajo ya cobrado (S-05), se actualiza su cargo con auditoría de antes y después. Si lo cobrado supera el nuevo monto, el saldo queda a favor del paciente y se muestra así.
- RF-27 (atendidos sin trabajo) es una consulta: turnos `atendido` sin `trabajos.turno_id` que los referencie.

## 5. API: acciones del servidor

No hay una API REST pública. Las escrituras son Server Actions y las lecturas son funciones de servidor (`server/consultas/*`) llamadas desde las páginas; ambas siguen el mismo esquema: sesión, permiso, validación Zod, transacción con auditoría.

**Contrato de respuesta** de toda acción:

```ts
type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; error: { codigo: CodigoError; mensaje: string; campos?: Record<string, string>; detalle?: unknown } };
// CodigoError: 'NO_AUTENTICADO' | 'SIN_PERMISO' | 'INVALIDO' | 'SOLAPAMIENTO'
//   | 'EN_BLOQUEO' | 'FUERA_DE_HORARIO' | 'REQUIERE_CONFIRMACION' | 'CONFLICTO_VERSION' | 'NO_ENCONTRADO'
```

`mensaje` está escrito para la doctora y dice cómo seguir ("Ese horario ya tiene un turno de Ana Pérez. Elegí otro horario o mové ese turno."). `REQUIERE_CONFIRMACION` devuelve en `detalle` lo que se va a afectar y la UI reenvía con `confirmar: true`.

| Módulo | Acciones | Permiso | Requisitos |
| --- | --- | --- | --- |
| Sesión | `ingresar`, `salir`, `cambiarClave` | público / autenticado | RF-01, RF-02 |
| Configuración | `guardarPerfil`, `guardarHorarioLaboral`, `crearBloqueo`, `anularBloqueo`, `guardarServicio` | `agenda.configurar` | RF-03 a RF-06 |
| Pacientes | `buscarPacientes(texto)`, `posiblesDuplicados(datos)`, `crearPaciente`, `editarPaciente`, `desactivarPaciente` | `pacientes.ver` / `pacientes.editar` | RF-10 a RF-14 |
| Agenda | `agendaDia(fecha)`, `agendaSemana(fecha)`, `huecosLibres(fecha, duracion)` | `agenda.ver` | RF-20, RF-26 |
| Turnos | `crearTurno`, `reprogramarTurno`, `cambiarEstado`, `liberarHorario` | `agenda.editar` | RF-21 a RF-25 |
| Trabajos | `historialPaciente`, `crearTrabajo`, `vistaPreviaCambio`, `editarTrabajo`, `eliminarTrabajo(motivo)`, `versionesTrabajo` | `clinico.ver` / `clinico.editar` | RF-30 a RF-37 |
| Cobros | `cargosPendientes(paciente)`, `registrarCobro`, `anularCobro(motivo)`, `imputarSaldoACuenta`, `pacientesConSaldo` | `cobros.ver` / `cobros.registrar` | RF-40 a RF-45 |
| Reportes | `reporteMensual(profesional, mes, año)` | `reportes.ver` | RF-50, RF-51 |

`agendaDia` y `buscarPacientes` son las dos consultas de rendimiento crítico (RNF-30 y RNF-31): usan índices GiST sobre `rango` y trigram sobre nombre y documento, y deben medirse con datos de prueba de 5 años antes de cada versión.

## 6. Autenticación y permisos

Cada persona entra con su email y contraseña, y cada acción pregunta "¿este usuario tiene este permiso sobre este profesional?". En la v1.0.0 la doctora tiene todos; la secretaria se agrega cargando una fila, sin tocar código.

### Autenticación

- **Login propio y mínimo.** Email y clave contra la tabla `usuarios`. La clave se guarda con `argon2id`, un hash de contraseñas moderno que cumple RNF-02 ("bcrypt o equivalente"); se usa una librería de Node (por ejemplo `@node-rs/argon2`, a confirmar que corre en Vercel Hobby). El sistema nunca guarda la clave.
- **Sesión por cookie.** Al ingresar se genera un token aleatorio de 32 bytes, que viaja en una cookie `httpOnly`, `Secure`, `SameSite=Lax`; en la tabla `sesiones` se guarda solo su hash SHA-256.
- **Expiración por inactividad de 30 minutos** (RF-02, RNF-09). En cada pedido se compara la hora actual con `ultima_actividad`: si pasaron más de 30 minutos, se borra la sesión y se vuelve al ingreso; si no, se actualiza (como mucho una vez por minuto, para no escribir de más). Además hay un límite absoluto de 12 horas. La interfaz avisa a los 28 minutos ("Tu sesión se va a cerrar en 2 minutos. ¿Seguís trabajando?") para no perder un formulario a medio cargar.
- **Sin registro público.** Los usuarios se crean con `npm run crear-usuario` desde tu PC; la pantalla de administración llega en una versión futura (RNF-43). Clave mínima de 12 caracteres.
- **Clave olvidada.** Como no hay servicio de email gratuito evaluado, no hay recuperación por correo: se restablece con `npm run reiniciar-clave` desde tu PC. Un usuario con sesión puede cambiarla con `cambiarClave`.
- **Intentos fallidos.** Cada ingreso fallido se registra en `auditoria`; tras 5 fallidos del mismo email en 15 minutos, se rechaza el ingreso durante 15 minutos.
- **Opcional en una versión futura:** segundo factor TOTP para quien vea datos clínicos.

### Permisos

Los permisos son una lista fija en código; qué rol tiene cuáles se guarda en `rol_permisos`. Matriz inicial:

| Permiso | Profesional | Secretaria (propuesta, a validar) |
| --- | --- | --- |
| `agenda.ver`, `agenda.editar` | Sí | Sí |
| `agenda.configurar` (horarios, bloqueos) | Sí | No |
| `pacientes.ver`, `pacientes.editar` | Sí | Sí |
| `clinico.ver`, `clinico.editar` | Sí, dentro de su alcance | No |
| `cobros.ver`, `cobros.registrar` | Sí | Sí |
| `cobros.anular` | Sí | No |
| `reportes.ver` | Sí | No |
| `usuarios.administrar` | Solo la titular | No |

**Alcance.** Cada asignación tiene un `profesional_id`. Una profesional ve datos clínicos de los trabajos con su `profesional_id`; para ver los de otra, alguien con `usuarios.administrar` crea una asignación `profesional` con ese alcance. Es el "salvo que se habilite" de la sección 4.2 del documento de producto.

**Qué ve la secretaria al cobrar.** Ve cargos con su concepto administrativo ("Prestación del 12/03", o el nombre del servicio) y su saldo, nunca la descripción clínica ni las piezas.

**Implementación.** Un solo módulo `server/permisos.ts` con `exigir(usuario, permiso, { profesionalId })`, llamado al inicio de cada acción y consulta. Un test recorre todas las acciones y falla si alguna no llama a `exigir`.

## 7. Seguridad

La protección se apoya en tres capas: nadie llega a la base salvo el servidor, el servidor controla permisos en un solo lugar, y lo clínico es inalterable y auditado. Todo es gratuito y está en el código.

| Tema | Control | Requisito |
| --- | --- | --- |
| Transporte | HTTPS forzado por Vercel + cabecera HSTS; conexión a Postgres con TLS (`sslmode=require`) | RNF-01 |
| Cabeceras | CSP estricta, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy` mínima | RNF-03 |
| Secretos | Variables de entorno de Vercel, una distinta por entorno; `.env*` fuera de git; el hook `pre-commit` rechaza commits que incluyan `.env*` o cadenas `postgres://` | RNF-03 |
| Base de datos | Rol `sto_app` para la aplicación con permisos mínimos (sin `UPDATE`/`DELETE` en tablas inalterables); rol propietario solo para migraciones | RNF-03, RNF-07 |
| Sesiones | Cookie `httpOnly`, token con hash en la base, cierre a los 30 min de inactividad (sección 6) | RNF-09 |
| Auditoría | Lecturas y cambios clínicos, ingresos, cobros y anulaciones; tabla solo de inserción | RNF-07 |
| Registros de error | Sin datos de pacientes en logs: se registran ids, nunca nombres, DNI ni texto clínico | RNF-03 |
| Dependencias | `npm audit` en el hook `pre-push`; actualización mensual y ante avisos de seguridad de Next.js | RNF-42 |
| Validación | Zod en toda entrada; Drizzle con parámetros (sin SQL concatenado); las Server Actions verifican el origen (protección CSRF incluida en Next.js) | RNF-03 |

### Historia clínica y alcance legal

Por decisión de Carlos, el proyecto no se somete a requisitos legales: quedan fuera el consentimiento registrado, la exportación de datos del paciente, la transferencia internacional y la inscripción de la base (RNF-04 a RNF-06 no tienen implementación propia). Lo que **sí** se mantiene es la integridad técnica de la historia clínica, porque el producto la pide: no hay borrado físico, cada edición crea una versión y se audita quién lee y quién cambia.

Nada del diseño impide sumar lo legal después: el consentimiento sería una columna en `pacientes` y la exportación, una consulta. Ojo con una cosa: son datos de salud de pacientes reales, así que si el sistema lo usa alguien más que la doctora, o se ofrece a otros consultorios, conviene revisar este punto antes.

## 8. Respaldos y restauración

Neon Free solo conserva 6 horas de historial ([Neon](https://neon.com/pricing)), así que el respaldo propio es la única protección real contra pérdida de datos. Es un script que corre cada día en tu PC y guarda copias cifradas durante 35 días.

| Capa | Qué copia | Frecuencia | Retención | Dónde |
| --- | --- | --- | --- | --- |
| Historial de Neon | Cambios de la base | Continuo | 6 horas | Neon. Sirve para deshacer un error reciente, no es un respaldo |
| Respaldo propio | `pg_dump` completo de la base | Diaria | 35 días | Carpeta en tu PC + segunda copia en un disco externo o en una nube personal gratuita, a elegir |

**Cómo funciona.** `npm run respaldo` se conecta a Neon con un rol de solo lectura (`sto_respaldo`), ejecuta `pg_dump --format=custom`, cifra el archivo con `age`, lo guarda como `sto-AAAA-MM-DD.dump.age`, borra los de más de 35 días y falla con un mensaje claro si el archivo queda vacío. Se programa con el Programador de tareas de Windows o con `cron`, y la tarea se configura para ejecutarse apenas se encienda la PC si se perdió la hora. Necesita el cliente `pg_dump` (o Docker) con la misma versión mayor de Postgres que el servidor.

**La clave privada de `age`** se guarda en un gestor de contraseñas y en papel. Sin ella los respaldos no sirven.

**Qué no cubre, y cómo se mitiga.** No hay alarma automática si la PC estuvo apagada; la mitigación es mirar la carpeta una vez por semana. El respaldo cumple RNF-10 y RNF-11 (diario, más de 30 días, fuera del servidor) mientras la PC esté encendida y la segunda copia exista.

### Procedimiento de restauración (RNF-12)

1. Crear una base vacía: un proyecto o rama nueva en Neon, o `docker run postgres:17` en tu PC.
2. Descifrar el respaldo del día: `age -d -i clave.txt sto-AAAA-MM-DD.dump.age > sto.dump`.
3. Restaurar: `pg_restore --no-owner --dbname "$DB_URL" sto.dump`.
4. Ejecutar `npm run verificar-restauracion`: cuenta filas por tabla, recalcula todos los saldos y comprueba que la restricción de solapamiento existe.
5. Si es una restauración real, apuntar `DATABASE_URL` en Vercel a la base nueva y volver a desplegar.

**Prueba obligatoria:** los pasos 1 a 4 se ejecutan cada mes contra un Postgres local en Docker, que no cuesta nada, y el resultado (fecha, duración, diferencias) se anota en `docs/restauraciones.md`. Un respaldo que nunca se restauró no cuenta como respaldo.

## 9. Despliegue, entornos y costos

Todo corre en planes gratuitos y sin GitHub Actions: la calidad se controla con `husky` en tu PC y Vercel despliega cuando hacés `git push`. El costo fijo es de USD 0 por mes.

### Entornos

| Entorno | App | Base | Datos |
| --- | --- | --- | --- |
| Local | `next dev` | Postgres en Docker (`postgres:17`) | Semilla ficticia |
| Pruebas | Vercel Preview, una por rama de git | Rama `pruebas` de Neon (hasta 10 ramas por proyecto, [Neon](https://neon.com/pricing)) | Solo ficticios |
| Producción | Vercel Hobby, rama `main` | Rama principal de Neon | Reales |

Cada entorno tiene su propio `DATABASE_URL` en las variables de Vercel. Una rama de Neon nace como copia de su origen, así que la rama `pruebas` se crea **antes** de cargar pacientes reales y se reinicia con la semilla; nunca se crea desde producción con datos reales.

### Husky en lugar de CI

`npx husky init` crea `.husky/pre-commit` y el script `prepare` en `package.json` ([husky](https://typicode.github.io/husky/get-started.html)). Dos ganchos:

- **`pre-commit` (segundos):** ESLint, `tsc --noEmit`, pruebas unitarias de Vitest y bloqueo de `.env*` y cadenas `postgres://`.
- **`pre-push` (más lento):** pruebas de base de datos contra el Postgres de Docker (solapamiento, inmutabilidad, saldos), `npm audit` y `next build`. Si Docker no está encendido, el gancho falla con un mensaje claro.

Los ganchos corren en tu PC y se pueden saltear con `--no-verify` o `HUSKY=0`; sin CI no hay una segunda barrera. La última es el build de Vercel, que falla si hay errores de tipos y deja la versión anterior en producción.

### Despliegue

1. `git push` de una rama: Vercel genera una vista previa conectada a la rama `pruebas`.
2. Push o merge a `main`: Vercel despliega producción.
3. Migraciones: el comando de build corre `node scripts/migrar.mjs && next build` con la conexión directa de cada entorno. Si la migración falla, el build falla y producción sigue como estaba.
4. Regla: toda migración es compatible con la versión anterior del código (agregar primero, quitar en una versión posterior).
5. Volver atrás: promover un despliegue anterior desde el panel de Vercel (confirmar que Hobby lo permita). La base nunca se revierte: se corrige con una migración nueva, o con una restauración del respaldo si se perdieron datos.

### Monitoreo y disponibilidad (RNF-13)

- Ruta `/api/salud` que consulta la base. El cron de Vercel Hobby solo corre una vez por día, con una imprecisión de hasta 59 minutos ([Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)), así que no sirve ni de monitor ni para mantener despierta la base. Si se quiere alerta, hay que sumar un monitor externo gratuito, a elegir.
- Logs de Vercel para errores, sin datos de pacientes.
- El 99 % mensual es un objetivo, no una garantía: ninguno de los dos planes gratuitos ofrece SLA.
- Región: las funciones de Vercel corren por defecto en Washington (`iad1`) ([Vercel](https://vercel.com/docs/regions)); falta confirmar si Hobby permite elegir São Paulo (`gru1`). Si no, la base se crea en la región de Neon más cercana a esa función.

### Costos (al 2026-11-04)

| Concepto | Costo mensual |
| --- | --- |
| Vercel Hobby | USD 0 |
| Neon Free | USD 0 |
| Docker, husky, Vitest | USD 0 |
| Dominio propio | Opcional; a cotizar. Sin dominio se usa `*.vercel.app` |

**Riesgo a tener presente.** Vercel limita Hobby al "uso personal y no comercial" y define uso comercial como cualquier despliegue usado para el beneficio económico de cualquiera involucrado en su producción ([reglas de uso](https://vercel.com/docs/limits/fair-use-guidelines)). Un consultorio que usa el sistema para su trabajo podría caer ahí. Si Vercel lo objetara, la salida es el VPS con Coolify que ya contemplaste: como la aplicación es Next.js estándar y la base es Postgres estándar, mudarse no requiere reescribir código.

## 10. Plan de implementación

La agenda sale a uso real al terminar la fase 1, sin esperar historial ni cobros, porque es el dolor principal (sección 5 del documento de producto). No se fijan fechas porque presupuesto y plazo no están definidos.

```
Fase 0  Cimientos          repositorio con husky, Vercel y Neon; esquema base; login propio;
                           permisos; auditoría; script de respaldo y primera restauración probada
  puerta: restauración probada en una base local (Docker)
Fase 1  Agenda             pacientes con alerta de duplicados; horario laboral y bloqueos;
                           turnos sin solapamiento; vista de día y semana; estados del turno
  puerta: la doctora agenda en el sistema, no en WhatsApp
Fase 2  Historial clínico  trabajos con versiones y registro de cambios; ficha por diente (FDI);
                           indicador de atendidos sin trabajo
  puerta: la doctora registra los trabajos en el sistema tras cada atención
Fase 3  Cobros y reportes  cargos, cobros parciales, pagos a cuenta y anulaciones; saldos;
                           lista de pacientes con saldo; reporte mensual por profesional
  puerta: saldos y reporte validados con la doctora
Fase 4  Puesta en marcha   carga de pacientes activos y próximos turnos; prueba guiada;
                           medición de los criterios de éxito a 3 meses
```

Cada fase termina con código en producción y pruebas automáticas de sus reglas. La puerta de la fase 0 es obligatoria: sin una restauración probada no se cargan pacientes reales.

**Pruebas mínimas por fase**

- Fase 1: dos turnos simultáneos en el mismo horario (uno debe fallar con `SOLAPAMIENTO`); turno dentro de un bloqueo semanal; ingreso, cierre por 30 minutos de inactividad y bloqueo tras 5 intentos fallidos; agenda del día en menos de 2 s con 5 años de datos ficticios, también tras 5 minutos de inactividad de la base.
- Fase 2: editar un trabajo genera versión nueva y conserva la anterior; `UPDATE` directo sobre `trabajo_versiones` falla; leer una historia clínica queda auditado.
- Fase 3: cobro parcial, pago a cuenta, anulación y cambio de monto después de cobrar dejan saldos correctos; el reporte coincide con una suma manual.
- Todas: un usuario con rol `secretaria` de prueba no accede a ninguna acción `clinico.*`.

**Fuera del MVP.** Los adjuntos (RF-33) y la exportación a PDF o planilla (RF-52) no entran. Cuando hagan falta, los adjuntos se agregan como una fase 5: tabla `adjuntos`, un bucket privado (Supabase Storage tiene 1 GB gratis, [Supabase](https://supabase.com/pricing)), URL firmadas de corta duración y subida directa desde el navegador, porque Vercel corta los pedidos de más de 4,5 MB ([Vercel](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)). El modelo ya deja `trabajo_id` y `paciente_id` listos para vincularlos.

## 11. Contradicciones, omisiones y supuestos

Estos puntos afectan el diseño. Los T-10 a T-16 vienen de decisiones de Carlos del 2026-11-04 que cambian lo que dice el documento de producto; para el resto se adoptó un supuesto que conviene confirmar con la doctora.

| # | Tema | Problema o cambio | Supuesto adoptado |
| --- | --- | --- | --- |
| T-01 | Secretaria y cobros | Debe registrar cobros asociados a trabajos (RF-42) pero no ver trabajos (4.2, S-07) | Se separa el **cargo** (monto y concepto administrativo) del **trabajo** (contenido clínico). Ella imputa cobros a cargos |
| T-02 | Duración mínima | RF-03 la hace modificable; el glosario y RF-23 fijan 60 min | Configurable por profesional, 60 por defecto, en pasos de 30 min (S-06). Si debe ser un piso fijo de 60, se bloquea el campo |
| T-03 | Turno fuera de horario laboral | No se dice si se permite | Se advierte (`FUERA_DE_HORARIO`) y se permite con confirmación, para urgencias |
| T-04 | Bloqueo sobre turnos existentes | 6.7 dice "advierte", pero no qué pasa con esos turnos | Se guarda el bloqueo y los turnos quedan programados; la doctora decide si cancelarlos o moverlos |
| T-05 | "Monto facturado" en el reporte | La facturación está excluida (2.1) | Se rotula "Monto de prestaciones" para no confundir con comprobantes fiscales |
| T-06 | Edición vs eliminación de trabajos | 6.4 dice "no se borra"; RF-37 permite eliminación lógica | Compatible: se oculta con motivo, nunca se borra. El cargo asociado se anula aparte si corresponde |
| T-07 | Cobro de ausencias | S-02 sin modelo | Cargo con origen `ausencia`, sin trabajo clínico |
| T-08 | Pacientes y profesionales | No se dice si los pacientes son del consultorio o de cada profesional | Del consultorio (una sola ficha administrativa); lo clínico se restringe por profesional |
| T-09 | Documento del paciente | DNI obligatorio (RF-13), pero puede haber extranjeros o bebés sin DNI | Tipo y número de documento; único cuando existe; alerta de duplicados también por nombre y nacimiento |
| T-10 | Alcance legal | RNF-04 a RNF-06 piden cumplir las leyes 25.326 y 26.529 | Fuera de alcance por decisión de Carlos. Se mantienen los controles técnicos (auditoría, sin borrado, versiones). Ver sección 7 |
| T-11 | Adjuntos | RF-33 y RNF-08 están en prioridad Alta | Salen del MVP por decisión de Carlos; vuelven como fase 5. Cambia el alcance 2.1 y el criterio de "historial con archivos" |
| T-12 | Respaldos | RNF-10/11 piden diarios, 30 días y fuera del servidor; Neon Free guarda 6 horas | Script propio desde tu PC, 35 días, con segunda copia; sin alarma automática (sección 8) |
| T-13 | Disponibilidad 99 % | Ningún plan gratuito la garantiza | Objetivo sin SLA; sin monitor automático (sección 9) |
| T-14 | Login | RF-02 pide cierre a los 30 min; RNF-02 pide bcrypt o equivalente | Login propio con `argon2id` y expiración implementada en la app (sección 6). Sin recuperación de clave por email |
| T-15 | Costo cero | Vercel Hobby es para uso no comercial; Neon Free tiene límite de cómputo y arranque en frío | Se acepta el riesgo; salida al VPS con Coolify (secciones 2 y 9) |
| T-16 | Integración continua | Sin GitHub Actions | `husky` en `pre-commit` y `pre-push`; el build de Vercel es la última barrera (sección 9) |

**Fuentes consultadas el 2026-11-04:** [Neon precios](https://neon.com/pricing) · [Neon regiones](https://neon.com/docs/introduction/regions) · [Supabase precios](https://supabase.com/pricing) · [Supabase pausa de proyectos](https://supabase.com/docs/guides/platform/free-project-pausing) · [Supabase sesiones](https://supabase.com/docs/guides/auth/sessions) · [Supabase regiones](https://supabase.com/docs/guides/platform/regions) · [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Vercel reglas de uso](https://vercel.com/docs/limits/fair-use-guidelines) · [Vercel cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [Vercel regiones](https://vercel.com/docs/regions) · [Vercel límite de 4,5 MB](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) · [husky](https://typicode.github.io/husky/get-started.html) · [Coolify](https://coolify.io/docs)
