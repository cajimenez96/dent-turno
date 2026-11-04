import { describe, expect, it } from "vitest";
import { aInstante, diaIso, esFecha, esHora, fechaDe, horaDe, lunesDe, sumarDias } from "@/server/tiempo";

describe("tiempo (Buenos Aires, UTC-3)", () => {
  it("convierte hora local a instante y de vuelta", () => {
    const i = aInstante("2026-11-02", "09:30");
    expect(i.toISOString()).toBe("2026-11-02T12:30:00.000Z");
    expect(fechaDe(i)).toBe("2026-11-02");
    expect(horaDe(i)).toBe("09:30");
  });

  it("la medianoche local cae en el día correcto aunque en UTC ya sea el siguiente", () => {
    const i = new Date("2026-11-03T02:30:00Z"); // 23:30 del 2 en Buenos Aires
    expect(fechaDe(i)).toBe("2026-11-02");
    expect(horaDe(i)).toBe("23:30");
  });

  it("calcula el lunes de cualquier día de la semana, domingo incluido", () => {
    expect(lunesDe("2026-11-02")).toBe("2026-11-02");
    expect(lunesDe("2026-11-04")).toBe("2026-11-02");
    expect(lunesDe("2026-11-08")).toBe("2026-11-02"); // domingo
    expect(lunesDe("2026-11-09")).toBe("2026-11-09");
    expect(diaIso("2026-11-08")).toBe(7);
  });

  it("suma días cruzando mes y año", () => {
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("valida fechas y horas", () => {
    expect(esFecha("2026-02-30")).toBe(false);
    expect(esFecha("2026-11-02")).toBe(true);
    expect(esFecha("02/11/2026")).toBe(false);
    expect(esHora("24:00")).toBe(false);
    expect(esHora("09:05")).toBe(true);
  });
});
