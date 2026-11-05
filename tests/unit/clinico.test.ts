import { describe, expect, it } from "vitest";
import { leerMonto, formatoMonto } from "@/server/dinero";
import { esPiezaFdi, piezasDeCuadrante, PERMANENTES, TEMPORARIAS } from "@/server/clinico/fdi";
import { resumirCambio, normalizarPiezas } from "@/server/clinico/trabajos";

describe("montos a la argentina", () => {
  it.each([
    ["12.500", "12500.00"], ["12.500,50", "12500.50"], ["12500,5", "12500.50"], ["12500.50", "12500.50"],
    ["$ 1.234.567,89", "1234567.89"], ["0", "0.00"], ["", null], ["   ", null],
  ])("lee %j como %j", (entrada, esperado) => expect(leerMonto(entrada)).toBe(esperado));
  it.each(["abc", "-5", "1,234,5", "12.5.5", "1e3", "12,345"])("rechaza %j", (e) => expect(leerMonto(e)).toBeUndefined());
  it("da formato", () => {
    expect(formatoMonto("12500.50")).toBe("$ 12.500,50");
    expect(formatoMonto("0.00")).toBe("$ 0,00");
    expect(formatoMonto(null)).toBe("Sin monto");
  });
});

describe("numeración FDI", () => {
  it("tiene 32 permanentes y 20 temporarias, y solo ellas son válidas", () => {
    expect(PERMANENTES).toHaveLength(32);
    expect(TEMPORARIAS).toHaveLength(20);
    for (const p of ["11", "18", "28", "38", "48", "51", "55", "85"]) expect(esPiezaFdi(p)).toBe(true);
    for (const p of ["10", "19", "29", "49", "56", "86", "90", "1", "111", "ab"]) expect(esPiezaFdi(p)).toBe(false);
  });
  it("dibuja los cuadrantes como se ve la boca de frente", () => {
    expect(piezasDeCuadrante(1, 8, 1)).toEqual(["18", "17", "16", "15", "14", "13", "12", "11"]);
    expect(piezasDeCuadrante(2, 1, 8)).toEqual(["21", "22", "23", "24", "25", "26", "27", "28"]);
  });
});

describe("resumen de cambios", () => {
  const base = { fecha: "2026-03-12", descripcion: "Resina", monto: "12500.00", piezas: [{ pieza: "36", caras: ["O" as const], tratamiento: "Restauración" }] };
  it("sin cambios, vacío; el orden de piezas y caras no cuenta", () => {
    expect(resumirCambio(base, { ...base, piezas: normalizarPiezas(base.piezas) })).toEqual([]);
    expect(resumirCambio({ ...base, piezas: [{ pieza: "36", caras: ["O", "M"], tratamiento: "R" }, { pieza: "11", caras: [], tratamiento: "L" }] },
      { ...base, piezas: [{ pieza: "11", caras: [], tratamiento: "L" }, { pieza: "36", caras: ["M", "O"], tratamiento: "R" }] })).toEqual([]);
  });
  it("describe fecha, monto, descripción y piezas", () => {
    const r = resumirCambio(base, { fecha: "2026-03-14", descripcion: "Resina y pulido", monto: null, piezas: [{ pieza: "37", caras: [], tratamiento: "Limpieza" }] });
    expect(r).toEqual([
      "Fecha: 12/03/2026 → 14/03/2026",
      "Se modificó la descripción.",
      "Monto informado: $ 12.500,00 → Sin monto",
      "Se agregó: 37 · Limpieza",
      "Se quitó: 36 · Restauración (O)",
    ]);
  });
});
