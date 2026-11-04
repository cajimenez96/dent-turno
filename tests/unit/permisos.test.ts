import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { puede, type Concesion } from "@/server/permisos";

const profA = "00000000-0000-0000-0000-00000000000a";
const profB = "00000000-0000-0000-0000-00000000000b";

describe("puede()", () => {
  const todas: Concesion[] = [{ permiso: "clinico.ver", profesionalId: null }];
  const soloA: Concesion[] = [{ permiso: "clinico.ver", profesionalId: profA }];

  it("una concesión sin alcance cubre a cualquier profesional", () => {
    expect(puede(todas, "clinico.ver", profA)).toBe(true);
    expect(puede(todas, "clinico.ver", profB)).toBe(true);
  });
  it("una concesión con alcance solo cubre a ese profesional", () => {
    expect(puede(soloA, "clinico.ver", profA)).toBe(true);
    expect(puede(soloA, "clinico.ver", profB)).toBe(false);
  });
  it("sin indicar profesional, alcanza con tener el permiso", () => {
    expect(puede(soloA, "clinico.ver")).toBe(true);
  });
  it("no concede permisos que no están en la lista", () => {
    expect(puede(todas, "clinico.editar")).toBe(false);
    expect(puede([], "agenda.ver")).toBe(false);
  });
});

describe("toda acción del servidor pasa por exigir() (documentación sección 6)", () => {
  // Las acciones de ingreso son públicas por definición.
  const publicas = new Set(["auth.ts"]);
  const carpeta = path.join(process.cwd(), "src", "server", "acciones");
  const archivos = readdirSync(carpeta).filter((a) => a.endsWith(".ts") && !publicas.has(a));

  it.each(archivos.length ? archivos : ["(no hay acciones protegidas todavía)"])("%s", (archivo) => {
    if (!archivos.length) return;
    const fuente = readFileSync(path.join(carpeta, archivo), "utf8");
    const funciones = [...fuente.matchAll(/export async function (\w+)[^{]*\{([\s\S]*?)\n\}/g)];
    expect(funciones.length).toBeGreaterThan(0);
    for (const [, nombre, cuerpo] of funciones) {
      expect(cuerpo, `${nombre} debe llamar a exigir()`).toMatch(/exigir\(/);
    }
  });
});
