import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as esquema from "@/server/db/esquema";
import type { Db } from "@/server/db/cliente";
import {
  anularCargo, anularCobro, aplicarSaldoACuenta, crearCargo, cuentaPaciente, editarMontoCargo, pacientesConSaldo, registrarCobro, reporteMensual,
} from "@/server/cobros/servicio";
import { crearTrabajo } from "@/server/clinico/trabajos";
import { baseTemporal, crearPaciente, crearProfesional } from "./ayuda";

let base: Awaited<ReturnType<typeof baseTemporal>>;
let db: Db;
let prof: string;
let otraProf: string;
let usuario: string;
let n = 0;

beforeAll(async () => {
  base = await baseTemporal();
  db = drizzle(base.cliente, { schema: esquema }) as unknown as Db;
  prof = await crearProfesional(base.cliente);
  otraProf = await crearProfesional(base.cliente, "Dr. Otro");
  usuario = (await base.cliente.query("insert into usuarios (email, nombre, clave_hash) values ('t@t.test','T','x') returning id")).rows[0].id;
});
afterAll(async () => base?.borrar());

/** Un paciente nuevo por prueba, para que los saldos no se mezclen. */
const nuevoPaciente = async () => crearPaciente(base.cliente, `Cuenta${++n}`);
const cargo = async (pacienteId: string, monto: string, extra: Record<string, unknown> = {}) => {
  const r = await crearCargo(db, { profesionalId: prof, pacienteId, fecha: "2026-03-10", concepto: "Prestación del 10/03", monto, origen: "otro", ...extra }, usuario);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.datos.id;
};
const cobro = async (pacienteId: string, monto: string, extra: Record<string, unknown> = {}) => {
  const r = await registrarCobro(db, { profesionalId: prof, pacienteId, fecha: "2026-03-11", monto, medio: "efectivo", ...extra }, usuario);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.datos;
};
const saldoPaciente = async (pacienteId: string) =>
  (await base.cliente.query("select cargos::text, cobrado::text, imputado::text, saldo::text, a_cuenta::text from v_saldo_paciente where paciente_id = $1 and profesional_id = $2", [pacienteId, prof])).rows[0];
const saldoCargo = async (id: string) => (await base.cliente.query("select saldo::text from v_saldo_cargo where cargo_id = $1", [id])).rows[0]?.saldo;

describe("cargos", () => {
  it("valida los datos y deja auditoría", async () => {
    const p = await nuevoPaciente();
    const mal = await crearCargo(db, { profesionalId: prof, pacienteId: p, fecha: "2999-01-01", concepto: " ", monto: "0", origen: "otro" }, usuario);
    expect(mal).toMatchObject({ ok: false, error: { campos: { fecha: expect.any(String), concepto: expect.any(String), monto: expect.any(String) } } });
    const id = await cargo(p, "12.500");
    expect(await saldoCargo(id)).toBe("12500.00");
    const a = await base.cliente.query("select accion from auditoria where entidad = 'cargo' and entidad_id = $1", [id]);
    expect(a.rows).toEqual([{ accion: "crear" }]);
  });

  it("un cargo por trabajo exige el trabajo y solo admite uno vigente", async () => {
    const p = await nuevoPaciente();
    expect(await crearCargo(db, { profesionalId: prof, pacienteId: p, fecha: "2026-03-10", concepto: "x", monto: "100", origen: "trabajo" }, usuario)).toMatchObject({ ok: false });
    const t = await crearTrabajo(db, { fecha: "2026-03-10", descripcion: "Algo", piezas: [], monto: "" }, { profesionalId: prof, pacienteId: p }, usuario);
    if (!t.ok) throw new Error();
    await cargo(p, "9000", { origen: "trabajo", trabajoId: t.datos.id });
    expect(await crearCargo(db, { profesionalId: prof, pacienteId: p, fecha: "2026-03-10", concepto: "otra vez", monto: "100", origen: "trabajo", trabajoId: t.datos.id }, usuario))
      .toMatchObject({ ok: false, error: { codigo: "INVALIDO" } });
    // Un trabajo de otro paciente no sirve.
    const q = await nuevoPaciente();
    expect(await crearCargo(db, { profesionalId: prof, pacienteId: q, fecha: "2026-03-10", concepto: "x", monto: "100", origen: "trabajo", trabajoId: t.datos.id }, usuario)).toMatchObject({ ok: false });
  });
});

