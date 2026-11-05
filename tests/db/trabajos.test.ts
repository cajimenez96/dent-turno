import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as esquema from "@/server/db/esquema";
import type { Db } from "@/server/db/cliente";
import {
  armarOdontograma, atendidosSinTrabajo, crearTrabajo, editarTrabajo, eliminarTrabajo, historialPaciente, obtenerTrabajo, versionesTrabajo,
} from "@/server/clinico/trabajos";
import { crearTurno, cambiarEstado } from "@/server/agenda/turnos";
import { baseTemporal, crearPaciente, crearProfesional } from "./ayuda";

let base: Awaited<ReturnType<typeof baseTemporal>>;
let db: Db;
let prof: string;
let otraProf: string;
let pac: string;
let usuario: string;

beforeAll(async () => {
  base = await baseTemporal();
  db = drizzle(base.cliente, { schema: esquema }) as unknown as Db;
  prof = await crearProfesional(base.cliente);
  otraProf = await crearProfesional(base.cliente, "Dr. Otro");
  pac = await crearPaciente(base.cliente, "Pérez");
  usuario = (await base.cliente.query("insert into usuarios (email, nombre, clave_hash) values ('t@t.test','Dra. T','x') returning id")).rows[0].id;
});
afterAll(async () => base?.borrar());

const datos = (extra: Record<string, unknown> = {}) => ({
  fecha: "2026-03-12",
  descripcion: "Restauración con resina",
  piezas: [{ pieza: "36", caras: ["O", "M"], tratamiento: "Restauración" }],
  monto: "12.500",
  ...extra,
});
const ids = () => ({ profesionalId: prof, pacienteId: pac });

