// Uso: node scripts/migrar.mjs
// En Vercel lo corre `vercel-build` antes de `next build`. Si falla, el build falla y
// producción sigue con la versión anterior.
import pg from "pg";
import { aplicarMigraciones } from "./lib/migrador.mjs";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_DIRECT (o DATABASE_URL). Configurala en .env.local o en las variables de Vercel.");
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url });
try {
  await cliente.connect();
  await aplicarMigraciones(cliente);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
