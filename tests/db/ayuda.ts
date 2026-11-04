import { randomBytes } from "node:crypto";
import pg from "pg";
import { aplicarMigraciones } from "../../scripts/lib/migrador.mjs";

const admin = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

/** Crea una base temporal, le aplica las migraciones y devuelve un cliente y cómo borrarla. */
export async function baseTemporal() {
  const nombre = `sto_test_${randomBytes(4).toString("hex")}`;
  const maestro = new pg.Client({ connectionString: admin });
  await maestro.connect();
  await maestro.query(`create database ${nombre}`);

  const url = new URL(admin);
  url.pathname = `/${nombre}`;
  const cliente = new pg.Client({ connectionString: url.toString() });
  await cliente.connect();
  await aplicarMigraciones(cliente, () => {});

  const clientes: pg.Client[] = [];
  return {
    cliente,
    /** Otra conexión a la misma base, para probar pedidos simultáneos. */
    async clienteNuevo() {
      const otro = new pg.Client({ connectionString: url.toString() });
      await otro.connect();
      clientes.push(otro);
      return otro;
    },
    async borrar() {
      await Promise.all(clientes.map((o) => o.end().catch(() => {})));
      await cliente.end();
      await maestro.query(`drop database if exists ${nombre} with (force)`);
      await maestro.end();
    },
  };
}

export async function crearProfesional(c: pg.Client, nombre = "Dra. Prueba") {
  const { rows } = await c.query("insert into profesionales (nombre) values ($1) returning id", [nombre]);
  return rows[0].id as string;
}

export async function crearPaciente(c: pg.Client, apellido = "Pérez", documento: string | null = null) {
  const { rows } = await c.query(
    "insert into pacientes (nombre, apellido, numero_documento) values ('Ana', $1, $2) returning id",
    [apellido, documento],
  );
  return rows[0].id as string;
}

export async function crearTurno(c: pg.Client, profesional: string, paciente: string, desde: string, hasta: string, extra = "") {
  return c.query(
    `insert into turnos (profesional_id, paciente_id, rango ${extra ? ", " + extra.split("=")[0] : ""})
     values ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)') ${extra ? ", " + extra.split("=")[1] : ""})
     returning id`,
    [profesional, paciente, desde, hasta],
  );
}
