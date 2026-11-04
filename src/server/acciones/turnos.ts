"use server";

import { redirect } from "next/navigation";
import { getDb } from "../db/cliente";
import { cambiarEstado, crearTurno, liberarHorario, obtenerTurno, reprogramarTurno } from "../agenda/turnos";
import { lunesDe, fechaDe } from "../tiempo";
import { aEstado, autorizar, confirma, texto, valoresDe, type EstadoForm } from "./comun";

const aSemana = (fecha: string, prof: string, extra = "") => `/agenda?semana=${lunesDe(fecha)}&prof=${prof}${extra}`;

export async function agendarTurno(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const profesionalId = texto(f, "profesionalId");
  const a = await autorizar("agenda.editar", profesionalId);
  if (a.error) return { ...a.error, valores };
  const r = await crearTurno(
    getDb(),
    { profesionalId, pacienteId: texto(f, "pacienteId"), fecha: texto(f, "fecha"), hora: texto(f, "hora"), duracionMin: texto(f, "duracionMin") },
    a.usuario.id,
    confirma(f),
  );
  if (!r.ok) return aEstado(r, valores);
  redirect(aSemana(texto(f, "fecha"), profesionalId, `&nuevo=${r.datos.id}`));
}

/** Carga el turno y comprueba que el usuario pueda editar la agenda de su profesional. */
async function turnoAutorizado(f: FormData) {
  const turno = await obtenerTurno(getDb(), texto(f, "turnoId"));
  if (!turno) return { error: { error: { codigo: "NO_ENCONTRADO", mensaje: "No encontramos ese turno. Puede que ya no exista." } } satisfies EstadoForm };
  const a = await autorizar("agenda.editar", turno.profesionalId);
  if (a.error) return { error: a.error };
  return { turno, usuario: a.usuario };
}

export async function moverTurno(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const c = await turnoAutorizado(f);
  if (c.error) return { ...c.error, valores };
  const r = await reprogramarTurno(
    getDb(),
    { turnoId: c.turno.id, fecha: texto(f, "fecha"), hora: texto(f, "hora"), duracionMin: texto(f, "duracionMin"), version: texto(f, "version") },
    c.usuario.id,
    confirma(f),
  );
  if (!r.ok) return aEstado(r, valores);
  redirect(aSemana(texto(f, "fecha"), c.turno.profesionalId, `&nuevo=${c.turno.id}`));
}

export async function cambiarEstadoTurno(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const c = await turnoAutorizado(f);
  if (c.error) return { ...c.error, valores };
  const r = await cambiarEstado(
    getDb(),
    { turnoId: c.turno.id, estado: texto(f, "estado"), motivo: texto(f, "motivo") || undefined, version: texto(f, "version") },
    c.usuario.id,
  );
  if (!r.ok) return aEstado(r, valores);
  redirect(aSemana(fechaDe(c.turno.inicio), c.turno.profesionalId));
}

export async function liberarHorarioTurno(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const c = await turnoAutorizado(f);
  if (c.error) return c.error;
  const r = await liberarHorario(getDb(), c.turno.id, Number(texto(f, "version")), c.usuario.id);
  if (!r.ok) return { error: r.error };
  redirect(aSemana(fechaDe(c.turno.inicio), c.turno.profesionalId));
}