describe("trabajos", () => {
  let id: string;

  it("crea un trabajo con versión 1 y auditoría", async () => {
    const r = await crearTrabajo(db, datos(), ids(), usuario);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id = r.datos.id;
    const t = await obtenerTrabajo(db, id);
    expect(t).toMatchObject({ versionActual: 1, fecha: "2026-03-12", monto: "12500.00", piezas: [{ pieza: "36", caras: ["M", "O"] }] });
    const a = await base.cliente.query("select accion, paciente_id from auditoria where entidad = 'trabajo'");
    expect(a.rows).toEqual([{ accion: "crear", paciente_id: pac }]);
  });

  it("valida pieza FDI, fecha futura, monto y campos obligatorios", async () => {
    const mal = await crearTrabajo(db, datos({ piezas: [{ pieza: "19", caras: [], tratamiento: "x" }], fecha: "2999-01-01", monto: "doce", descripcion: " " }), ids(), usuario);
    expect(mal).toMatchObject({ ok: false, error: { campos: { piezas: expect.any(String), fecha: expect.any(String), monto: expect.any(String), descripcion: expect.any(String) } } });
    // Un trabajo sin piezas (limpieza, consulta) es válido; 75 es temporaria válida.
    expect((await crearTrabajo(db, datos({ piezas: [] , monto: ""}), ids(), usuario)).ok).toBe(true);
    expect((await crearTrabajo(db, datos({ piezas: [{ pieza: "75", caras: ["O"], tratamiento: "Sellador" }] }), ids(), usuario)).ok).toBe(true);
  });

  it("editar pide confirmar el resumen y no guarda hasta confirmar", async () => {
    const nuevo = datos({ monto: "15.000", piezas: [{ pieza: "36", caras: ["O", "M", "D"], tratamiento: "Restauración" }] });
    const previa = await editarTrabajo(db, nuevo, { trabajoId: id, version: 1 }, usuario);
    expect(previa).toMatchObject({ ok: false, error: { codigo: "REQUIERE_CONFIRMACION" } });
    if (!previa.ok) {
      const resumen = (previa.error.detalle as { resumen: string[] }).resumen;
      expect(resumen).toEqual(expect.arrayContaining([expect.stringContaining("Monto informado"), expect.stringContaining("Se agregó"), expect.stringContaining("Se quitó")]));
    }
    expect((await versionesTrabajo(db, id)).length).toBe(1);
  });

  it("al confirmar crea la versión 2 y conserva la 1 intacta", async () => {
    const nuevo = datos({ monto: "15.000", piezas: [{ pieza: "36", caras: ["O", "M", "D"], tratamiento: "Restauración" }] });
    const r = await editarTrabajo(db, nuevo, { trabajoId: id, version: 1 }, usuario, true);
    expect(r).toMatchObject({ ok: true, datos: { version: 2 } });
    const v = await versionesTrabajo(db, id);
    expect(v.map((x) => x.numero)).toEqual([2, 1]);
    expect(v[1]).toMatchObject({ monto: "12500.00", piezas: [{ pieza: "36", caras: ["M", "O"] }], resumen: null });
    expect(v[0].resumen).toContain("Monto informado");
    expect(v[0].editadoPor).toBe("Dra. T");
    expect((await obtenerTrabajo(db, id))?.versionActual).toBe(2);
  });

  it("rechaza editar con una versión vieja o sin cambios", async () => {
    expect(await editarTrabajo(db, datos(), { trabajoId: id, version: 1 }, usuario, true)).toMatchObject({ error: { codigo: "CONFLICTO_VERSION" } });
    const igual = datos({ monto: "15000", piezas: [{ pieza: "36", caras: ["D", "M", "O"], tratamiento: "Restauración" }] });
    expect(await editarTrabajo(db, igual, { trabajoId: id, version: 2 }, usuario, true)).toMatchObject({ error: { codigo: "INVALIDO" } });
  });

  it("dos ediciones simultáneas de la misma versión: una gana, la otra recibe CONFLICTO_VERSION", async () => {
    const otro = drizzle(await base.clienteNuevo(), { schema: esquema }) as unknown as Db;
    const [a, b] = await Promise.all([
      editarTrabajo(db, datos({ descripcion: "Cambio A", monto: "15000" }), { trabajoId: id, version: 2 }, usuario, true),
      editarTrabajo(otro, datos({ descripcion: "Cambio B", monto: "15000" }), { trabajoId: id, version: 2 }, usuario, true),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect((await versionesTrabajo(db, id)).map((x) => x.numero)).toEqual([3, 2, 1]);
  });

  it("la base impide modificar o borrar versiones, y manipular la cabecera", async () => {
    const c = base.cliente;
    await expect(c.query("update trabajo_versiones set descripcion = 'x'")).rejects.toMatchObject({ code: "42501" });
    await expect(c.query("delete from trabajo_versiones")).rejects.toMatchObject({ code: "42501" });
    await expect(c.query("truncate trabajo_versiones")).rejects.toMatchObject({ code: "42501" });
    await expect(c.query("delete from trabajos")).rejects.toMatchObject({ code: "42501" });
    await expect(c.query("update trabajos set version_actual = 99 where id = $1", [id])).rejects.toMatchObject({ code: "42501" });
    await expect(c.query("update trabajos set profesional_id = $1 where id = $2", [otraProf, id])).rejects.toMatchObject({ code: "42501" });
    await expect(c.query("update trabajos set version_actual = 1 where id = $1", [id])).rejects.toMatchObject({ code: "42501" });
  });

  it("el historial muestra la versión vigente y respeta el alcance", async () => {
    const h = await historialPaciente(db, pac, [prof]);
    expect(h.length).toBe(3);
    expect(h.find((t) => t.id === id)?.versionActual).toBe(3);
    expect(await historialPaciente(db, pac, [otraProf])).toEqual([]);
    expect(await historialPaciente(db, pac, [])).toEqual([]);
  });

  it("el odontograma sale de la versión vigente", async () => {
    const m = armarOdontograma(await historialPaciente(db, pac, [prof]));
    expect([...m.keys()].sort()).toEqual(["36", "75"]);
    // La versión 3 (la que ganó la carrera) volvió a las caras M y O: el odontograma lee siempre la vigente.
    expect(m.get("36")?.[0].caras).toEqual(["M", "O"]);
  });

  it("eliminar pide motivo, oculta el trabajo y conserva versiones y auditoría", async () => {
    expect(await eliminarTrabajo(db, id, "  ", usuario)).toMatchObject({ error: { codigo: "INVALIDO" } });
    expect((await eliminarTrabajo(db, id, "Cargado en el paciente equivocado", usuario)).ok).toBe(true);
    expect(await obtenerTrabajo(db, id)).toBeNull();
    expect((await historialPaciente(db, pac, [prof])).find((t) => t.id === id)).toBeUndefined();
    expect((await versionesTrabajo(db, id)).length).toBe(3);
    expect(await eliminarTrabajo(db, id, "otra vez", usuario)).toMatchObject({ error: { codigo: "NO_ENCONTRADO" } });
    expect(await editarTrabajo(db, datos(), { trabajoId: id, version: 3 }, usuario, true)).toMatchObject({ error: { codigo: "NO_ENCONTRADO" } });
    await expect(base.cliente.query("update trabajos set eliminado = false, eliminado_motivo = null, eliminado_por = null, eliminado_at = null where id = $1", [id]))
      .rejects.toMatchObject({ code: "42501" });
  });
});

describe("atendidos sin trabajo (RF-27)", () => {
  it("lista los turnos atendidos hasta que se registra un trabajo", async () => {
    const t = await crearTurno(db, { profesionalId: prof, pacienteId: pac, fecha: "2026-03-10", hora: "10:00", duracionMin: 60 }, usuario);
    if (!t.ok) throw new Error();
    await cambiarEstado(db, { turnoId: t.datos.id, estado: "atendido", version: 1 }, usuario);
    expect((await atendidosSinTrabajo(db, prof)).map((x) => x.id)).toContain(t.datos.id);
    expect(await crearTrabajo(db, datos(), { ...ids(), turnoId: "00000000-0000-4000-8000-000000000000" }, usuario)).toMatchObject({ ok: false });
    const w = await crearTrabajo(db, datos(), { ...ids(), turnoId: t.datos.id }, usuario);
    expect(w.ok).toBe(true);
    expect((await atendidosSinTrabajo(db, prof)).map((x) => x.id)).not.toContain(t.datos.id);
    // Si ese trabajo se elimina, el turno vuelve a figurar sin trabajo.
    if (w.ok) await eliminarTrabajo(db, w.datos.id, "Error de carga", usuario);
    expect((await atendidosSinTrabajo(db, prof)).map((x) => x.id)).toContain(t.datos.id);
  });
});