describe("cobros parciales y pagos a cuenta (RF-42, RF-43)", () => {
  it("dos cobros parciales saldan el cargo y los saldos cuadran", async () => {
    const p = await nuevoPaciente();
    const g = await cargo(p, "10000");
    expect(await cobro(p, "4.000")).toMatchObject({ imputado: "4000.00", aCuenta: "0.00" });
    expect(await saldoCargo(g)).toBe("6000.00");
    expect(await saldoPaciente(p)).toMatchObject({ cargos: "10000.00", cobrado: "4000.00", saldo: "6000.00", a_cuenta: "0.00" });
    await cobro(p, "6000");
    expect(await saldoCargo(g)).toBe("0.00");
    expect(await saldoPaciente(p)).toMatchObject({ saldo: "0.00" });
  });

  it("lo que sobra queda como pago a cuenta y se aplica a un cargo nuevo", async () => {
    const p = await nuevoPaciente();
    const g1 = await cargo(p, "10000");
    expect(await cobro(p, "15000")).toMatchObject({ imputado: "10000.00", aCuenta: "5000.00" });
    expect(await saldoPaciente(p)).toMatchObject({ saldo: "-5000.00", a_cuenta: "5000.00" });
    const g2 = await cargo(p, "8000");
    expect(await saldoCargo(g2)).toBe("8000.00");
    expect(await aplicarSaldoACuenta(db, { pacienteId: p, profesionalId: prof }, usuario)).toMatchObject({ ok: true, datos: { aplicado: "5000.00" } });
    expect(await saldoCargo(g1)).toBe("0.00");
    expect(await saldoCargo(g2)).toBe("3000.00");
    expect(await saldoPaciente(p)).toMatchObject({ saldo: "3000.00", a_cuenta: "0.00" });
    expect(await aplicarSaldoACuenta(db, { pacienteId: p, profesionalId: prof }, usuario)).toMatchObject({ ok: false, error: { codigo: "INVALIDO" } });
  });

  it("reparte del cargo más antiguo al más nuevo, o primero el elegido", async () => {
    const p = await nuevoPaciente();
    const viejo = await cargo(p, "1000", { fecha: "2026-01-05" });
    const medio = await cargo(p, "1000", { fecha: "2026-02-05" });
    const nuevo = await cargo(p, "1000", { fecha: "2026-03-05" });
    await cobro(p, "1500");
    expect([await saldoCargo(viejo), await saldoCargo(medio), await saldoCargo(nuevo)]).toEqual(["0.00", "500.00", "1000.00"]);
    await cobro(p, "700", { cargoId: nuevo });
    expect([await saldoCargo(viejo), await saldoCargo(medio), await saldoCargo(nuevo)]).toEqual(["0.00", "500.00", "300.00"]);
    expect(await registrarCobro(db, { profesionalId: prof, pacienteId: p, fecha: "2026-03-11", monto: "10", medio: "efectivo", cargoId: viejo }, usuario))
      .toMatchObject({ ok: false, error: { codigo: "INVALIDO" } }); // ya está saldado
  });

  it("dos cobros simultáneos no pagan más de lo que debe el cargo", async () => {
    const p = await nuevoPaciente();
    const g = await cargo(p, "10000");
    const otro = drizzle(await base.clienteNuevo(), { schema: esquema }) as unknown as Db;
    const args = { profesionalId: prof, pacienteId: p, fecha: "2026-03-11", monto: "8000", medio: "efectivo" };
    const [a, b] = await Promise.all([registrarCobro(db, args, usuario), registrarCobro(otro, args, usuario)]);
    expect(a.ok && b.ok).toBe(true);
    expect(await saldoCargo(g)).toBe("0.00");
    expect(await saldoPaciente(p)).toMatchObject({ cobrado: "16000.00", imputado: "10000.00", a_cuenta: "6000.00", saldo: "-6000.00" });
  });

  it("valida el cobro", async () => {
    const p = await nuevoPaciente();
    expect(await registrarCobro(db, { profesionalId: prof, pacienteId: p, fecha: "2026-03-11", monto: "-5", medio: "efectivo" }, usuario)).toMatchObject({ ok: false });
    expect(await registrarCobro(db, { profesionalId: prof, pacienteId: p, fecha: "2026-03-11", monto: "5", medio: "cheque" }, usuario)).toMatchObject({ ok: false });
  });
});

