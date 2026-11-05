import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/cliente";
import { registrar } from "../auditoria";
import { leerMonto, formatoMonto } from "../dinero";
import { camposDeZod, falla, ok, type Resultado } from "../resultado";
import { aFecha, esFecha, hoy } from "../tiempo";
import { CARAS, esPiezaFdi, type Cara } from "./fdi";

export type PiezaTratada = { pieza: string; caras: Cara[]; tratamiento: string };

const pieza = z.object({
  pieza: z.string().refine(esPiezaFdi, "La pieza dental no es válida (por ejemplo 36, o 75 si es temporaria)."),
  caras: z.array(z.enum(CARAS)).max(5).default([]),
  tratamiento: z.string().trim().min(1, "Escribí el tratamiento de cada pieza.").max(80, "El tratamiento admite hasta 80 caracteres."),
});

export const entradaTrabajo = z.object({
  fecha: z.string().refine(esFecha, "Elegí la fecha.").refine((f) => f <= hoy(), "La fecha no puede ser futura."),
  descripcion: z.string().trim().min(1, "Describí el trabajo realizado.").max(2000, "La descripción admite hasta 2000 caracteres."),
  piezas: z.array(pieza).max(40, "Son demasiadas piezas para un solo trabajo."),
  monto: z.string().default("").transform((t, ctx) => {
    const m = leerMonto(t);
    if (m === undefined) {
      ctx.addIssue({ code: "custom", message: "Escribí un monto válido, por ejemplo 12.500 o 12.500,50." });
      return z.NEVER;
    }
    return m;
  }),
});

export type DatosTrabajo = { fecha: string; descripcion: string; piezas: PiezaTratada[]; monto: string | null };

/** Piezas en orden estable y con las caras en el orden M, D, V, L, O, para poder compararlas. */
export function normalizarPiezas(piezas: PiezaTratada[]): PiezaTratada[] {
  return piezas
    .map((p) => ({ pieza: p.pieza, tratamiento: p.tratamiento.trim(), caras: [...new Set(p.caras)].sort((a, b) => CARAS.indexOf(a) - CARAS.indexOf(b)) }))
    .sort((a, b) => a.pieza.localeCompare(b.pieza) || a.tratamiento.localeCompare(b.tratamiento));
}

const etiquetaPieza = (p: PiezaTratada) => `${p.pieza} · ${p.tratamiento}${p.caras.length ? ` (${p.caras.join(", ")})` : ""}`;
const dmy = (f: string) => f.split("-").reverse().join("/");

/** Lo que cambió entre dos versiones, en frases para la doctora (flujo 6.5). Vacío = no hay cambios. */
export function resumirCambio(antes: DatosTrabajo, despues: DatosTrabajo): string[] {
  const l: string[] = [];
  if (antes.fecha !== despues.fecha) l.push(`Fecha: ${dmy(antes.fecha)} → ${dmy(despues.fecha)}`);
  if (antes.descripcion.trim() !== despues.descripcion.trim()) l.push("Se modificó la descripción.");
  if (antes.monto !== despues.monto) l.push(`Monto informado: ${formatoMonto(antes.monto)} → ${formatoMonto(despues.monto)}`);
  const clave = (p: PiezaTratada) => etiquetaPieza(p);
  const a = new Map(normalizarPiezas(antes.piezas).map((p) => [clave(p), p]));
  const d = new Map(normalizarPiezas(despues.piezas).map((p) => [clave(p), p]));
  for (const [k] of d) if (!a.has(k)) l.push(`Se agregó: ${k}`);
  for (const [k] of a) if (!d.has(k)) l.push(`Se quitó: ${k}`);
  return l;
}

const parsear = (entrada: unknown) => {
  const r = entradaTrabajo.safeParse(entrada);
  return r.success
    ? ({ ok: true as const, datos: { fecha: r.data.fecha, descripcion: r.data.descripcion, piezas: normalizarPiezas(r.data.piezas as PiezaTratada[]), monto: r.data.monto } })
    : ({ ok: false as const, campos: camposDeZod(r.error) });
};

const invalido = (campos: Record<string, string>) => falla("INVALIDO", "Revisá los datos marcados.", { campos });

