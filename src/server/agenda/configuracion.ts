import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/cliente";
import { registrar } from "../auditoria";
import { camposDeZod, falla, ok, type Resultado } from "../resultado";
import { aFecha, aInstante, esFecha, esHora, minutosDe, nombreDia, sumarDias, literalRango } from "../tiempo";
import { tomarCandado, type Tx } from "./turnos";

export type Franja = { dia: number; inicio: string; fin: string };

const hora = z.string().refine(esHora, "Elegí una hora.");

export const entradaHorario = z.object({
  profesionalId: z.uuid(),
  franjas: z
    .array(z.object({ dia: z.coerce.number().int().min(1).max(7), inicio: hora, fin: hora }))
    .max(40, "Hay demasiadas franjas."),
});

export async function horarioLaboral(db: Pick<Db, "execute">, profesionalId: string): Promise<Franja[]> {
  const { rows } = await db.execute<Franja>(sql`
    select dia_semana::int as dia, to_char(hora_inicio, 'HH24:MI') as inicio, to_char(hora_fin, 'HH24:MI') as fin
    from horarios_laborales where profesional_id = ${profesionalId} order by dia_semana, hora_inicio`);
  return rows;
}

/** Reemplaza el horario completo. Los turnos ya dados no se tocan: si quedan fuera, se ven pero no se mueven solos. */
export async function guardarHorarioLaboral(db: Db, entrada: unknown, usuarioId: string): Promise<Resultado<{ franjas: number }>> {
  const parseo = entradaHorario.safeParse(entrada);
  if (!parseo.success) return falla("INVALIDO", "Revisá las horas indicadas.", { campos: camposDeZod(parseo.error) });
  const { profesionalId, franjas } = parseo.data;

  const campos: Record<string, string> = {};
  const porDia = new Map<number, Franja[]>();
  for (const f of franjas) {
    if (minutosDe(f.fin) <= minutosDe(f.inicio)) {
      campos[`${f.dia}`] = `${cap(nombreDia(f.dia))}: la hora de fin tiene que ser después de la de inicio.`;
      continue;
    }
    const lista = porDia.get(f.dia) ?? [];
    if (lista.some((o) => minutosDe(f.inicio) < minutosDe(o.fin) && minutosDe(o.inicio) < minutosDe(f.fin))) {
      campos[`${f.dia}`] = `${cap(nombreDia(f.dia))}: las franjas se superponen.`;
    }
    lista.push(f);
    porDia.set(f.dia, lista);
  }
  if (Object.keys(campos).length > 0) return falla("INVALIDO", Object.values(campos)[0], { campos });

  return db.transaction(async (tx) => {
    await tomarCandado(tx, profesionalId);
    const existe = await tx.execute(sql`select 1 from profesionales where id = ${profesionalId} and activo`);
    if (existe.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos al profesional.");
    const antes = await horarioLaboral(tx, profesionalId);
    await tx.execute(sql`delete from horarios_laborales where profesional_id = ${profesionalId}`);
    for (const f of franjas) {
      await tx.execute(
        sql`insert into horarios_laborales (profesional_id, dia_semana, hora_inicio, hora_fin) values (${profesionalId}, ${f.dia}, ${f.inicio}::time, ${f.fin}::time)`,
      );
    }
    await registrar(tx, { accion: "editar", entidad: "horario_laboral", usuarioId, profesionalId, datos: { antes, despues: franjas } });
    return ok({ franjas: franjas.length });
  });
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const motivo = z.string().trim().min(1, "Escribí el motivo.").max(120, "Usá 120 caracteres o menos.");

export const entradaBloqueo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("puntual"),
    profesionalId: z.uuid(),
    motivo,
    fechaDesde: z.string().refine(esFecha, "Elegí la fecha de inicio."),
    fechaHasta: z.string().refine(esFecha, "Elegí la fecha de fin."),
    horaDesde: z.string().optional().default(""),
    horaHasta: z.string().optional().default(""),
  }),
  z.object({
    tipo: z.literal("semanal"),
    profesionalId: z.uuid(),
    motivo,
    dia: z.coerce.number("Elegí el día.").int().min(1).max(7),
    horaDesde: hora,
    horaHasta: hora,
  }),
]);

export type AfectadoPorBloqueo = { id: string; inicio: Date; fin: Date; paciente: string };

class Aborta extends Error {
  constructor(public resultado: Resultado<never>) {
    super("aborta");
  }
}

/**
 * Crea el bloqueo. Si pisa turnos programados, no los toca: devuelve REQUIERE_CONFIRMACION con la lista y
 * solo guarda si se reenvía con `confirmar` (T-04). La doctora decide después qué hacer con esos turnos.
 */
