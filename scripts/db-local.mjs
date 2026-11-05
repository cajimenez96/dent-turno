// Base de datos local para desarrollo y pruebas. Sin Neon, sin costo.
//
//   npm run db:local      Deja todo listo: enciende Postgres (Docker si hace falta), crea la base,
//                         aplica las migraciones y carga datos de prueba. Se puede repetir sin riesgo.
//   npm run db:semilla    Solo carga los datos de prueba (si todavía no están).
//   npm run db:reiniciar  Borra la base local y la deja como nueva, con datos de prueba.
//   npm run db:detener    Apaga el Postgres de Docker (los datos se conservan).
//
// Si ya tenés un Postgres corriendo en la URL de .env.local, se usa ese y no se toca Docker.
import { spawnSync } from "node:child_process";
import { copyFile, access } from "node:fs/promises";
import { parseArgs } from "node:util";
import pg from "pg";
import { hash } from "@node-rs/argon2";
import { aplicarMigraciones } from "./lib/migrador.mjs";

const SOLO_LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const CLAVE_DE_PRUEBA = "clave-de-prueba-123";
const EMAIL_PROFESIONAL = "doctora@ejemplo.test";
const EMAIL_SECRETARIA = "secretaria@ejemplo.test";

function fallar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

async function existe(ruta) {
  return access(ruta).then(() => true, () => false);
}

async function asegurarEnv() {
  if (await existe(".env.local")) return;
  await copyFile(".env.example", ".env.local");
  console.log("Creé .env.local a partir de .env.example.");
  process.loadEnvFile(".env.local"); // los valores de ejemplo apuntan al Postgres local
}

function urlDestino() {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) fallar("Falta DATABASE_URL en .env.local.");
  const u = new URL(url);
  if (!SOLO_LOCAL.has(u.hostname)) {
    fallar(`La base apunta a ${u.hostname}, que no es tu PC. Este comando solo trabaja con una base local.`);
  }
  const nombre = decodeURIComponent(u.pathname.slice(1));
  if (!/^[a-z_][a-z0-9_]*$/i.test(nombre)) fallar(`Nombre de base no válido: ${nombre}`);
  return { u, nombre };
}

function urlDe(u, baseDeDatos) {
  const copia = new URL(u.toString());
  copia.pathname = `/${baseDeDatos}`;
  return copia.toString();
}

async function conectar(connectionString) {
  const c = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
  await c.connect();
  return c;
}

async function servidorResponde(u) {
  try {
    (await conectar(urlDe(u, "postgres"))).end();
    return true;
  } catch (e) {
    if (e.code === "28P01" || e.code === "28000") fallar(`Postgres responde pero rechazó el usuario o la clave: ${e.message}`);
    return false;
  }
}

function docker(args) {
  return spawnSync("docker", args, { stdio: "inherit" });
}

async function encenderServidor(u) {
  if (await servidorResponde(u)) return;
  console.log("No hay un Postgres en la URL configurada. Intento encenderlo con Docker...");
  const r = docker(["compose", "up", "-d", "--wait"]);
  if (r.error?.code === "ENOENT") {
    fallar("No encontré Docker. Instalá Docker Desktop (o Postgres 16+ con btree_gist y pg_trgm) y repetí el comando.");
  }
  if (r.status !== 0) fallar("Docker no pudo encender la base. Revisá que Docker esté abierto y que el puerto 5432 esté libre.");
  if (!(await servidorResponde(u))) fallar("Docker arrancó pero la base no responde todavía. Esperá unos segundos y repetí.");
}

async function crearBaseSiFalta(u, nombre) {
  const admin = await conectar(urlDe(u, "postgres"));
  try {
    const hay = (await admin.query("select 1 from pg_database where datname = $1", [nombre])).rowCount;
    if (!hay) {
      await admin.query(`create database "${nombre}"`);
      console.log(`Creé la base "${nombre}".`);
    }
  } finally {
    await admin.end();
  }
}