describe("anulaciones (RF-44)", () => {
  it("anular un cobro devuelve el saldo, exige motivo y no se repite", async () => {
    const p = await nuevoPaciente();
    const g = await cargo(p, "10000");
    const c = await cobro(p, "10000");
    expect(await saldoCargo(g)).toBe("0.00");
    expect(await anularCobro(db, c.id, "  ", usuario)).toMatchObject({ ok: false, error: { campos: { motivo: expect.any(String) } } });
    const r = await anularCobro(db, c.id, "Transferencia rechazada", usuario);
    expect(r.ok).toBe(true);
    expect(await saldoCargo(g)).toBe("10000.00");
    expect(await saldoPaciente(p)).toMatchObject({ cobrado: "0.00", imputado: "0.00", saldo: "10000.00", a_cuenta: "0.00" });
    expect(await anularCobro(db, c.id, "otra vez", usuario)).toMatchObject({ ok: false, error: { codigo: "INVALIDO" } });
    if (r.ok) expect(await anularCobro(db, r.datos.id, "anular la anulación", usuario)).toMatchObject({ ok: false, error: { codigo: "INVALIDO" } });
    // Se puede volver a cobrar el cargo.
    await cobro(p, "10000");
    expect(await saldoCargo(g)).toBe("0.00");
  });

  it("la base no deja modificar ni borrar cobros e imputaciones, ni imputar de más", async () => {
    const p = await nuevoPaciente();
    const g = await cargo(p, "1000");
    const c = await cobro(p, "1000");
    const q = base.cliente;
    await expect(q.query("update cobros set monto = 1 where id = $1", [c.id])).rejects.toMatchObject({ code: "42501" });
    await expect(q.query("delete from cobros where id = $1", [c.id])).rejects.toMatchObject({ code: "42501" });
    await expect(q.query("update imputaciones set monto = 1")).rejects.toMatchObject({ code: "42501" });
    await expect(q.query("delete from imputaciones")).rejects.toMatchObject({ code: "42501" });
    await expect(q.query("truncate cobros cascade")).rejects.toMatchObject({ code: "42501" });
    await expect(q.query("insert into imputaciones (cobro_id, cargo_id, monto) values ($1, $2, 1)", [c.id, g])).rejects.toMatchObject({ code: "23514" });
    await expect(q.query("delete from cargos where id = $1", [g])).rejects.toMatchObject({ code: "42501" });
    await expect(q.query("update cargos set paciente_id = $1 where id = $2", [await nuevoPaciente(), g])).rejects.toMatchObject({ code: "42501" });
    // Un cobro de un profesional no paga cargos de otro.
    const otro = (await q.query("insert into cobros (profesional_id, paciente_id, fecha, monto, medio, tipo) values ($1, $2, '2026-03-11', 500, 'efectivo', 'cobro') returning id", [otraProf, p])).rows[0].id;
    await expect(q.query("insert into imputaciones (cobro_id, cargo_id, monto) values ($1, $2, 100)", [otro, g])).rejects.toMatchObject({ code: "23514" });
  });
});

describe("cambios de monto y anulación de cargos (S-05)", () => {
  it("bajar el monto de un cargo ya cobrado deja saldo a favor", async () => {
    const p = await nuevoPaciente();
    const g = await cargo(p, "10000");
    await cobro(p, "10000");
    const r = await editarMontoCargo(db, g, "7.000", usuario);
    expect(r).toMatchObject({ ok: true, datos: { aFavor: "3000.00" } });
    expect(await saldoCargo(g)).toBe("-3000.00");
    expect(await saldoPaciente(p)).toMatchObject({ saldo: "-3000.00" });
    const a = await base.cliente.query("select datos from auditoria where entidad = 'cargo' and accion = 'editar' and entidad_id = $1", [g]);
    expect(a.rows[0].datos).toMatchObject({ antes: { monto: "10000.00" }, despues: { monto: "7000.00" } });
    expect(await editarMontoCargo(db, g, "7000", usuario)).toMatchObject({ ok: false });
  });

  it("subir el monto vuelve a dejar saldo pendiente", async () => {
    const p = await nuevoPaciente();
    const g = await cargo(p, "1000");
    await cobro(p, "1000");
    await editarMontoCargo(db, g, "1500", usuario);
    expect(await saldoCargo(g)).toBe("500.00");
  });

  it("no se anula un cargo con cobros aplicados; sí después de anular el cobro", async () => {
    const p = await nuevoPaciente();
    const g = await cargo(p, "1000");
    const c = await cobro(p, "400");
    expect(await anularCargo(db, g, "Error de carga", usuario)).toMatchObject({ ok: false, error: { codigo: "INVALIDO" } });
    expect(await anularCargo(db, g, " ", usuario)).toMatchObject({ ok: false });
    await anularCobro(db, c.id, "Se devolvió", usuario);
    expect((await anularCargo(db, g, "Error de carga", usuario)).ok).toBe(true);
    expect(await saldoCargo(g)).toBeUndefined();
    expect(await saldoPaciente(p)).toMatchObject({ cargos: "0.00", saldo: "0.00" });
    expect(await anularCargo(db, g, "otra vez", usuario)).toMatchObject({ ok: false, error: { codigo: "NO_ENCONTRADO" } });
    await expect(base.cliente.query("update cargos set anulado = false, anulado_motivo = null, anulado_por = null, anulado_at = null where id = $1", [g]))
      .rejects.toMatchObject({ code: "42501" });
  });
});