export async function crearBloqueo(
  db: Db,
  entrada: unknown,
  usuarioId: string,
  confirmar = false,
): Promise<Resultado<{ id: string; afectados: AfectadoPorBloqueo[] }>> {
  const parseo = entradaBloqueo.safeParse(entrada);
  if (!parseo.success) return falla("INVALIDO", "Revisá los datos marcados.", { campos: camposDeZod(parseo.error) });
  const e = parseo.data;

  let rango: string | null = null;
  if (e.tipo === "puntual") {
    const conHoras = e.horaDesde !== "" || e.horaHasta !== "";
    if (conHoras && (!esHora(e.horaDesde) || !esHora(e.horaHasta))) {
      return falla("INVALIDO", "Completá las dos horas, o dejá las dos vacías para bloquear días enteros.", {
        campos: { horaDesde: "Completá las dos horas o ninguna." },
      });
    }
    if (e.fechaHasta < e.fechaDesde) {
      return falla("INVALIDO", "La fecha de fin no puede ser anterior a la de inicio.", { campos: { fechaHasta: "Tiene que ser igual o posterior al inicio." } });
    }
    const inicio = conHoras ? aInstante(e.fechaDesde, e.horaDesde) : aInstante(e.fechaDesde, "00:00");
    const fin = conHoras ? aInstante(e.fechaHasta, e.horaHasta) : aInstante(sumarDias(e.fechaHasta, 1), "00:00");
    if (fin <= inicio) return falla("INVALIDO", "El bloqueo tiene que terminar después de empezar.", { campos: { horaHasta: "Tiene que ser después del inicio." } });
    rango = literalRango(inicio, fin);
  } else if (minutosDe(e.horaHasta) <= minutosDe(e.horaDesde)) {
    return falla("INVALIDO", "La hora de fin tiene que ser después de la de inicio.", { campos: { horaHasta: "Tiene que ser después del inicio." } });
  }

  try {
    return await db.transaction(async (tx) => {
      await tomarCandado(tx, e.profesionalId);
      const prof = await tx.execute(sql`select 1 from profesionales where id = ${e.profesionalId} and activo`);
      if (prof.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos al profesional.");

      const ins =
        e.tipo === "puntual"
          ? await tx.execute<{ id: string }>(sql`
              insert into bloqueos (profesional_id, tipo, rango, motivo, creado_por)
              values (${e.profesionalId}, 'puntual', ${rango}::tstzrange, ${e.motivo}, ${usuarioId}) returning id`)
          : await tx.execute<{ id: string }>(sql`
              insert into bloqueos (profesional_id, tipo, dia_semana, hora_inicio, hora_fin, motivo, creado_por)
              values (${e.profesionalId}, 'semanal', ${e.dia}, ${e.horaDesde}::time, ${e.horaHasta}::time, ${e.motivo}, ${usuarioId})
              returning id`);
      const id = ins.rows[0].id;

      const afectados = (
        await tx.execute<AfectadoPorBloqueo>(sql`
          select t.id, lower(t.rango) as inicio, upper(t.rango) as fin, p.apellido || ', ' || p.nombre as paciente
          from turnos t join pacientes p on p.id = t.paciente_id
          where t.profesional_id = ${e.profesionalId} and t.estado = 'programado' and lower(t.rango) >= now()
            and exists (select 1 from bloqueos_en(t.profesional_id, t.rango) b where b.id = ${id})
          order by lower(t.rango)`)
      ).rows.map((a) => ({ ...a, inicio: aFecha(a.inicio), fin: aFecha(a.fin) }));

      if (afectados.length > 0 && !confirmar) {
        throw new Aborta(
          falla("REQUIERE_CONFIRMACION", `Este bloqueo cae sobre ${afectados.length} turno(s) programado(s). No se cancelan solos.`, {
            detalle: { afectados },
          }),
        );
      }
      await registrar(tx, {
        accion: "crear", entidad: "bloqueo", entidadId: id, usuarioId, profesionalId: e.profesionalId,
        datos: { ...e, turnosAfectados: afectados.map((a) => a.id) },
      });
      return ok({ id, afectados });
    });
  } catch (error) {
    if (error instanceof Aborta) return error.resultado;
    throw error;
  }
}

export async function anularBloqueo(db: Db, id: string, profesionalId: string, usuarioId: string): Promise<Resultado<{ id: string }>> {
  return db.transaction(async (tx: Tx) => {
    const r = await tx.execute<{ profesionalId: string }>(
      sql`update bloqueos set anulado = true where id = ${id} and profesional_id = ${profesionalId} and not anulado returning profesional_id as "profesionalId"`,
    );
    if (r.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos ese bloqueo. Puede que ya esté anulado.");
    await registrar(tx, { accion: "anular", entidad: "bloqueo", entidadId: id, usuarioId, profesionalId: r.rows[0].profesionalId });
    return ok({ id });
  });
}

export type BloqueoVigente = {
  id: string;
  tipo: "puntual" | "semanal";
  motivo: string;
  desde: Date | null;
  hasta: Date | null;
  dia: number | null;
  horaInicio: string | null;
  horaFin: string | null;
};

/** Bloqueos que todavía importan: los semanales y los puntuales que no terminaron. */
export async function bloqueosVigentes(db: Pick<Db, "execute">, profesionalId: string): Promise<BloqueoVigente[]> {
  const { rows } = await db.execute<BloqueoVigente>(sql`
    select id, tipo, motivo, lower(rango) as desde, upper(rango) as hasta, dia_semana::int as dia,
           to_char(hora_inicio, 'HH24:MI') as "horaInicio", to_char(hora_fin, 'HH24:MI') as "horaFin"
    from bloqueos
    where profesional_id = ${profesionalId} and not anulado and (tipo = 'semanal' or upper(rango) > now())
    order by tipo desc, lower(rango), dia_semana, hora_inicio`);
  return rows.map((b) => ({ ...b, desde: b.desde && aFecha(b.desde), hasta: b.hasta && aFecha(b.hasta) }));
}