async function borrarBase(u, nombre) {
  const admin = await conectar(urlDe(u, "postgres"));
  try {
    await admin.query(`drop database if exists "${nombre}" with (force)`);
    console.log(`Borré la base "${nombre}".`);
  } finally {
    await admin.end();
  }
}

// Todo lo de abajo es inventado y evidente: nombres "de Ejemplo", documentos 90.000.xxx y teléfonos 555.
const PACIENTES = [
  ["Lucía", "Pérez Ejemplo", "90000001", "11 5550-0001", "1988-03-14"],
  ["Martín", "Gómez Ejemplo", "90000002", "11 5550-0002", "1975-11-02"],
  ["Sofía", "Fernández Ejemplo", "90000003", "11 5550-0003", "2001-06-21"],
  ["Mateo", "Rodríguez Ejemplo", "90000004", "11 5550-0004", "2015-09-09"],
  ["Valentina", "López Ejemplo", "90000005", "11 5550-0005", "1993-01-30"],
  ["Joaquín", "Martínez Ejemplo", "90000006", "11 5550-0006", "1969-12-05"],
  ["Camila", "Sánchez Ejemplo", "90000007", "11 5550-0007", "1998-04-17"],
  ["Tomás", "Romero Ejemplo", "90000008", "11 5550-0008", "1982-08-25"],
  ["Julieta", "Díaz Ejemplo", "90000009", "11 5550-0009", "2010-02-11"],
  ["Nicolás", "Álvarez Ejemplo", "90000010", "11 5550-0010", "1957-07-19"],
  ["Agustina", "Torres Ejemplo", null, "11 5550-0011", null], // sin documento: caso real frecuente
  ["Bruno", "Pérez Ejemplo", "90000012", null, "1990-10-10"], // mismo apellido que Lucía, para probar búsquedas
];

// [día de la semana (0 = lunes), hora, minutos, duración en minutos, paciente (índice), estado]
const TURNOS = [
  [0, 9, 0, 60, 0, "programado"],
  [0, 10, 30, 60, 1, "programado"],
  [0, 15, 0, 90, 2, "programado"],
  [1, 9, 0, 60, 3, "programado"],
  [1, 11, 0, 60, 4, "programado"],
  [2, 10, 0, 60, 5, "programado"],
  [2, 16, 0, 60, 6, "cancelado"],
  [3, 9, 30, 60, 7, "programado"],
  [3, 14, 0, 120, 8, "programado"],
  [4, 10, 0, 60, 9, "programado"],
  [4, 11, 30, 60, 10, "programado"],
  // Semana pasada, ya atendidos: el de Lucía tiene trabajo cargado; el de Martín no (aparece en "atendidos sin trabajo").
  [-7, 9, 0, 60, 0, "atendido"],
  [-7, 10, 30, 60, 1, "atendido"],
];

