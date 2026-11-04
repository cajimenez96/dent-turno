// Respaldo diario: pg_dump completo, cifrado con age, con 35 días de copias.
// Se programa en tu PC (Programador de tareas de Windows o cron). Ver docs/DOCUMENTACION_TECNICA.md, sección 8.
//
// Variables (en .env.respaldo, que no se sube a git):
//   DATABASE_URL_RESPALDO  conexión directa con un rol de solo lectura (sto_respaldo)
//   AGE_RECIPIENT          clave PÚBLICA de age (age1...). La privada se guarda aparte.
//   RESPALDO_DIR           carpeta destino (por defecto ./respaldos)
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const RETENCION_DIAS = 35;
const url = process.env.DATABASE_URL_RESPALDO;
const destinatario = process.env.AGE_RECIPIENT;
const carpeta = path.resolve(process.env.RESPALDO_DIR ?? "respaldos");

function fallar(mensaje) {
  console.error(`RESPALDO FALLÓ: ${mensaje}`);
  process.exit(1);
}

if (!url) fallar("falta DATABASE_URL_RESPALDO.");
if (!destinatario?.startsWith("age1")) fallar("falta AGE_RECIPIENT (la clave pública de age, empieza con age1).");

const hoy = new Date().toISOString().slice(0, 10);
const crudo = path.join(carpeta, `sto-${hoy}.dump`);
const cifrado = `${crudo}.age`;
mkdirSync(carpeta, { recursive: true });

const dump = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", crudo, url], {
  stdio: ["ignore", "inherit", "inherit"],
});
if (dump.error) fallar(`no se pudo ejecutar pg_dump (${dump.error.message}). Instalá el cliente de Postgres o usá Docker.`);
if (dump.status !== 0) fallar("pg_dump terminó con error. Revisá la conexión y que la versión del cliente no sea menor a la del servidor.");

const cifrar = spawnSync("age", ["-r", destinatario, "-o", cifrado, crudo], { stdio: ["ignore", "inherit", "inherit"] });
rmSync(crudo, { force: true }); // nunca queda una copia sin cifrar
if (cifrar.error) fallar(`no se pudo ejecutar age (${cifrar.error.message}).`);
if (cifrar.status !== 0) fallar("age terminó con error.");
if (statSync(cifrado).size === 0) fallar("el archivo cifrado quedó vacío.");

// Borra copias de más de 35 días, según la fecha del nombre.
const limite = Date.now() - RETENCION_DIAS * 24 * 60 * 60 * 1000;
let borrados = 0;
for (const archivo of readdirSync(carpeta)) {
  const m = /^sto-(\d{4}-\d{2}-\d{2})\.dump\.age$/.exec(archivo);
  if (m && Date.parse(m[1]) < limite) {
    rmSync(path.join(carpeta, archivo));
    borrados += 1;
  }
}
console.log(`Respaldo listo: ${cifrado} (${(statSync(cifrado).size / 1024).toFixed(0)} KB). Copias viejas borradas: ${borrados}.`);
