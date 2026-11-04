import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migraciones");

/**
 * Aplica en orden los archivos .sql de /migraciones que todavía no se aplicaron.
 * Cada archivo corre en su propia transacción: si falla, no queda a medias.
 * `cliente` es un `pg.Client` ya conectado (conexión directa, no agrupada).
 */
export async function aplicarMigraciones(cliente, log = console.log) {
  await cliente.query(
    "create table if not exists _migraciones (nombre text primary key, aplicada_at timestamptz not null default now())",
  );
  const hechas = new Set((await cliente.query("select nombre from _migraciones")).rows.map((r) => r.nombre));
  const archivos = (await readdir(carpeta)).filter((a) => a.endsWith(".sql")).sort();
  let aplicadas = 0;
  for (const archivo of archivos) {
    if (hechas.has(archivo)) continue;
    const sql = await readFile(path.join(carpeta, archivo), "utf8");
    log(`Aplicando ${archivo}...`);
    try {
      await cliente.query("begin");
      await cliente.query(sql);
      await cliente.query("insert into _migraciones (nombre) values ($1)", [archivo]);
      await cliente.query("commit");
      aplicadas += 1;
    } catch (error) {
      await cliente.query("rollback");
      throw new Error(`Falló la migración ${archivo}: ${error.message}`);
    }
  }
  log(aplicadas === 0 ? "Base al día, no hay migraciones nuevas." : `Listo: ${aplicadas} migración(es) aplicada(s).`);
  return aplicadas;
}
