"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb } from "../db/cliente";
import { aplicarSaldoACuenta, anularCargo, anularCobro, crearCargo, editarMontoCargo, registrarCobro } from "../cobros/servicio";
import { formatoMonto } from "../dinero";
import { aEstado, autorizar, texto, valoresDe, type EstadoForm } from "./comun";

const noEncontrado = (valores: Record<string, string>): EstadoForm => ({
  error: { codigo: "NO_ENCONTRADO", mensaje: "No encontramos ese registro. Actualizá la página y probá de nuevo." },
  valores,
});

async function dueño(tabla: "cargos" | "cobros", id: string): Promise<{ pacienteId: string; profesionalId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const consulta = tabla === "cargos"
    ? sql`select paciente_id as "pacienteId", profesional_id as "profesionalId" from cargos where id = ${id}`
    : sql`select paciente_id as "pacienteId", profesional_id as "profesionalId" from cobros where id = ${id}`;
  const { rows } = await getDb().execute<{ pacienteId: string; profesionalId: string }>(consulta);
  return rows[0] ?? null;
}

const refrescar = (pacienteId: string) => {
  revalidatePath(`/pacientes/${pacienteId}/cuenta`);
  revalidatePath("/cobros");
};

export async function guardarCobro(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const profesionalId = texto(f, "profesionalId");
  const a = await autorizar("cobros.registrar", profesionalId);
  if (a.error) return { ...a.error, valores };
  const pacienteId = texto(f, "pacienteId");
  const r = await registrarCobro(getDb(), {
    profesionalId, pacienteId, fecha: texto(f, "fecha"), monto: texto(f, "monto"), medio: texto(f, "medio"),
    cargoId: texto(f, "cargoId") || undefined,
  }, a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  refrescar(pacienteId);
  const extra = r.datos.aCuenta !== "0.00" ? ` ${formatoMonto(r.datos.aCuenta)} quedaron como pago a cuenta.` : "";
  return { hecho: `Cobro registrado.${extra}`, valores: { fecha: valores.fecha ?? "", medio: valores.medio ?? "" } };
}

export async function guardarCargo(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const profesionalId = texto(f, "profesionalId");
  const a = await autorizar("cobros.registrar", profesionalId);
  if (a.error) return { ...a.error, valores };
  const pacienteId = texto(f, "pacienteId");
  const origen = texto(f, "origen") || "otro";
  const r = await crearCargo(getDb(), {
    profesionalId, pacienteId, fecha: texto(f, "fecha"), concepto: texto(f, "concepto"), monto: texto(f, "monto"), origen,
    trabajoId: texto(f, "trabajoId") || undefined,
  }, a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  refrescar(pacienteId);
  return { hecho: "Cargo agregado a la cuenta.", valores: { fecha: valores.fecha ?? "" } };
}

export async function corregirMontoCargo(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const d = await dueño("cargos", texto(f, "cargoId"));
  if (!d) return noEncontrado(valores);
  const a = await autorizar("cobros.registrar", d.profesionalId);
  if (a.error) return { ...a.error, valores };
  const r = await editarMontoCargo(getDb(), texto(f, "cargoId"), texto(f, "monto"), a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  refrescar(d.pacienteId);
  const aFavor = r.datos.aFavor ? ` Quedaron ${formatoMonto(r.datos.aFavor)} a favor del paciente.` : "";
  return { hecho: `Monto corregido.${aFavor}`, valores };
}

export async function anularCargoForm(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const d = await dueño("cargos", texto(f, "cargoId"));
  if (!d) return noEncontrado(valores);
  const a = await autorizar("cobros.anular", d.profesionalId);
  if (a.error) return { ...a.error, valores };
  const r = await anularCargo(getDb(), texto(f, "cargoId"), texto(f, "motivo"), a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  refrescar(d.pacienteId);
  return { hecho: "Cargo anulado.", valores: {} };
}

export async function anularCobroForm(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const d = await dueño("cobros", texto(f, "cobroId"));
  if (!d) return noEncontrado(valores);
  const a = await autorizar("cobros.anular", d.profesionalId);
  if (a.error) return { ...a.error, valores };
  const r = await anularCobro(getDb(), texto(f, "cobroId"), texto(f, "motivo"), a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  refrescar(d.pacienteId);
  return { hecho: "Cobro anulado. Quedó registrado con tu nombre y el motivo.", valores: {} };
}

export async function aplicarACuentaForm(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const profesionalId = texto(f, "profesionalId");
  const a = await autorizar("cobros.registrar", profesionalId);
  if (a.error) return { ...a.error, valores };
  const pacienteId = texto(f, "pacienteId");
  const r = await aplicarSaldoACuenta(getDb(), { pacienteId, profesionalId }, a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  refrescar(pacienteId);
  return { hecho: `Se aplicaron ${formatoMonto(r.datos.aplicado)} del dinero a cuenta a los cargos pendientes.`, valores: {} };
}
