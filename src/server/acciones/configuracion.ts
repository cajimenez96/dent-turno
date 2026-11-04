"use server";

import { redirect } from "next/navigation";
import { getDb } from "../db/cliente";
import { anularBloqueo, crearBloqueo, guardarHorarioLaboral } from "../agenda/configuracion";
import { falla } from "../resultado";
import { aEstado, autorizar, confirma, texto, valoresDe, type EstadoForm } from "./comun";

const FRANJAS_POR_DIA = 2; // mañana y tarde

export async function guardarHorario(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const profesionalId = texto(f, "profesionalId");
  const a = await autorizar("agenda.configurar", profesionalId);
  if (a.error) return { ...a.error, valores };

  const franjas: { dia: number; inicio: string; fin: string }[] = [];
  for (let dia = 1; dia <= 7; dia++) {
    for (let n = 0; n < FRANJAS_POR_DIA; n++) {
      const inicio = texto(f, `inicio-${dia}-${n}`);
      const fin = texto(f, `fin-${dia}-${n}`);
      if (!inicio && !fin) continue;
      if (!inicio || !fin) {
        return aEstado(falla("INVALIDO", "Completá la hora de inicio y la de fin de cada franja, o dejá las dos vacías.", { campos: { [`${dia}`]: "Falta una de las dos horas." } }), valores);
      }
      franjas.push({ dia, inicio, fin });
    }
  }
  const r = await guardarHorarioLaboral(getDb(), { profesionalId, franjas }, a.usuario.id);
  if (!r.ok) return aEstado(r, valores);
  return { valores, hecho: "Horario guardado." };
}

export async function agregarBloqueo(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const profesionalId = texto(f, "profesionalId");
  const a = await autorizar("agenda.configurar", profesionalId);
  if (a.error) return { ...a.error, valores };
  const tipo = texto(f, "tipo");
  const comun = { profesionalId, motivo: texto(f, "motivo"), horaDesde: texto(f, "horaDesde"), horaHasta: texto(f, "horaHasta") };
  const entrada =
    tipo === "semanal"
      ? { tipo, ...comun, dia: texto(f, "dia") }
      : { tipo: "puntual", ...comun, fechaDesde: texto(f, "fechaDesde"), fechaHasta: texto(f, "fechaHasta") || texto(f, "fechaDesde") };
  const r = await crearBloqueo(getDb(), entrada, a.usuario.id, confirma(f));
  if (!r.ok) return aEstado(r, valores);
  redirect(`/configuracion?prof=${profesionalId}&bloqueo=1`);
}

export async function quitarBloqueo(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const profesionalId = texto(f, "profesionalId");
  const a = await autorizar("agenda.configurar", profesionalId);
  if (a.error) return a.error;
  const r = await anularBloqueo(getDb(), texto(f, "id"), profesionalId, a.usuario.id);
  if (!r.ok) return { error: r.error };
  redirect(`/configuracion?prof=${profesionalId}`);
}
