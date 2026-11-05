// Después de restaurar un respaldo: cuenta filas por tabla y comprueba las reglas críticas.
// Uso: DATABASE_URL_DIRECT=postgres://... npm run verificar-restauracion
import pg from "pg";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_DIRECT (o DATABASE_URL).");
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url });
await cliente.connect().catch((e) => {
  console.error(`No se pudo conectar a la base: ${e.message}`);
  process.exit(1);
});
let problemas = 0;
try {
  const tablas = (
    await cliente.query("select tablename from pg_tables where schemaname = 'public' order by tablename")
  ).rows.map((r) => r.tablename);
  console.log("Filas por tabla:");
  for (const tabla of tablas) {
    const { rows } = await cliente.query(`select count(*)::int as n from "${tabla}"`);
    console.log(`  ${tabla.padEnd(20)} ${rows[0].n}`);
  }

  const controles = [
    ["restricción anti-solapamiento de turnos", "select 1 from pg_constraint where conname = 'turnos_sin_solapamiento'"],
    ["auditoría inalterable (trigger)", "select 1 from pg_trigger where tgname = 'auditoria_inalterable'"],
    ["auditoría protegida contra TRUNCATE", "select 1 from pg_trigger where tgname = 'auditoria_sin_truncate'"],
    ["cobros inalterables (trigger)", "select 1 from pg_trigger where tgname = 'cobros_inalterables'"],
    ["imputaciones inalterables (trigger)", "select 1 from pg_trigger where tgname = 'imputaciones_inalterables'"],
    ["control de imputaciones (trigger)", "select 1 from pg_trigger where tgname = 'imputaciones_controlar'"],
    ["ningún cargo con más cobros aplicados que su monto", "select 1 where not exists (select 1 from v_saldo_cargo where saldo < 0)"],
    ["ningún cobro con más aplicado que su monto", "select 1 where not exists (select 1 from cobros c where (select coalesce(sum(monto),0) from imputaciones where cobro_id = c.id) > c.monto)"],
    ["roles sembrados", "select 1 from roles having count(*) >= 2"],
  ];
  console.log("\nControles:");
  for (const [nombre, consulta] of controles) {
    const ok = (await cliente.query(consulta)).rowCount > 0;
    if (!ok) problemas += 1;
    console.log(`  ${ok ? "OK    " : "FALTA "} ${nombre}`);
  }
} finally {
  await cliente.end();
}
if (problemas > 0) {
  console.error(`\nLa restauración tiene ${problemas} problema(s).`);
  process.exit(1);
}
console.log("\nRestauración verificada.");
