import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as esquema from "@/server/db/esquema";
import type { Db } from "@/server/db/cliente";
import { crearTurno, reprogramarTurno, cambiarEstado, liberarHorario, agendaEntre } from "@/server/agenda/turnos";
import { anularBloqueo, crearBloqueo, guardarHorarioLaboral, bloqueosVigentes } from "@/server/agenda/configuracion";
import { baseTemporal, crearPaciente, crearProfesional } from "./ayuda";

let base: Awaited<ReturnType<typeof baseTemporal>>;
let db: Db;
let prof: string;
let ana: string;
let beto: string;
let usuario: string;

const envolver = (c: pg.Client) => drizzle(c, { schema: esquema }) as unknown as Db;
// 2026-11-10 es martes; 2026-11-14 es sábado.
const turno = (hora: string, extra: Record<string, unknown> = {}) => ({
  profesionalId: prof, pacienteId: ana, fecha: "2026-11-10", hora, duracionMin: 60, ...extra,
});

beforeAll(async () => {
  base = await baseTemporal();
  db = envolver(base.cliente);
  prof = await crearProfesional(base.cliente);
  ana = await crearPaciente(base.cliente, "Pérez");
  beto = await crearPaciente(base.cliente, "Gómez", "30111222");
  usuario = (await base.cliente.query("insert into usuarios (email, nombre, clave_hash) values ('t@t.test','T','x') returning id")).rows[0].id;
});
afterAll(async () => base?.borrar());