export async function crearTrabajo(
  db: Db,
  entrada: unknown,
  ids: { profesionalId: string; pacienteId: string; turnoId?: string | null },
  usuarioId: string,
): Promise<Resultado<{ id: string }>> {
  const p = parsear(entrada);
  if (!p.ok) return invalido(p.campos);
  const d = p.datos;
  return db.transaction(async (tx) => {
    const pac = await tx.execute(sql`select 1 from pacientes where id = ${ids.pacienteId} and activo`);
    if (pac.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos al paciente.");
    const prof = await tx.execute(sql`select 1 from profesionales where id = ${ids.profesionalId} and activo`);
    if (prof.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos al profesional.");
    if (ids.turnoId) {
      const t = await tx.execute(
        sql`select 1 from turnos where id = ${ids.turnoId} and paciente_id = ${ids.pacienteId} and profesional_id = ${ids.profesionalId}`,
      );
      if (t.rows.length === 0) return falla("INVALIDO", "Ese turno no es de este paciente.");
    }
    const c = await tx.execute<{ id: string }>(sql`
      insert into trabajos (profesional_id, paciente_id, turno_id)
      values (${ids.profesionalId}, ${ids.pacienteId}, ${ids.turnoId ?? null}) returning id`);
    const id = c.rows[0].id;
    await tx.execute(sql`
      insert into trabajo_versiones (trabajo_id, numero, fecha, descripcion, piezas, monto_informado, editado_por)
      values (${id}, 1, ${d.fecha}::date, ${d.descripcion}, ${JSON.stringify(d.piezas)}::jsonb, ${d.monto}::numeric, ${usuarioId})`);
    await registrar(tx, {
      accion: "crear", entidad: "trabajo", entidadId: id, usuarioId, pacienteId: ids.pacienteId, profesionalId: ids.profesionalId,
      datos: { turnoId: ids.turnoId ?? null, piezas: d.piezas.length },
    });
    return ok({ id });
  });
}

export type VersionTrabajo = DatosTrabajo & { numero: number; editadoPor: string | null; editadoAt: Date; resumen: string | null };

type FilaVersion = Omit<VersionTrabajo, "editadoAt" | "piezas"> & { editadoAt: Date | string; piezas: PiezaTratada[] };
const COLUMNAS_VERSION = sql`v.numero, to_char(v.fecha, 'YYYY-MM-DD') as fecha, v.descripcion, v.piezas, v.monto_informado::text as monto,
  u.nombre as "editadoPor", v.editado_at as "editadoAt", v.resumen_cambio as resumen`;
const aVersion = (f: FilaVersion): VersionTrabajo => ({ ...f, editadoAt: aFecha(f.editadoAt) });

export type EditarEntrada = { trabajoId: string; version: number };

/**
 * Edita un trabajo agregando una versión nueva; la anterior queda intacta. Sin `confirmar` devuelve el resumen del
 * cambio (REQUIERE_CONFIRMACION) y no guarda nada. `version` es la que el usuario estaba viendo.
 */
export async function editarTrabajo(
  db: Db,
  entrada: unknown,
  ref: EditarEntrada,
  usuarioId: string,
  confirmar = false,
): Promise<Resultado<{ id: string; version: number }>> {
  const p = parsear(entrada);
  if (!p.ok) return invalido(p.campos);
  const nuevo = p.datos;
  return db.transaction(async (tx) => {
    const cab = await tx.execute<{ versionActual: number; eliminado: boolean; pacienteId: string; profesionalId: string }>(sql`
      select version_actual as "versionActual", eliminado, paciente_id as "pacienteId", profesional_id as "profesionalId"
      from trabajos where id = ${ref.trabajoId} for update`);
    const t = cab.rows[0];
    if (!t || t.eliminado) return falla("NO_ENCONTRADO", "No encontramos ese trabajo. Puede que ya esté eliminado.");
    if (t.versionActual !== ref.version) {
      return falla("CONFLICTO_VERSION", "Este trabajo se modificó mientras lo editabas. Recargá la página para ver la versión actual.");
    }
    const act = await tx.execute<FilaVersion>(
      sql`select ${COLUMNAS_VERSION} from trabajo_versiones v left join usuarios u on u.id = v.editado_por where v.trabajo_id = ${ref.trabajoId} and v.numero = ${t.versionActual}`,
    );
    const antes = act.rows[0];
    const resumen = resumirCambio(antes, nuevo);
    if (resumen.length === 0) return falla("INVALIDO", "No cambiaste nada: el trabajo sigue igual.");
    if (!confirmar) {
      return falla("REQUIERE_CONFIRMACION", "Revisá lo que va a cambiar.", { detalle: { resumen, versionNueva: t.versionActual + 1 } });
    }
    const numero = t.versionActual + 1;
    await tx.execute(sql`
      insert into trabajo_versiones (trabajo_id, numero, fecha, descripcion, piezas, monto_informado, editado_por, resumen_cambio)
      values (${ref.trabajoId}, ${numero}, ${nuevo.fecha}::date, ${nuevo.descripcion}, ${JSON.stringify(nuevo.piezas)}::jsonb,
              ${nuevo.monto}::numeric, ${usuarioId}, ${resumen.join("\n")})`);
    await tx.execute(sql`update trabajos set version_actual = ${numero} where id = ${ref.trabajoId}`);
    await registrar(tx, {
      accion: "editar", entidad: "trabajo", entidadId: ref.trabajoId, usuarioId, pacienteId: t.pacienteId, profesionalId: t.profesionalId,
      datos: { version: numero, resumen },
    });
    return ok({ id: ref.trabajoId, version: numero });
  });
}

/** Oculta el trabajo con un motivo. Nunca se borra: las versiones y la auditoría quedan. */
export async function eliminarTrabajo(db: Db, trabajoId: string, motivo: string, usuarioId: string): Promise<Resultado<{ id: string }>> {
  const m = motivo.trim();
  if (m === "") return falla("INVALIDO", "Escribí el motivo de la eliminación.", { campos: { motivo: "Escribí el motivo." } });
  if (m.length > 300) return falla("INVALIDO", "El motivo admite hasta 300 caracteres.", { campos: { motivo: "Usá 300 caracteres o menos." } });
  return db.transaction(async (tx) => {
    const r = await tx.execute<{ pacienteId: string; profesionalId: string }>(sql`
      update trabajos set eliminado = true, eliminado_motivo = ${m}, eliminado_por = ${usuarioId}, eliminado_at = now()
      where id = ${trabajoId} and not eliminado returning paciente_id as "pacienteId", profesional_id as "profesionalId"`);
    if (r.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos ese trabajo. Puede que ya esté eliminado.");
    await registrar(tx, {
      accion: "anular", entidad: "trabajo", entidadId: trabajoId, usuarioId, pacienteId: r.rows[0].pacienteId,
      profesionalId: r.rows[0].profesionalId, datos: { motivo: m },
    });
    return ok({ id: trabajoId });
  });
}

export type TrabajoResumen = {
  id: string;
  profesionalId: string;
  pacienteId: string;
  turnoId: string | null;
  versionActual: number;
  profesional: string;
} & DatosTrabajo;

type FilaTrabajo = Omit<TrabajoResumen, "piezas"> & { piezas: PiezaTratada[] };
const SELECT_TRABAJO = sql`
  select t.id, t.profesional_id as "profesionalId", t.paciente_id as "pacienteId", t.turno_id as "turnoId",
         t.version_actual as "versionActual", pr.nombre as profesional,
         to_char(v.fecha, 'YYYY-MM-DD') as fecha, v.descripcion, v.piezas, v.monto_informado::text as monto
  from trabajos t
  join trabajo_versiones v on v.trabajo_id = t.id and v.numero = t.version_actual
  join profesionales pr on pr.id = t.profesional_id`;

/** Trabajos vigentes de un paciente, solo de los profesionales indicados (el alcance de quien consulta). */
export async function historialPaciente(db: Pick<Db, "execute">, pacienteId: string, profesionalIds: string[]): Promise<TrabajoResumen[]> {
  if (profesionalIds.length === 0) return [];
  const { rows } = await db.execute<FilaTrabajo>(sql`
    ${SELECT_TRABAJO}
    where t.paciente_id = ${pacienteId} and not t.eliminado and t.profesional_id in (${sql.join(profesionalIds.map((i) => sql`${i}::uuid`), sql`, `)})
    order by v.fecha desc, t.creado_at desc`);
  return rows;
}

export async function obtenerTrabajo(db: Pick<Db, "execute">, trabajoId: string): Promise<TrabajoResumen | null> {
  const { rows } = await db.execute<FilaTrabajo>(sql`${SELECT_TRABAJO} where t.id = ${trabajoId} and not t.eliminado`);
  return rows[0] ?? null;
}

export async function versionesTrabajo(db: Pick<Db, "execute">, trabajoId: string): Promise<VersionTrabajo[]> {
  const { rows } = await db.execute<FilaVersion>(sql`
    select ${COLUMNAS_VERSION} from trabajo_versiones v left join usuarios u on u.id = v.editado_por
    where v.trabajo_id = ${trabajoId} order by v.numero desc`);
  return rows.map(aVersion);
}

export type EntradaOdontograma = { trabajoId: string; fecha: string; tratamiento: string; caras: Cara[] };

/** Qué se le hizo a cada pieza, leyendo la versión vigente de cada trabajo. Más reciente primero. */
export function armarOdontograma(trabajos: TrabajoResumen[]): Map<string, EntradaOdontograma[]> {
  const m = new Map<string, EntradaOdontograma[]>();
  for (const t of trabajos) {
    for (const p of t.piezas) {
      const lista = m.get(p.pieza) ?? [];
      lista.push({ trabajoId: t.id, fecha: t.fecha, tratamiento: p.tratamiento, caras: p.caras });
      m.set(p.pieza, lista);
    }
  }
  for (const lista of m.values()) lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return m;
}

export type AtendidoSinTrabajo = { id: string; inicio: Date; pacienteId: string; paciente: string };

/** Turnos atendidos sin ningún trabajo registrado (RF-27). */
export async function atendidosSinTrabajo(db: Pick<Db, "execute">, profesionalId: string, limite = 20): Promise<AtendidoSinTrabajo[]> {
  const { rows } = await db.execute<Omit<AtendidoSinTrabajo, "inicio"> & { inicio: Date | string }>(sql`
    select t.id, lower(t.rango) as inicio, t.paciente_id as "pacienteId", p.apellido || ', ' || p.nombre as paciente
    from turnos t join pacientes p on p.id = t.paciente_id
    where t.profesional_id = ${profesionalId} and t.estado = 'atendido'
      and not exists (select 1 from trabajos w where w.turno_id = t.id and not w.eliminado)
    order by lower(t.rango) desc limit ${limite}`);
  return rows.map((r) => ({ ...r, inicio: aFecha(r.inicio) }));
}
