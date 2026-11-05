"use server";

import { redirect } from "next/navigation";
import { getDb } from "../db/cliente";
import { crearTrabajo, editarTrabajo, eliminarTrabajo, obtenerTrabajo } from "../clinico/trabajos";
import { CARAS } from "../clinico/fdi";
import { aEstado, autorizar, confirma, texto, valoresDe, type EstadoForm } from "./comun";

/** Lee la lista de piezas que el formulario manda como JSON. Lo que no sea una lista válida se rechaza como dato inválido. */
function leerPiezas(f: FormData): unknown {
  try {
    const v = JSON.parse(texto(f, "piezas") || "[]");
    return Array.isArray(v) ? v.map((p) => ({ pieza: String(p?.pieza ?? ""), tratamiento: String(p?.tratamiento ?? ""), caras: (Array.isArray(p?.caras) ? p.caras : []).filter((c: unknown) => CARAS.includes(c as never)) })) : "no-es-lista";
  } catch {
    return "no-es-lista";
  }
}

const datosDe = (f: FormData) => ({ fecha: texto(f, "fecha"), descripcion: texto(f, "descripcion"), monto: texto(f, "monto"), piezas: leerPiezas(f) });

export async function guardarTrabajoNuevo(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const profesionalId = texto(f, "profesionalId");
  const a = await autorizar("clinico.editar", profesionalId);
  if (a.error) return { ...a.error, valores };
  const pacienteId = texto(f, "pacienteId");
  const r = await crearTrabajo(getDb(), datosDe(f), { profesionalId, pacienteId, turnoId: texto(f, "turnoId") || null }, a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  redirect(`/pacientes/${pacienteId}/historial?guardado=1`);
}

export async function guardarEdicionTrabajo(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const db = getDb();
  const actual = await obtenerTrabajo(db, texto(f, "trabajoId"));
  if (!actual) return { error: { codigo: "NO_ENCONTRADO", mensaje: "No encontramos ese trabajo. Puede que ya esté eliminado." }, valores };
  const a = await autorizar("clinico.editar", actual.profesionalId);
  if (a.error) return { ...a.error, valores };
  const r = await editarTrabajo(db, datosDe(f), { trabajoId: actual.id, version: Number(texto(f, "version")) }, a.usuario.id, confirma(f));
  if (!r.ok) return aEstado(r, valores);
  redirect(`/pacientes/${actual.pacienteId}/historial?guardado=1`);
}

export async function eliminarTrabajoForm(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const db = getDb();
  const actual = await obtenerTrabajo(db, texto(f, "trabajoId"));
  if (!actual) return { error: { codigo: "NO_ENCONTRADO", mensaje: "No encontramos ese trabajo. Puede que ya esté eliminado." }, valores };
  const a = await autorizar("clinico.editar", actual.profesionalId);
  if (a.error) return { ...a.error, valores };
  const r = await eliminarTrabajo(db, actual.id, texto(f, "motivo"), a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  redirect(`/pacientes/${actual.pacienteId}/historial?eliminado=1`);
}