describe("crearTurno", () => {
  it("crea un turno y deja auditoría", async () => {
    const r = await crearTurno(db, turno("10:00"), usuario);
    expect(r.ok).toBe(true);
    const a = await base.cliente.query("select accion, entidad from auditoria where entidad = 'turno'");
    expect(a.rows).toEqual([{ accion: "crear", entidad: "turno" }]);
  });

  it("rechaza un solapamiento con un mensaje que nombra al otro paciente", async () => {
    const r = await crearTurno(db, { ...turno("10:30"), pacienteId: beto }, usuario);
    expect(r).toMatchObject({ ok: false, error: { codigo: "SOLAPAMIENTO" } });
    if (!r.ok) expect(r.error.mensaje).toContain("Pérez, Ana");
  });

  it("permite turnos pegados: termina 11:00, empieza 11:00", async () => {
    expect((await crearTurno(db, turno("11:00"), usuario)).ok).toBe(true);
  });

  it("valida duración mínima, grilla y datos", async () => {
    expect(await crearTurno(db, turno("14:00", { duracionMin: 30 }), usuario)).toMatchObject({ error: { codigo: "INVALIDO" } });
    expect(await crearTurno(db, turno("14:10"), usuario)).toMatchObject({ error: { codigo: "INVALIDO" } });
    expect(await crearTurno(db, turno("14:00", { duracionMin: 75 }), usuario)).toMatchObject({ error: { codigo: "INVALIDO" } });
    expect(await crearTurno(db, turno("14:00", { pacienteId: "no-es-uuid" }), usuario)).toMatchObject({ error: { codigo: "INVALIDO" } });
  });

  it("dos pedidos simultáneos al mismo horario: uno gana y el otro recibe SOLAPAMIENTO", async () => {
    const otro = await base.clienteNuevo();
    const dbB = envolver(otro);
    const [a, b] = await Promise.all([
      crearTurno(db, turno("16:00"), usuario),
      crearTurno(dbB, { ...turno("16:00"), pacienteId: beto }, usuario),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const perdedor = a.ok ? b : a;
    expect(perdedor).toMatchObject({ ok: false, error: { codigo: "SOLAPAMIENTO" } });
  });
});

describe("horario laboral", () => {
  it("sin horario cargado no restringe; con horario pide confirmación fuera de él", async () => {
    // Todavía sin horario: 20:00 pasa.
    expect((await crearTurno(db, turno("20:00"), usuario)).ok).toBe(true);

    const g = await guardarHorarioLaboral(db, {
      profesionalId: prof,
      franjas: [1, 2, 3, 4, 5].flatMap((dia) => [{ dia, inicio: "09:00", fin: "13:00" }, { dia, inicio: "14:00", fin: "18:00" }]),
    }, usuario);
    expect(g.ok).toBe(true);

    const fuera = await crearTurno(db, turno("19:00"), usuario);
    expect(fuera).toMatchObject({ ok: false, error: { codigo: "REQUIERE_CONFIRMACION", detalle: { motivo: "fuera_de_horario" } } });
    expect((await crearTurno(db, turno("19:00"), usuario, true)).ok).toBe(true);
  });

  it("un turno que cruza el corte del almuerzo cuenta como fuera de horario; uno dentro, no", async () => {
    const cruza = await crearTurno(db, turno("12:30"), usuario);
    expect(cruza).toMatchObject({ error: { codigo: "REQUIERE_CONFIRMACION" } });
    expect((await crearTurno(db, turno("15:00"), usuario)).ok).toBe(true);
  });

  it("el sábado queda fuera de horario", async () => {
    const r = await crearTurno(db, turno("10:00", { fecha: "2026-11-14" }), usuario);
    expect(r).toMatchObject({ error: { codigo: "REQUIERE_CONFIRMACION" } });
  });

  it("rechaza franjas invertidas o superpuestas", async () => {
    expect(await guardarHorarioLaboral(db, { profesionalId: prof, franjas: [{ dia: 1, inicio: "10:00", fin: "09:00" }] }, usuario))
      .toMatchObject({ ok: false });
    expect(await guardarHorarioLaboral(db, { profesionalId: prof, franjas: [{ dia: 1, inicio: "09:00", fin: "12:00" }, { dia: 1, inicio: "11:00", fin: "13:00" }] }, usuario))
      .toMatchObject({ ok: false });
    // Lo anterior sigue vigente.
    expect((await base.cliente.query("select count(*)::int n from horarios_laborales")).rows[0].n).toBe(10);
  });
});

describe("bloqueos", () => {
  it("un bloqueo semanal impide turnos en esa franja, en hora de Buenos Aires", async () => {
    const b = await crearBloqueo(db, { tipo: "semanal", profesionalId: prof, motivo: "Reunión", dia: 3, horaDesde: "16:00", horaHasta: "17:00" }, usuario);
    expect(b.ok).toBe(true);
    // 2026-11-11 es miércoles.
    const r = await crearTurno(db, turno("16:00", { fecha: "2026-11-11" }), usuario);
    expect(r).toMatchObject({ ok: false, error: { codigo: "EN_BLOQUEO" } });
    // Miércoles fuera de la franja y jueves a la misma hora: libres.
    expect((await crearTurno(db, turno("15:00", { fecha: "2026-11-11" }), usuario)).ok).toBe(true);
    expect((await crearTurno(db, turno("16:00", { fecha: "2026-11-12" }), usuario)).ok).toBe(true);
    // Una semana después se repite.
    expect(await crearTurno(db, turno("16:00", { fecha: "2026-11-18" }), usuario)).toMatchObject({ error: { codigo: "EN_BLOQUEO" } });
  });

  it("un bloqueo puntual de varios días impide turnos y se puede anular", async () => {
    const b = await crearBloqueo(db, { tipo: "puntual", profesionalId: prof, motivo: "Vacaciones", fechaDesde: "2026-12-01", fechaHasta: "2026-12-04" }, usuario);
    expect(b.ok).toBe(true);
    expect(await crearTurno(db, turno("10:00", { fecha: "2026-12-04" }), usuario)).toMatchObject({ error: { codigo: "EN_BLOQUEO" } });
    expect((await crearTurno(db, turno("10:00", { fecha: "2026-12-07" }), usuario)).ok).toBe(true); // el lunes siguiente, ya terminó
    if (!b.ok) throw new Error();
    expect((await anularBloqueo(db, b.datos.id, prof, usuario)).ok).toBe(true);
    expect((await crearTurno(db, turno("10:00", { fecha: "2026-12-04" }), usuario)).ok).toBe(true);
    expect(await anularBloqueo(db, b.datos.id, prof, usuario)).toMatchObject({ error: { codigo: "NO_ENCONTRADO" } });
    // Un bloqueo no se puede anular indicando otro profesional.
    const otro = await crearBloqueo(db, { tipo: "puntual", profesionalId: prof, motivo: "Otro", fechaDesde: "2027-02-01", fechaHasta: "2027-02-01" }, usuario);
    if (!otro.ok) throw new Error();
    expect(await anularBloqueo(db, otro.datos.id, "00000000-0000-4000-8000-000000000000", usuario)).toMatchObject({ error: { codigo: "NO_ENCONTRADO" } });
  });

  it("un bloqueo sobre turnos existentes pide confirmación, no guarda sin ella y no cancela los turnos", async () => {
    const sin = await crearBloqueo(db, { tipo: "puntual", profesionalId: prof, motivo: "Congreso", fechaDesde: "2099-01-05", fechaHasta: "2099-01-05" }, usuario);
    expect(sin.ok).toBe(true); // sin turnos en esa fecha
    const t = await crearTurno(db, turno("10:00", { fecha: "2099-01-12" }), usuario);
    expect(t.ok).toBe(true);
    const antes = (await base.cliente.query("select count(*)::int n from bloqueos")).rows[0].n;
    const pide = await crearBloqueo(db, { tipo: "puntual", profesionalId: prof, motivo: "Congreso", fechaDesde: "2099-01-12", fechaHasta: "2099-01-12" }, usuario);
    expect(pide).toMatchObject({ ok: false, error: { codigo: "REQUIERE_CONFIRMACION" } });
    if (!pide.ok) expect((pide.error.detalle as { afectados: unknown[] }).afectados).toHaveLength(1);
    expect((await base.cliente.query("select count(*)::int n from bloqueos")).rows[0].n).toBe(antes);
    const conf = await crearBloqueo(db, { tipo: "puntual", profesionalId: prof, motivo: "Congreso", fechaDesde: "2099-01-12", fechaHasta: "2099-01-12" }, usuario, true);
    expect(conf.ok).toBe(true);
    expect((await base.cliente.query("select estado from turnos where id = $1", [t.ok ? t.datos.id : ""])).rows[0].estado).toBe("programado");
    expect((await bloqueosVigentes(db, prof)).length).toBeGreaterThan(0);
  });

  it("la agenda de una semana trae turnos y bloqueos", async () => {
    const { turnos, bloqueos } = await agendaEntre(db, prof, new Date("2026-11-09T03:00:00Z"), new Date("2026-11-16T03:00:00Z"));
    expect(turnos.length).toBeGreaterThan(3);
    expect(bloqueos.map((b) => b.motivo)).toContain("Reunión");
  });
});

describe("reprogramar y estados", () => {
  let id: string;
  let version: number;
  beforeAll(async () => {
    const r = await crearTurno(db, turno("09:00", { fecha: "2026-11-17", pacienteId: beto }), usuario);
    if (!r.ok) throw new Error(JSON.stringify(r));
    id = r.datos.id;
    version = 1;
  });

  it("reprograma sin chocar consigo mismo y sube la versión", async () => {
    const r = await reprogramarTurno(db, { turnoId: id, fecha: "2026-11-17", hora: "09:30", duracionMin: 60, version }, usuario);
    expect(r.ok).toBe(true);
    version += 1;
  });

  it("rechaza una versión vieja", async () => {
    const r = await reprogramarTurno(db, { turnoId: id, fecha: "2026-11-17", hora: "10:00", duracionMin: 60, version: 1 }, usuario);
    expect(r).toMatchObject({ error: { codigo: "CONFLICTO_VERSION" } });
  });

  it("rechaza reprogramar encima de otro turno", async () => {
    await crearTurno(db, turno("15:00", { fecha: "2026-11-17" }), usuario);
    const r = await reprogramarTurno(db, { turnoId: id, fecha: "2026-11-17", hora: "15:00", duracionMin: 60, version }, usuario);
    expect(r).toMatchObject({ error: { codigo: "SOLAPAMIENTO" } });
  });

  it("ausente → liberar horario deja agendar otro turno; no se revierte", async () => {
    expect((await cambiarEstado(db, { turnoId: id, estado: "ausente", version }, usuario)).ok).toBe(true);
    version += 1;
    // Mientras no se libera, el lugar sigue ocupado.
    expect(await crearTurno(db, turno("09:30", { fecha: "2026-11-17" }), usuario)).toMatchObject({ error: { codigo: "SOLAPAMIENTO" } });
    expect((await liberarHorario(db, id, version, usuario)).ok).toBe(true);
    version += 1;
    expect((await crearTurno(db, turno("09:30", { fecha: "2026-11-17" }), usuario)).ok).toBe(true);
    expect(await liberarHorario(db, id, version, usuario)).toMatchObject({ error: { codigo: "INVALIDO" } });
    // Corregir a "atendido" ahora chocaría con el turno nuevo: la base no lo deja.
    expect(await cambiarEstado(db, { turnoId: id, estado: "atendido", version }, usuario)).toMatchObject({ error: { codigo: "SOLAPAMIENTO" } });
  });

  it("cancelar pide motivo, libera el lugar y es definitivo", async () => {
    const r = await crearTurno(db, turno("10:00", { fecha: "2026-11-19" }), usuario);
    if (!r.ok) throw new Error();
    expect(await cambiarEstado(db, { turnoId: r.datos.id, estado: "cancelado", version: 1 }, usuario)).toMatchObject({ error: { codigo: "INVALIDO" } });
    expect((await cambiarEstado(db, { turnoId: r.datos.id, estado: "cancelado", motivo: "Avisó que no puede", version: 1 }, usuario)).ok).toBe(true);
    expect((await crearTurno(db, turno("10:00", { fecha: "2026-11-19" }), usuario)).ok).toBe(true);
    expect(await cambiarEstado(db, { turnoId: r.datos.id, estado: "atendido", version: 2 }, usuario)).toMatchObject({ error: { codigo: "INVALIDO" } });
  });
});