describe("consultas y reporte", () => {
  it("la cuenta del paciente y la lista de saldos reflejan lo cargado y cobrado", async () => {
    const p = await nuevoPaciente();
    await cargo(p, "5000");
    const c = await cobro(p, "2000");
    const cuenta = await cuentaPaciente(db, p, [prof]);
    expect(cuenta.resumenes[0]).toMatchObject({ saldo: "3000.00", cobrado: "2000.00" });
    expect(cuenta.cargos).toHaveLength(1);
    expect(cuenta.cobros[0]).toMatchObject({ id: c.id, imputado: "2000.00", anulado: false });
    const deudores = await pacientesConSaldo(db, [prof]);
    expect(deudores.find((x) => x.pacienteId === p)).toMatchObject({ saldo: "3000.00" });
    expect(await pacientesConSaldo(db, [])).toEqual([]);
    expect(await cuentaPaciente(db, p, [])).toEqual({ resumenes: [], cargos: [], cobros: [] });
  });

  it("el reporte mensual coincide con la suma manual de otro profesional aislado", async () => {
    const pr = await crearProfesional(base.cliente, "Dra. Reporte");
    const p = await nuevoPaciente();
    const c1 = await crearCargo(db, { profesionalId: pr, pacienteId: p, fecha: "2026-05-02", concepto: "A", monto: "10000", origen: "otro" }, usuario);
    await crearCargo(db, { profesionalId: pr, pacienteId: p, fecha: "2026-05-20", concepto: "B", monto: "2500,50", origen: "ausencia" }, usuario);
    await crearCargo(db, { profesionalId: pr, pacienteId: p, fecha: "2026-04-30", concepto: "Abril", monto: "999", origen: "otro" }, usuario);
    const anulado = await crearCargo(db, { profesionalId: pr, pacienteId: p, fecha: "2026-05-21", concepto: "Anulado", monto: "777", origen: "otro" }, usuario);
    if (!c1.ok || !anulado.ok) throw new Error();
    await anularCargo(db, anulado.datos.id, "Error", usuario);
    await registrarCobro(db, { profesionalId: pr, pacienteId: p, fecha: "2026-05-03", monto: "6000", medio: "efectivo" }, usuario);
    await registrarCobro(db, { profesionalId: pr, pacienteId: p, fecha: "2026-05-04", monto: "1000", medio: "transferencia" }, usuario);
    await base.cliente.query("insert into turnos (profesional_id, paciente_id, rango, estado) values ($1, $2, tstzrange('2026-05-05T10:00:00-03','2026-05-05T11:00:00-03','[)'), 'atendido'), ($1, $2, tstzrange('2026-05-06T10:00:00-03','2026-05-06T11:00:00-03','[)'), 'ausente'), ($1, $2, tstzrange('2026-06-01T00:30:00-03','2026-06-01T01:30:00-03','[)'), 'atendido')", [pr, p]);
    const r = await reporteMensual(db, pr, 2026, 5);
    expect(r.prestaciones).toMatchObject({ total: "12500.50", cantidad: 2 });
    expect(r.prestaciones.porOrigen).toEqual([{ origen: "ausencia", total: "2500.50" }, { origen: "otro", total: "10000.00" }]);
    expect(r.cobrado.total).toBe("7000.00");
    expect(r.cobrado.porMedio).toEqual([{ medio: "efectivo", total: "6000.00" }, { medio: "transferencia", total: "1000.00" }]);
    expect(r.turnos).toMatchObject({ atendido: 1, ausente: 1, cancelado: 0 }); // el del 1/6 a las 00:30 ya es junio
    expect(r.pacientesAtendidos).toBe(1);
    expect(r.pendienteHoy).toBe("6499.50"); // cargos vigentes 10000 + 2500,50 + 999 (13499,50) menos 7000 cobrado
  });
});
