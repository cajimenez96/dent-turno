import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { baseTemporal, crearPaciente, crearProfesional, crearTurno } from "./ayuda";

let base: Awaited<ReturnType<typeof baseTemporal>>;
let c: pg.Client;
let prof: string;
let otra: string;
let paciente: string;

beforeAll(async () => {
  base = await baseTemporal();
  c = base.cliente;
  prof = await crearProfesional(c, "Dra. Uno");
  otra = await crearProfesional(c, "Dr. Dos");
  paciente = await crearPaciente(c);
});
afterAll(async () => base?.borrar());

const t = (h: string) => `2026-11-10T${h}:00-03:00`;

describe("sin turnos superpuestos (RF-22)", () => {
  it("rechaza un turno que pisa a otro del mismo profesional (código 23P01)", async () => {
    await crearTurno(c, prof, paciente, t("10:00"), t("11:00"));
    await expect(crearTurno(c, prof, paciente, t("10:30"), t("11:30"))).rejects.toMatchObject({ code: "23P01" });
  });

  it("permite turnos que se tocan en el borde: [10:00, 11:00) y [11:00, 12:00)", async () => {
    await expect(crearTurno(c, prof, paciente, t("11:00"), t("12:00"))).resolves.toBeDefined();
  });

  it("permite el mismo horario para otro profesional", async () => {
    await expect(crearTurno(c, otra, paciente, t("10:00"), t("11:00"))).resolves.toBeDefined();
  });

  it("dos pedidos simultáneos al mismo horario: uno gana y uno falla", async () => {
    const extra = await base.clienteNuevo();
    try {
      const resultados = await Promise.allSettled([
        crearTurno(c, prof, paciente, t("15:00"), t("16:00")),
        crearTurno(extra, prof, paciente, t("15:00"), t("16:00")),
      ]);
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
    } finally {
      await extra.end();
    }
  });

  it("un turno cancelado libera el horario", async () => {
    const { rows } = await crearTurno(c, prof, paciente, t("17:00"), t("18:00"));
    await c.query("update turnos set estado = 'cancelado' where id = $1", [rows[0].id]);
    await expect(crearTurno(c, prof, paciente, t("17:00"), t("18:00"))).resolves.toBeDefined();
  });

  it("una ausencia ocupa el horario hasta que la profesional lo libera (S-01)", async () => {
    const { rows } = await crearTurno(c, prof, paciente, t("08:00"), t("09:00"));
    await c.query("update turnos set estado = 'ausente' where id = $1", [rows[0].id]);
    await expect(crearTurno(c, prof, paciente, t("08:00"), t("09:00"))).rejects.toMatchObject({ code: "23P01" });
    await c.query("update turnos set horario_liberado = true where id = $1", [rows[0].id]);
    await expect(crearTurno(c, prof, paciente, t("08:00"), t("09:00"))).resolves.toBeDefined();
  });

  it("rechaza rangos vacíos o sin límite", async () => {
    await expect(crearTurno(c, prof, paciente, t("12:00"), t("12:00"))).rejects.toMatchObject({ code: "23514" });
    await expect(
      c.query(
        "insert into turnos (profesional_id, paciente_id, rango) values ($1, $2, tstzrange($3::timestamptz, null))",
        [prof, paciente, t("13:00")],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rechaza estados desconocidos", async () => {
    await expect(
      c.query(
        "insert into turnos (profesional_id, paciente_id, rango, estado) values ($1, $2, tstzrange($3::timestamptz, $4::timestamptz), 'raro')",
        [prof, paciente, t("19:00"), t("20:00")],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
