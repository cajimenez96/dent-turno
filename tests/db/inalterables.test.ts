import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { baseTemporal, crearPaciente } from "./ayuda";

let base: Awaited<ReturnType<typeof baseTemporal>>;
let c: pg.Client;

beforeAll(async () => {
  base = await baseTemporal();
  c = base.cliente;
});
afterAll(async () => base?.borrar());

describe("auditoría inalterable (RNF-07)", () => {
  it("permite agregar eventos", async () => {
    await c.query("insert into auditoria (accion, entidad) values ('ingreso', 'sesion')");
    const { rows } = await c.query("select count(*)::int as n from auditoria");
    expect(rows[0].n).toBe(1);
  });
  it("rechaza UPDATE, DELETE y TRUNCATE aunque sea el dueño de la tabla", async () => {
    await expect(c.query("update auditoria set accion = 'x'")).rejects.toMatchObject({ code: "42501" });
    await expect(c.query("delete from auditoria")).rejects.toMatchObject({ code: "42501" });
    await expect(c.query("truncate auditoria")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("pacientes", () => {
  it("el documento es único cuando existe", async () => {
    await crearPaciente(c, "García", "30111222");
    await expect(crearPaciente(c, "García", "30111222")).rejects.toMatchObject({ code: "23505" });
  });
  it("permite varios pacientes sin documento", async () => {
    await crearPaciente(c, "Sin Documento A");
    await expect(crearPaciente(c, "Sin Documento B")).resolves.toBeDefined();
  });
  it("busca por nombre aproximado con el índice trigram", async () => {
    const { rows } = await c.query(
      "select apellido from pacientes where (apellido || ' ' || nombre) ilike '%garc%'",
    );
    expect(rows.map((r) => r.apellido)).toContain("García");
  });
});

describe("usuarios y permisos sembrados", () => {
  it("el email es único sin distinguir mayúsculas", async () => {
    await c.query("insert into usuarios (email, nombre, clave_hash) values ('Ana@Ejemplo.com', 'Ana', 'x')");
    await expect(
      c.query("insert into usuarios (email, nombre, clave_hash) values ('ana@ejemplo.com', 'Otra', 'x')"),
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("la secretaria no tiene permisos clínicos", async () => {
    const { rows } = await c.query("select permiso from rol_permisos where rol = 'secretaria'");
    const permisos = rows.map((r) => r.permiso as string);
    expect(permisos.filter((p) => p.startsWith("clinico."))).toEqual([]);
    expect(permisos).toContain("cobros.registrar");
  });
  it("las migraciones son idempotentes: aplicarlas de nuevo no hace nada", async () => {
    const { aplicarMigraciones } = await import("../../scripts/lib/migrador.mjs");
    expect(await aplicarMigraciones(c, () => {})).toBe(0);
  });
});