async function cargarSemilla(url) {
  const c = await conectar(url);
  try {
    if ((await c.query("select 1 from usuarios where lower(email) = $1", [EMAIL_PROFESIONAL])).rowCount) {
      console.log("Los datos de prueba ya estaban cargados. Para empezar de cero: npm run db:reiniciar");
      return;
    }
    const claveHash = await hash(CLAVE_DE_PRUEBA);
    await c.query("begin");
    const prof = (
      await c.query("insert into profesionales (nombre, matricula) values ('Dra. Ejemplo', 'MP 0000') returning id")
    ).rows[0].id;
    // Lunes a viernes de 9 a 13 y de 14 a 18; los viernes de 17 a 18 hay una capacitación fija.
    for (let dia = 1; dia <= 5; dia++) {
      for (const [inicio, fin] of [["09:00", "13:00"], ["14:00", "18:00"]]) {
        await c.query(
          "insert into horarios_laborales (profesional_id, dia_semana, hora_inicio, hora_fin) values ($1, $2, $3, $4)",
          [prof, dia, inicio, fin],
        );
      }
    }
    await c.query(
      `insert into bloqueos (profesional_id, tipo, dia_semana, hora_inicio, hora_fin, motivo)
       values ($1, 'semanal', 5, '17:00', '18:00', 'Capacitación (dato de prueba)')`,
      [prof],
    );
    const usuarios = [
      [EMAIL_PROFESIONAL, "Dra. Ejemplo", "profesional", prof],
      [EMAIL_SECRETARIA, "Secretaria Ejemplo", "secretaria", null],
    ];
    let usuarioProfesional = null;
    for (const [email, nombre, rol, profesionalId] of usuarios) {
      const id = (
        await c.query(
          "insert into usuarios (email, nombre, clave_hash, profesional_id) values ($1, $2, $3, $4) returning id",
          [email, nombre, claveHash, profesionalId],
        )
      ).rows[0].id;
      await c.query("insert into asignaciones (usuario_id, rol, profesional_id) values ($1, $2, $3)", [id, rol, profesionalId]);
      if (rol === "profesional") usuarioProfesional = id;
    }
    const pacientes = [];
    for (const [nombre, apellido, doc, tel, nac] of PACIENTES) {
      pacientes.push(
        (
          await c.query(
            `insert into pacientes (nombre, apellido, numero_documento, telefono, nacimiento)
             values ($1, $2, $3, $4, $5) returning id`,
            [nombre, apellido, doc, tel, nac],
          )
        ).rows[0].id,
      );
    }
    // Turnos de la semana en curso, en hora de Buenos Aires (UTC-3 todo el año).
    for (const [dia, hora, min, duracion, p, estado] of TURNOS) {
      await c.query(
        `with inicio as (
           select (date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')
                   + make_interval(days => $1::int, hours => $2::int, mins => $3::int))
                  at time zone 'America/Argentina/Buenos_Aires' as t
         )
         insert into turnos (profesional_id, paciente_id, rango, estado, motivo_cancelacion, creado_por)
         select $4, $5, tstzrange(t, t + make_interval(mins => $6::int), '[)'), $7::text,
                case when $7::text = 'cancelado' then 'Dato de prueba' end, $8
         from inicio`,
        [dia, hora, min, prof, pacientes[p], duracion, estado, usuarioProfesional],
      );
    }
    // Historial clínico de ejemplo: uno corregido (versión 2), uno sin piezas y uno de la dentición permanente con dos piezas.
    const turnoLucia = (
      await c.query("select id from turnos where paciente_id = $1 and estado = 'atendido'", [pacientes[0]])
    ).rows[0].id;
    const trabajo = async (paciente, turno, versiones) => {
      const id = (
        await c.query("insert into trabajos (profesional_id, paciente_id, turno_id) values ($1, $2, $3) returning id", [prof, paciente, turno])
      ).rows[0].id;
      let n = 0;
      for (const v of versiones) {
        n += 1;
        await c.query(
          `insert into trabajo_versiones (trabajo_id, numero, fecha, descripcion, piezas, monto_informado, editado_por, resumen_cambio)
           values ($1, $2, current_date + $3::int, $4, $5::jsonb, $6, $7, $8)`,
          [id, n, v.dias, v.descripcion, JSON.stringify(v.piezas), v.monto, usuarioProfesional, v.resumen ?? null],
        );
      }
      if (n > 1) await c.query("update trabajos set version_actual = $2 where id = $1", [id, n]);
      return id;
    };
    const trabajoResina = await trabajo(pacientes[0], turnoLucia, [
      { dias: -7, descripcion: "Restauración con resina en el 36 (dato de prueba).", piezas: [{ pieza: "36", caras: ["M", "O"], tratamiento: "Restauración" }], monto: "12000.00" },
      { dias: -7, descripcion: "Restauración con resina en el 36 (dato de prueba).", piezas: [{ pieza: "36", caras: ["M", "O"], tratamiento: "Restauración" }], monto: "15000.00", resumen: "Monto informado: $ 12.000,00 → $ 15.000,00" },
    ]);
    const trabajoLimpieza = await trabajo(pacientes[0], null, [
      { dias: -90, descripcion: "Limpieza y control (dato de prueba).", piezas: [], monto: "8000.00" },
    ]);
    await trabajo(pacientes[2], null, [
      { dias: -30, descripcion: "Endodoncia del 46 y corona provisoria (dato de prueba).", piezas: [{ pieza: "46", caras: [], tratamiento: "Endodoncia" }, { pieza: "46", caras: ["O"], tratamiento: "Corona provisoria" }], monto: null },
    ]);
    // Cuentas de ejemplo: una con deuda parcial, una saldada, una con ausencia sin cobrar y una con dinero a cuenta.
    const cargo = async (paciente, dias, concepto, monto, origen, trabajoId = null) =>
      (await c.query(
        `insert into cargos (profesional_id, paciente_id, fecha, concepto, monto, origen, trabajo_id, creado_por)
         values ($1, $2, current_date + $3::int, $4, $5, $6, $7, $8) returning id`,
        [prof, paciente, dias, concepto, monto, origen, trabajoId, usuarioProfesional],
      )).rows[0].id;
    const cobro = async (paciente, dias, monto, medio, aplicar) => {
      const id = (await c.query(
        `insert into cobros (profesional_id, paciente_id, fecha, monto, medio, tipo, creado_por)
         values ($1, $2, current_date + $3::int, $4, $5, 'cobro', $6) returning id`,
        [prof, paciente, dias, monto, medio, usuarioProfesional],
      )).rows[0].id;
      for (const [cargoId, parte] of aplicar) await c.query("insert into imputaciones (cobro_id, cargo_id, monto) values ($1, $2, $3)", [id, cargoId, parte]);
    };
    const cargoResina = await cargo(pacientes[0], -7, "Restauración con resina en el 36", "15000.00", "trabajo", trabajoResina);
    const cargoLimpieza = await cargo(pacientes[0], -90, "Limpieza y control", "8000.00", "trabajo", trabajoLimpieza);
    await cobro(pacientes[0], -90, "8000.00", "efectivo", [[cargoLimpieza, "8000.00"]]);
    await cobro(pacientes[0], -7, "10000.00", "transferencia", [[cargoResina, "10000.00"]]);
    await cargo(pacientes[1], -5, "Turno ausente (dato de prueba)", "3000.00", "ausencia");
    await cobro(pacientes[3], -2, "5000.00", "efectivo", []);
    await c.query(
      "insert into auditoria (accion, entidad, datos) values ('semilla', 'base', $1)",
      [JSON.stringify({ origen: "db-local", pacientes: PACIENTES.length, turnos: TURNOS.length, trabajos: 3 })],
    );
    await c.query("commit");
    console.log(
      `Datos de prueba cargados: ${PACIENTES.length} pacientes, ${TURNOS.length} turnos (esta semana y la pasada), 3 trabajos clínicos y cuentas de ejemplo con cargos y cobros.\n` +
        `  ${EMAIL_PROFESIONAL}   (profesional)\n  ${EMAIL_SECRETARIA}  (secretaria)\n  Clave de ambos: ${CLAVE_DE_PRUEBA}`,
    );
  } catch (error) {
    await c.query("rollback").catch(() => {});
    throw error;
  } finally {
    await c.end();
  }
}

async function migrar(url) {
  const c = await conectar(url);
  try {
    await aplicarMigraciones(c);
  } finally {
    await c.end();
  }
}

const { positionals } = parseArgs({ allowPositionals: true });
const orden = positionals[0] ?? "iniciar";

await asegurarEnv();
const { u, nombre } = urlDestino();
const url = u.toString();

try {
  if (orden === "detener") {
    process.exit(docker(["compose", "stop"]).status ?? 1);
  }
  await encenderServidor(u);
  if (orden === "reiniciar") await borrarBase(u, nombre);
  await crearBaseSiFalta(u, nombre);
  await migrar(url);
  if (orden === "iniciar" || orden === "reiniciar" || orden === "semilla") await cargarSemilla(url);
  else fallar(`Orden desconocida: ${orden}. Usá iniciar, semilla, reiniciar o detener.`);
  if (orden !== "semilla") console.log("\nListo. Ahora: npm run dev  →  http://localhost:3000");
} catch (error) {
  fallar(error.message);
}
