import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/cliente";
import { registrar } from "../auditoria";
import { camposDeZod, codigoPg, falla, ok, type Resultado } from "../resultado";
import { aFecha, aInstante, esFecha, esHora, horaDe, literalRango, minutosDe } from "../tiempo";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type ESTADOS = "programado" | "atendido" | "ausente" | "cancelado";

// Los turnos que ocupan lugar: la misma condición que la restricción `turnos_sin_solapamiento`.
const OCUPA = sql`(estado in ('programado', 'atendido') or (estado = 'ausente' and not horario_liberado))`;

const fecha = z.string().refine(esFecha, "Elegí una fecha.");
const hora = z.string().refine(esHora, "Elegí una hora.");

export const entradaTurno = z.object({
  profesionalId: z.uuid(),
  pacienteId: z.uuid("Elegí un paciente."),
  fecha,
  hora,
  duracionMin: z.coerce.number("Elegí la duración.").int("Elegí la duración."),
});

export const entradaReprogramar = z.object({
  turnoId: z.uuid(),
  fecha,
  hora,
  duracionMin: z.coerce.number("Elegí la duración.").int("Elegí la duración."),
  version: z.coerce.number().int(),
});

/** Un pedido por profesional a la vez: evita la carrera entre "crear bloqueo" y "crear turno". */
export const tomarCandado = (tx: Tx, profesionalId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"sto-agenda:" + profesionalId}))`);

const rangoSql = (inicio: Date, fin: Date) => sql`${literalRango(inicio, fin)}::tstzrange`;

const hhmm = (d: Date) => horaDe(d);

/**
 * Valida duración y alineación con la grilla del profesional. Devuelve el rango o el error de campo.
 */
async function rangoValido(
  tx: Tx,
  profesionalId: string,
  f: string,
  h: string,
  duracionMin: number,
): Promise<Resultado<{ inicio: Date; fin: Date }>> {
  const { rows } = await tx.execute<{ minima: number; paso: number }>(
    sql`select duracion_minima_min as minima, paso_min as paso from profesionales where id = ${profesionalId} and activo`,
  );
  const p = rows[0];
  if (!p) return falla("NO_ENCONTRADO", "No encontramos al profesional.");
  if (duracionMin < p.minima) {
    return falla("INVALIDO", `El turno dura como mínimo ${p.minima} minutos.`, { campos: { duracionMin: `Mínimo ${p.minima} minutos.` } });
  }
  if (duracionMin % p.paso !== 0) {
    return falla("INVALIDO", `La duración va de a ${p.paso} minutos.`, { campos: { duracionMin: `Usá múltiplos de ${p.paso} minutos.` } });
  }
  if (minutosDe(h) % p.paso !== 0) {
    return falla("INVALIDO", `Los turnos empiezan en punto o y media.`, { campos: { hora: `Elegí una hora que empiece cada ${p.paso} minutos.` } });
  }
  const inicio = aInstante(f, h);
  return ok({ inicio, fin: new Date(inicio.getTime() + duracionMin * 60_000) });
}

/** Revisa solapamiento, bloqueos y horario laboral. Se llama con el candado del profesional tomado. */
async function verificarLugar(
  tx: Tx,
  profesionalId: string,
  inicio: Date,
  fin: Date,
  opciones: { excluirTurnoId?: string; confirmar: boolean },
): Promise<Resultado<null>> {
  const rango = rangoSql(inicio, fin);
  const choque = await tx.execute<{ inicio: Date; fin: Date; paciente: string }>(sql`
    select lower(t.rango) as inicio, upper(t.rango) as fin, p.apellido || ', ' || p.nombre as paciente
    from turnos t join pacientes p on p.id = t.paciente_id
    where t.profesional_id = ${profesionalId} and t.rango && ${rango} and ${OCUPA}
      and (${opciones.excluirTurnoId ?? null}::uuid is null or t.id <> ${opciones.excluirTurnoId ?? null}::uuid)
    order by lower(t.rango) limit 1`);
  if (choque.rows[0]) {
    const c = { ...choque.rows[0], inicio: aFecha(choque.rows[0].inicio), fin: aFecha(choque.rows[0].fin) };
    return falla(
      "SOLAPAMIENTO",
      `Ese horario se superpone con el turno de ${c.paciente}, de ${hhmm(c.inicio)} a ${hhmm(c.fin)}. Elegí otro horario o mové ese turno.`,
      { detalle: { inicio: c.inicio, fin: c.fin, paciente: c.paciente } },
    );
  }
  const bloqueo = await tx.execute<{ motivo: string; desde: Date; hasta: Date }>(
    sql`select motivo, desde, hasta from bloqueos_en(${profesionalId}, ${rango}) order by desde limit 1`,
  );
  if (bloqueo.rows[0]) {
    const b = { ...bloqueo.rows[0], desde: aFecha(bloqueo.rows[0].desde), hasta: aFecha(bloqueo.rows[0].hasta) };
    return falla(
      "EN_BLOQUEO",
      `Ese horario está bloqueado (${b.motivo}, de ${hhmm(b.desde)} a ${hhmm(b.hasta)}). Elegí otro horario o anulá el bloqueo en Configuración.`,
      { detalle: b },
    );
  }
  if (!opciones.confirmar) {
    const fuera = await tx.execute<{ fuera: boolean }>(sql`select fuera_de_horario(${profesionalId}, ${rango}) as fuera`);
    if (fuera.rows[0].fuera) {
      return falla("REQUIERE_CONFIRMACION", "Ese horario queda fuera del horario laboral.", { detalle: { motivo: "fuera_de_horario" } });
    }
  }
  return ok(null);
}

const mensajeSolapamientoGenerico = () =>
  falla("SOLAPAMIENTO", "Ese horario ya está ocupado por otro turno. Elegí otro horario.");

export async function crearTurno(
  db: Db,
  entrada: unknown,
  usuarioId: string,
  confirmar = false,
): Promise<Resultado<{ id: string }>> {
  const parseo = entradaTurno.safeParse(entrada);
  if (!parseo.success) return falla("INVALIDO", "Revisá los datos marcados.", { campos: camposDeZod(parseo.error) });
  const e = parseo.data;
  try {
    return await db.transaction(async (tx) => {
      await tomarCandado(tx, e.profesionalId);
      const paciente = await tx.execute(sql`select 1 from pacientes where id = ${e.pacienteId} and activo`);
      if (paciente.rows.length === 0) return falla("INVALIDO", "Elegí un paciente.", { campos: { pacienteId: "Elegí un paciente." } });
      const r = await rangoValido(tx, e.profesionalId, e.fecha, e.hora, e.duracionMin);
      if (!r.ok) return r;
      const lugar = await verificarLugar(tx, e.profesionalId, r.datos.inicio, r.datos.fin, { confirmar });
      if (!lugar.ok) return lugar;
      const ins = await tx.execute<{ id: string }>(sql`
        insert into turnos (profesional_id, paciente_id, rango, creado_por)
        values (${e.profesionalId}, ${e.pacienteId}, ${rangoSql(r.datos.inicio, r.datos.fin)}, ${usuarioId})
        returning id`);
      const id = ins.rows[0].id;
      await registrar(tx, {
        accion: "crear", entidad: "turno", entidadId: id, usuarioId, pacienteId: e.pacienteId, profesionalId: e.profesionalId,
        datos: { inicio: r.datos.inicio, fin: r.datos.fin, fueraDeHorarioConfirmado: confirmar },
      });
      return ok({ id });
    });
  } catch (error) {
    if (codigoPg(error) === "23P01") return mensajeSolapamientoGenerico(); // la base es la última barrera
    throw error;
  }
}

type FilaTurno = { id: string; profesionalId: string; pacienteId: string; estado: ESTADOS; horarioLiberado: boolean; version: number; inicio: Date; fin: Date };

async function turnoBloqueado(tx: Tx, id: string): Promise<FilaTurno | null> {
  const { rows } = await tx.execute<FilaTurno>(sql`
    select id, profesional_id as "profesionalId", paciente_id as "pacienteId", estado, horario_liberado as "horarioLiberado",
           version, lower(rango) as inicio, upper(rango) as fin
    from turnos where id = ${id} for update`);
  return rows[0] ? { ...rows[0], inicio: aFecha(rows[0].inicio), fin: aFecha(rows[0].fin) } : null;
}

/** Busca el profesional del turno sin bloquear, para tomar el candado en el orden correcto. */
async function profesionalDeTurno(tx: Tx, id: string): Promise<string | null> {
  const { rows } = await tx.execute<{ p: string }>(sql`select profesional_id as p from turnos where id = ${id}`);
  return rows[0]?.p ?? null;
}

const noEncontrado = () => falla("NO_ENCONTRADO", "No encontramos ese turno. Puede que ya no exista.");
const versionVieja = () =>
  falla("CONFLICTO_VERSION", "Este turno cambió mientras lo mirabas. Recargá la página para ver el estado actual.");

export async function reprogramarTurno(
  db: Db,
  entrada: unknown,
  usuarioId: string,
  confirmar = false,
): Promise<Resultado<{ id: string }>> {
  const parseo = entradaReprogramar.safeParse(entrada);
  if (!parseo.success) return falla("INVALIDO", "Revisá los datos marcados.", { campos: camposDeZod(parseo.error) });
  const e = parseo.data;
  try {
    return await db.transaction(async (tx) => {
      const prof = await profesionalDeTurno(tx, e.turnoId);
      if (!prof) return noEncontrado();
      await tomarCandado(tx, prof);
      const t = await turnoBloqueado(tx, e.turnoId);
      if (!t) return noEncontrado();
      if (t.version !== e.version) return versionVieja();
      if (t.estado !== "programado") return falla("INVALIDO", "Solo se puede mover un turno que sigue programado.");
      const r = await rangoValido(tx, t.profesionalId, e.fecha, e.hora, e.duracionMin);
      if (!r.ok) return r;
      const lugar = await verificarLugar(tx, t.profesionalId, r.datos.inicio, r.datos.fin, { excluirTurnoId: t.id, confirmar });
      if (!lugar.ok) return lugar;
      await tx.execute(
        sql`update turnos set rango = ${rangoSql(r.datos.inicio, r.datos.fin)}, version = version + 1 where id = ${t.id}`,
      );
      await registrar(tx, {
        accion: "editar", entidad: "turno", entidadId: t.id, usuarioId, pacienteId: t.pacienteId, profesionalId: t.profesionalId,
        datos: { reprogramado: true, antes: { inicio: t.inicio, fin: t.fin }, despues: { inicio: r.datos.inicio, fin: r.datos.fin } },
      });
      return ok({ id: t.id });
    });
  } catch (error) {
    if (codigoPg(error) === "23P01") return mensajeSolapamientoGenerico();
    throw error;
  }
}

export const entradaEstado = z.object({
  turnoId: z.uuid(),
  estado: z.enum(["atendido", "ausente", "cancelado"], "Elegí un estado."),
  motivo: z.string().trim().max(300, "Usá 300 caracteres o menos.").optional(),
  version: z.coerce.number().int(),
});

/**
 * programado → atendido | ausente | cancelado. Un atendido o ausente se puede corregir entre sí
 * (queda en la auditoría). Un cancelado es definitivo: se agenda un turno nuevo.
 */
export async function cambiarEstado(db: Db, entrada: unknown, usuarioId: string): Promise<Resultado<{ id: string }>> {
  const parseo = entradaEstado.safeParse(entrada);
  if (!parseo.success) return falla("INVALIDO", "Revisá los datos marcados.", { campos: camposDeZod(parseo.error) });
  const e = parseo.data;
  if (e.estado === "cancelado" && !e.motivo) {
    return falla("INVALIDO", "Escribí el motivo de la cancelación.", { campos: { motivo: "Escribí el motivo." } });
  }
  try {
    return await db.transaction(async (tx) => {
      const prof = await profesionalDeTurno(tx, e.turnoId);
      if (!prof) return noEncontrado();
      await tomarCandado(tx, prof);
      const t = await turnoBloqueado(tx, e.turnoId);
      if (!t) return noEncontrado();
      if (t.version !== e.version) return versionVieja();
      const permitido =
        t.estado === "programado" ||
        ((t.estado === "atendido" || t.estado === "ausente") && (e.estado === "atendido" || e.estado === "ausente") && e.estado !== t.estado);
      if (!permitido) {
        return falla("INVALIDO", t.estado === "cancelado" ? "Un turno cancelado no se reactiva. Agendá uno nuevo." : "Ese cambio de estado no es posible.");
      }
      if (e.estado !== "cancelado") {
        // Pasar de ausente con horario liberado a atendido vuelve a ocupar el lugar: hay que revisar que siga libre.
        const lugar = await verificarLugar(tx, t.profesionalId, t.inicio, t.fin, { excluirTurnoId: t.id, confirmar: true });
        if (!lugar.ok && lugar.error.codigo === "SOLAPAMIENTO") return lugar;
      }
      await tx.execute(sql`
        update turnos set estado = ${e.estado}, horario_liberado = false,
          motivo_cancelacion = ${e.estado === "cancelado" ? e.motivo ?? null : null}, version = version + 1
        where id = ${t.id}`);
      await registrar(tx, {
        accion: e.estado === "cancelado" ? "anular" : "editar", entidad: "turno", entidadId: t.id, usuarioId, pacienteId: t.pacienteId,
        profesionalId: t.profesionalId, datos: { estadoAntes: t.estado, estadoDespues: e.estado, motivo: e.motivo ?? null },
      });
      return ok({ id: t.id });
    });
  } catch (error) {
    if (codigoPg(error) === "23P01") return mensajeSolapamientoGenerico();
    throw error;
  }
}

/** Una ausencia puede dejar el horario libre para otro paciente. No se revierte. */
export async function liberarHorario(db: Db, turnoId: string, version: number, usuarioId: string): Promise<Resultado<{ id: string }>> {
  return db.transaction(async (tx) => {
    const prof = await profesionalDeTurno(tx, turnoId);
    if (!prof) return noEncontrado();
    await tomarCandado(tx, prof);
    const t = await turnoBloqueado(tx, turnoId);
    if (!t) return noEncontrado();
    if (t.version !== version) return versionVieja();
    if (t.estado !== "ausente") return falla("INVALIDO", "Solo se puede liberar el horario de un turno marcado como ausente.");
    if (t.horarioLiberado) return falla("INVALIDO", "Ese horario ya estaba liberado.");
    await tx.execute(sql`update turnos set horario_liberado = true, version = version + 1 where id = ${t.id}`);
    await registrar(tx, {
      accion: "editar", entidad: "turno", entidadId: t.id, usuarioId, pacienteId: t.pacienteId, profesionalId: t.profesionalId,
      datos: { horarioLiberado: true },
    });
    return ok({ id: t.id });
  });
}

export type TurnoDeAgenda = {
  id: string;
  profesionalId: string;
  inicio: Date;
  fin: Date;
  estado: ESTADOS;
  horarioLiberado: boolean;
  version: number;
  pacienteId: string;
  paciente: string;
  telefono: string | null;
  motivoCancelacion: string | null;
};

const SELECT_TURNO = sql`
  select t.id, t.profesional_id as "profesionalId", lower(t.rango) as inicio, upper(t.rango) as fin, t.estado, t.horario_liberado as "horarioLiberado", t.version,
         t.paciente_id as "pacienteId", p.apellido || ', ' || p.nombre as paciente, p.telefono,
         t.motivo_cancelacion as "motivoCancelacion"
  from turnos t join pacientes p on p.id = t.paciente_id`;

export async function obtenerTurno(db: Pick<Db, "execute">, id: string): Promise<TurnoDeAgenda | null> {
  const { rows } = await db.execute<TurnoDeAgenda>(sql`${SELECT_TURNO} where t.id = ${id}`);
  return rows[0] ? fechas(rows[0]) : null;
}

const fechas = (t: TurnoDeAgenda): TurnoDeAgenda => ({ ...t, inicio: aFecha(t.inicio), fin: aFecha(t.fin) });

export type BloqueoDeAgenda = { id: string; motivo: string; desde: Date; hasta: Date };

/** Todo lo que pasa en un rango de fechas: turnos (sin cancelados ocultos) y bloqueos. */
export async function agendaEntre(db: Pick<Db, "execute">, profesionalId: string, desde: Date, hasta: Date) {
  const rango = rangoSql(desde, hasta);
  const turnos = await db.execute<TurnoDeAgenda>(
    sql`${SELECT_TURNO} where t.profesional_id = ${profesionalId} and t.rango && ${rango} order by lower(t.rango)`,
  );
  const bloqueos = await db.execute<BloqueoDeAgenda>(sql`select id, motivo, desde, hasta from bloqueos_en(${profesionalId}, ${rango}) order by desde`);
  return {
    turnos: turnos.rows.map(fechas),
    bloqueos: bloqueos.rows.map((b) => ({ ...b, desde: aFecha(b.desde), hasta: aFecha(b.hasta) })),
  };
}
