import { describe, expect, it } from "vitest";
import {
  debeRefrescarActividad,
  evaluarSesion,
  ingresoBloqueado,
  msHastaCierre,
  validarClave,
} from "@/server/auth/reglas";

const minuto = 60 * 1000;
const hora = 60 * minuto;
const base = new Date("2026-11-04T12:00:00Z");
const despues = (ms: number) => new Date(base.getTime() + ms);

describe("expiración por inactividad (RF-02, RNF-09)", () => {
  it("la sesión es válida con actividad reciente", () => {
    expect(evaluarSesion({ creadaAt: base, ultimaActividad: despues(10 * minuto) }, despues(20 * minuto))).toBe("valida");
  });
  it("vence a los 30 minutos sin actividad", () => {
    const s = { creadaAt: base, ultimaActividad: base };
    expect(evaluarSesion(s, despues(30 * minuto))).toBe("valida"); // justo en el límite todavía vale
    expect(evaluarSesion(s, despues(30 * minuto + 1))).toBe("inactiva");
  });
  it("caduca a las 12 horas aunque haya actividad", () => {
    const s = { creadaAt: base, ultimaActividad: despues(12 * hora - minuto) };
    expect(evaluarSesion(s, despues(12 * hora + 1))).toBe("caducada");
  });
});

describe("registro de actividad", () => {
  it("se renueva como mucho una vez por minuto", () => {
    expect(debeRefrescarActividad(base, despues(59 * 1000))).toBe(false);
    expect(debeRefrescarActividad(base, despues(minuto))).toBe(true);
  });
  it("calcula cuánto falta para el cierre y nunca da negativo", () => {
    expect(msHastaCierre(base, despues(10 * minuto))).toBe(20 * minuto);
    expect(msHastaCierre(base, despues(2 * hora))).toBe(0);
  });
});

describe("límite de intentos y clave", () => {
  it("bloquea desde el quinto fallido", () => {
    expect(ingresoBloqueado(4)).toBe(false);
    expect(ingresoBloqueado(5)).toBe(true);
  });
  it("exige 12 caracteres como mínimo", () => {
    expect(validarClave("corta")).not.toBeNull();
    expect(validarClave("una clave larga ok")).toBeNull();
  });
});
