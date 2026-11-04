// Gancho pre-commit: rechaza archivos .env* y conexiones a bases remotas con clave incluida.
// Las conexiones a localhost y los ejemplos con marcadores (usuario, clave, HOST) están permitidos.
import { execFileSync } from "node:child_process";

const salida = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const archivos = salida("diff", "--cached", "--name-only", "--diff-filter=ACMR").split("\n").filter(Boolean);
const problemas = [];

for (const archivo of archivos) {
  const nombre = archivo.split("/").pop();
  if (/^\.env/.test(nombre) && nombre !== ".env.example") {
    problemas.push(`${archivo}: los archivos .env no se suben a git (solo .env.example).`);
    continue;
  }
  if (archivo === "scripts/chequear-secretos.mjs") continue;
  let contenido;
  try {
    contenido = salida("show", `:${archivo}`);
  } catch {
    continue;
  }
  if (contenido.includes("\u0000")) continue; // binario
  const re = /postgres(?:ql)?:\/\/([^\s:@/'"`]+):([^\s@/'"`]+)@([^\s/:'"`]+)/g;
  for (const m of contenido.matchAll(re)) {
    const [, usuario, clave, host] = m;
    const ejemplo = /^(localhost|127\.0\.0\.1|host|usuario|servidor)$/i.test(host) || /^(clave|\.\.\.|password|\$)/i.test(clave);
    if (!ejemplo) problemas.push(`${archivo}: parece una conexión a una base remota con clave (${usuario}@${host}).`);
  }
}

if (problemas.length) {
  console.error("Commit rechazado por posibles secretos:\n" + problemas.map((p) => `  - ${p}`).join("\n"));
  console.error("\nSi es un falso positivo, cambiá el host o la clave por un marcador de ejemplo.");
  process.exit(1);
}
