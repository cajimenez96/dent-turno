import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as esquema from "@/server/db/esquema";
import type { Db } from "@/server/db/cliente";
import { buscarPacientes, crearPaciente, desactivarPaciente, editarPaciente } from "@/server/pacientes/servicio";
import { crearTurno } from "@/server/agenda/turnos";
import { baseTemporal, crearProfesional } from "./ayuda";

let base: Awaited<ReturnType<typeof baseTemporal>>;
let db: Db;
let usuario: string;

beforeAll(async () => {
  base = await baseTemporal();
  db = drizzle(base.cliente, { schema: esquema }) as unknown as Db;
  usuario = (await base.cliente.query("insert into usuarios (email, nombre, clave_hash) values ('t@t.test','T','x') returning id")).rows[0].id;
});
afterAll(async () => base?.borrar());

const lucia = { nombre: "Lucía", apellido: "Pérez", tipoDocumento: "DNI", numeroDocumento: "30.123.456", nacimiento: "1988-03-14" };

describe("pacientes", () => {
  it("crea un paciente y normaliza el DNI", async () => {
    const r = await crearPaciente(db, lucia, usuario);
    expect(r.ok).toBe(true);
    const { rows } = await base.cliente.query("select numero_documento from pacientes");
    expect(rows[0].numero_documento).toBe("30123456");
  });

  it("el mismo documento no se puede repetir, con o sin confirmación", async () => {
    const r = await crearPaciente(db, { ...lucia, nombre: "Otra", apellido: "Persona" }, usuario, true);
    expect(r).toMatchObject({ ok: false, error: { codigo: "INVALIDO", campos: { numeroDocumento: expect.any(String) } } });
  });

  it("avisa de nombres parecidos y solo guarda si se confirma", async () => {
    const igual = { nombre: "Lucia", apellido: "Perez", tipoDocumento: "DNI", numeroDocumento: "" , nacimiento: "1988-03-14" };
    const aviso = await crearPaciente(db, igual, usuario);
    expect(aviso).toMatchObject({ ok: false, error: { codigo: "REQUIERE_CONFIRMACION" } });
    if (!aviso.ok) expect((aviso.error.detalle as { duplicados: { apellido: string }[] }).duplicados[0].apellido).toBe("Pérez");
    expect((await base.cliente.query("select count(*)::int n from pacientes")).rows[0].n).toBe(1);
    expect((await crearPaciente(db, igual, usuario, true)).ok).toBe(true);
  });

  it("personas distintas no disparan el aviso", async () => {
    const r = await crearPaciente(db, { nombre: "Martín", apellido: "Gómez", tipoDocumento: "DNI", numeroDocumento: "", nacimiento: "" }, usuario);
    expect(r.ok).toBe(true);
  });

  it("valida campos y acepta pacientes sin documento", async () => {
    const r = await crearPaciente(db, { nombre: "", apellido: "X", tipoDocumento: "DNI", numeroDocumento: "12" }, usuario);
    expect(r).toMatchObject({ ok: false, error: { campos: { nombre: expect.any(String), numeroDocumento: expect.any(String) } } });
    expect((await crearPaciente(db, { nombre: "Bebé", apellido: "Sin Dni" }, usuario)).ok).toBe(true);
  });

  it("edita, rechaza un documento ajeno y audita antes y después", async () => {
    const otro = await crearPaciente(db, { nombre: "Tomás", apellido: "Romero", numeroDocumento: "40111222" }, usuario);
    if (!otro.ok) throw new Error();
    expect(await editarPaciente(db, otro.datos.id, { nombre: "Tomás", apellido: "Romero", numeroDocumento: "30123456" }, usuario)).toMatchObject({ ok: false });
    expect((await editarPaciente(db, otro.datos.id, { nombre: "Tomás", apellido: "Romero", telefono: "11 5550-0000", numeroDocumento: "40111222" }, usuario)).ok).toBe(true);
    const a = await base.cliente.query("select datos from auditoria where accion = 'editar' and entidad = 'paciente'");
    expect(a.rows[0].datos.antes.telefono).toBeNull();
    expect(a.rows[0].datos.despues.telefono).toBe("11 5550-0000");
  });

  it("busca por apellido sin tildes ni mayúsculas, por nombre y por documento", async () => {
    expect((await buscarPacientes(db, "perez")).length).toBeGreaterThan(0);
    expect((await buscarPacientes(db, "rome")).map((p) => p.apellido)).toContain("Romero");
    expect((await buscarPacientes(db, "30.123")).map((p) => p.apellido)).toContain("Pérez");
    expect(await buscarPacientes(db, "%")).toEqual([]);
  });

  it("no desactiva a un paciente con turnos por delante", async () => {
    const p = await crearPaciente(db, { nombre: "Ana", apellido: "Futura", numeroDocumento: "" }, usuario);
    if (!p.ok) throw new Error();
    const prof = await crearProfesional(base.cliente);
    const t = await crearTurno(db, { profesionalId: prof, pacienteId: p.datos.id, fecha: "2099-03-02", hora: "10:00", duracionMin: 60 }, usuario);
    expect(t.ok).toBe(true);
    expect(await desactivarPaciente(db, p.datos.id, usuario)).toMatchObject({ ok: false, error: { codigo: "INVALIDO" } });
    const sin = await crearPaciente(db, { nombre: "Ana", apellido: "Pasada", numeroDocumento: "" }, usuario);
    if (!sin.ok) throw new Error();
    expect((await desactivarPaciente(db, sin.datos.id, usuario)).ok).toBe(true);
    expect((await buscarPacientes(db, "Pasada")).length).toBe(0);
  });
});
