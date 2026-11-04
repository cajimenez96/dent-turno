"use server";

import { redirect } from "next/navigation";
import { getDb } from "../db/cliente";
import { buscarPacientes, crearPaciente, desactivarPaciente, editarPaciente, type PacienteResumen } from "../pacientes/servicio";
import { aEstado, autorizar, confirma, texto, valoresDe, type EstadoForm } from "./comun";

/** Crea o edita (si viene `id`) un paciente. Si venía de agendar un turno, vuelve a esa pantalla con el paciente elegido. */
export async function guardarPaciente(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const valores = valoresDe(f);
  const a = await autorizar("pacientes.editar");
  if (a.error) return { ...a.error, valores };
  const id = texto(f, "id");
  const datos = {
    nombre: texto(f, "nombre"), apellido: texto(f, "apellido"), tipoDocumento: texto(f, "tipoDocumento") || "DNI",
    numeroDocumento: texto(f, "numeroDocumento"), telefono: texto(f, "telefono"), nacimiento: texto(f, "nacimiento"), email: texto(f, "email"),
  };
  const db = getDb();
  const r = id ? await editarPaciente(db, id, datos, a.usuario.id) : await crearPaciente(db, datos, a.usuario.id, confirma(f));
  if (!r.ok) return aEstado(r, valores);
  const volver = texto(f, "volverATurno").replace(/[^A-Za-z0-9=&:-]/g, ""); // solo parámetros simples de la URL
  if (volver) redirect(`/agenda/nuevo?${volver}&paciente=${r.datos.id}`);
  redirect(id ? `/pacientes/${id}?guardado=1` : `/pacientes/${r.datos.id}?guardado=1`);
}

export async function desactivarPacienteForm(_previo: EstadoForm, f: FormData): Promise<EstadoForm> {
  const a = await autorizar("pacientes.editar");
  if (a.error) return a.error;
  const r = await desactivarPaciente(getDb(), texto(f, "id"), a.usuario.id);
  if (!r.ok) return { error: r.error };
  redirect("/pacientes?desactivado=1");
}

/** Para el selector de pacientes de la pantalla de turno. */
export async function buscarPacientesAccion(texto: string): Promise<{ ok: true; pacientes: PacienteResumen[] } | { ok: false }> {
  const a = await autorizar("pacientes.ver");
  if (a.error) return { ok: false };
  return { ok: true, pacientes: await buscarPacientes(getDb(), texto, 8) };
}
