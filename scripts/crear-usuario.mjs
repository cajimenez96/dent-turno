// Crea un usuario, o reinicia su clave. No hay registro público: es la única forma de agregar usuarios.
//
//   npm run crear-usuario -- --email ana@ejemplo.com --nombre "Dra. Ana" [--rol profesional|secretaria] [--matricula 1234]
//   npm run reiniciar-clave -- --email ana@ejemplo.com
//
// La clave se pide por teclado (sin mostrarla) o se toma de STO_CLAVE.
import { parseArgs } from "node:util";
import readline from "node:readline";
import { Writable } from "node:stream";
import pg from "pg";
import { hash } from "@node-rs/argon2";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    nombre: { type: "string" },
    rol: { type: "string", default: "profesional" },
    matricula: { type: "string" },
    reiniciar: { type: "boolean", default: false },
  },
});

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) fallar("Falta DATABASE_URL_DIRECT (o DATABASE_URL). Configurala en .env.local.");
if (!values.email) fallar("Falta --email.");
const email = values.email.trim().toLowerCase();
if (!values.reiniciar && !values.nombre) fallar('Falta --nombre (por ejemplo --nombre "Dra. Ana").');
if (!["profesional", "secretaria"].includes(values.rol)) fallar("--rol debe ser profesional o secretaria.");

function fallar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function pedirClave() {
  if (process.env.STO_CLAVE) return Promise.resolve(process.env.STO_CLAVE);
  return new Promise((resolver) => {
    let oculto = false;
    const salida = new Writable({
      write(chunk, _enc, cb) {
        if (!oculto) process.stdout.write(chunk);
        cb();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output: salida, terminal: true });
    process.stdout.write("Clave nueva (mínimo 12 caracteres): ");
    oculto = true;
    rl.question("", (clave) => {
      oculto = false;
      process.stdout.write("\n");
      rl.close();
      resolver(clave);
    });
  });
}

const clave = await pedirClave();
if (clave.length < 12) fallar("La clave debe tener al menos 12 caracteres.");
const claveHash = await hash(clave);

const cliente = new pg.Client({ connectionString: url });
await cliente.connect().catch((e) => fallar(`No se pudo conectar a la base: ${e.message}`));
try {
  await cliente.query("begin");
  const existente = (await cliente.query("select id from usuarios where lower(email) = $1", [email])).rows[0];

  if (values.reiniciar) {
    if (!existente) fallar(`No existe un usuario con el email ${email}.`);
    await cliente.query("update usuarios set clave_hash = $1 where id = $2", [claveHash, existente.id]);
    await cliente.query("delete from sesiones where usuario_id = $1", [existente.id]); // cierra sus sesiones abiertas
    console.log(`Clave reiniciada para ${email}. Se cerraron sus sesiones abiertas.`);
  } else {
    if (existente) fallar(`Ya existe un usuario con el email ${email}. Para cambiarle la clave usá reiniciar-clave.`);
    let profesionalId = null;
    if (values.rol === "profesional") {
      profesionalId = (
        await cliente.query("insert into profesionales (nombre, matricula) values ($1, $2) returning id", [
          values.nombre,
          values.matricula ?? null,
        ])
      ).rows[0].id;
    }
    const usuarioId = (
      await cliente.query(
        "insert into usuarios (email, nombre, clave_hash, profesional_id) values ($1, $2, $3, $4) returning id",
        [email, values.nombre, claveHash, profesionalId],
      )
    ).rows[0].id;
    await cliente.query("insert into asignaciones (usuario_id, rol, profesional_id) values ($1, $2, $3)", [
      usuarioId,
      values.rol,
      profesionalId,
    ]);
    await cliente.query(
      "insert into auditoria (accion, entidad, entidad_id, datos) values ('crear', 'usuario', $1, $2)",
      [usuarioId, JSON.stringify({ email, rol: values.rol, origen: "script" })],
    );
    console.log(`Usuario creado: ${email} (${values.rol}).`);
  }
  await cliente.query("commit");
} catch (error) {
  await cliente.query("rollback");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
