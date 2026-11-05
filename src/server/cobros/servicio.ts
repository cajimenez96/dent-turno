import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/cliente";
import { registrar } from "../auditoria";
import { aCentavos, deCentavos, leerMonto } from "../dinero";
import { camposDeZod, codigoPg, falla, ok, type Resultado } from "../resultado";
import { aInstante, esFecha, hoy } from "../tiempo";
import type { Tx } from "../agenda/turnos";

/** Un pedido por paciente a la vez en todo lo que toca plata (la base toma el mismo candado en sus controles). */
const tomarCandadoCuenta = (tx: Tx, pacienteId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"sto-cobros:" + pacienteId}))`);

const monto = z.string().default("").transform((t, ctx) => {
  const m = leerMonto(t);
  if (m === null || m === undefined || aCentavos(m) <= 0) {
    ctx.addIssue({ code: "custom", message: "Escribí un monto mayor que cero, por ejemplo 12.500 o 12.500,50." });
    return z.NEVER;
  }
  return m;
});
const fecha = z.string().refine(esFecha, "Elegí la fecha.").refine((f) => f <= hoy(), "La fecha no puede ser futura.");
const invalido = (campos: Record<string, string>) => falla("INVALIDO", "Revisá los datos marcados.", { campos });

// --------------------------------------------------------------------------------------------------------------
// Cargos
// --------------------------------------------------------------------------------------------------------------

export const entradaCargo = z.object({
  profesionalId: z.uuid(),
  pacienteId: z.uuid(),
  fecha,
  concepto: z.string().trim().min(1, "Escribí el concepto.").max(120, "El concepto admite hasta 120 caracteres."),
  monto,
  origen: z.enum(["trabajo", "ausencia", "otro"]),
  trabajoId: z.uuid().optional(),
});

export async function crearCargo(db: Db, entrada: unknown, usuarioId: string): Promise<Resultado<{ id: string }>> {
  const p = entradaCargo.safeParse(entrada);
  if (!p.success) return invalido(camposDeZod(p.error));
  const e = p.data;
  if ((e.origen === "trabajo") !== (e.trabajoId !== undefined)) {
    return falla("INVALIDO", "Un cargo por trabajo tiene que indicar el trabajo, y los demás no.");
  }
  try {
    return await db.transaction(async (tx) => {
      await tomarCandadoCuenta(tx, e.pacienteId);
      const pac = await tx.execute(sql`select 1 from pacientes where id = ${e.pacienteId} and activo`);
      if (pac.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos al paciente.");
      const prof = await tx.execute(sql`select 1 from profesionales where id = ${e.profesionalId} and activo`);
      if (prof.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos al profesional.");
      if (e.trabajoId) {
        const t = await tx.execute(sql`
          select 1 from trabajos where id = ${e.trabajoId} and not eliminado
            and paciente_id = ${e.pacienteId} and profesional_id = ${e.profesionalId}`);
        if (t.rows.length === 0) return falla("INVALIDO", "Ese trabajo no es de este paciente o ya fue eliminado.");
      }
      const r = await tx.execute<{ id: string }>(sql`
        insert into cargos (profesional_id, paciente_id, fecha, concepto, monto, origen, trabajo_id, creado_por)
        values (${e.profesionalId}, ${e.pacienteId}, ${e.fecha}::date, ${e.concepto}, ${e.monto}::numeric, ${e.origen},
                ${e.trabajoId ?? null}, ${usuarioId}) returning id`);
      const id = r.rows[0].id;
      await registrar(tx, {
        accion: "crear", entidad: "cargo", entidadId: id, usuarioId, pacienteId: e.pacienteId, profesionalId: e.profesionalId,
        datos: { concepto: e.concepto, monto: e.monto, origen: e.origen },
      });
      return ok({ id });
    });
  } catch (error) {
    if (codigoPg(error) === "23505") return falla("INVALIDO", "Ese trabajo ya tiene un cargo. Anulalo primero si hay que rehacerlo.");
    throw error;
  }
}

type FilaCargo = { id: string; pacienteId: string; profesionalId: string; monto: string; anulado: boolean };

async function cargoBloqueado(tx: Tx, id: string): Promise<(FilaCargo & { imputado: string }) | null> {
  const { rows } = await tx.execute<FilaCargo & { imputado: string }>(sql`
    select g.id, g.paciente_id as "pacienteId", g.profesional_id as "profesionalId", g.monto::text, g.anulado,
           coalesce((select sum(monto) from v_imputaciones_vigentes where cargo_id = g.id), 0)::text as imputado
    from cargos g where g.id = ${id}`);
  return rows[0] ?? null;
}

/** Los cargos y cobros de un paciente se identifican primero (sin bloquear) para tomar el candado de su cuenta en orden. */
async function pacienteDeCargo(tx: Tx, id: string) {
  const { rows } = await tx.execute<{ p: string }>(sql`select paciente_id as p from cargos where id = ${id}`);
  return rows[0]?.p ?? null;
}

/** S-05: corrige el monto de un cargo. Si ya se cobró más que el nuevo monto, el saldo queda a favor del paciente. */
export async function editarMontoCargo(db: Db, cargoId: string, montoNuevo: string, usuarioId: string): Promise<Resultado<{ id: string; aFavor: string | null }>> {
  const m = monto.safeParse(montoNuevo);
  if (!m.success) return invalido({ monto: m.error.issues[0].message });
  return db.transaction(async (tx) => {
    const pac = await pacienteDeCargo(tx, cargoId);
    if (!pac) return falla("NO_ENCONTRADO", "No encontramos ese cargo.");
    await tomarCandadoCuenta(tx, pac);
    const g = await cargoBloqueado(tx, cargoId);
    if (!g || g.anulado) return falla("NO_ENCONTRADO", "No encontramos ese cargo o ya está anulado.");
    if (aCentavos(g.monto) === aCentavos(m.data)) return falla("INVALIDO", "El monto es el mismo que ya tiene.", { campos: { monto: "Escribí un monto distinto." } });
    await tx.execute(sql`update cargos set monto = ${m.data}::numeric where id = ${cargoId}`);
    const exceso = aCentavos(g.imputado) - aCentavos(m.data);
    await registrar(tx, {
      accion: "editar", entidad: "cargo", entidadId: cargoId, usuarioId, pacienteId: g.pacienteId, profesionalId: g.profesionalId,
      datos: { antes: { monto: g.monto }, despues: { monto: m.data }, imputado: g.imputado, aFavor: exceso > 0 ? deCentavos(exceso) : null },
    });
    return ok({ id: cargoId, aFavor: exceso > 0 ? deCentavos(exceso) : null });
  });
}

/** Anula un cargo. Si tiene cobros aplicados hay que anular antes esos cobros: la base lo exige. */
export async function anularCargo(db: Db, cargoId: string, motivo: string, usuarioId: string): Promise<Resultado<{ id: string }>> {
  const mot = motivo.trim();
  if (mot === "") return falla("INVALIDO", "Escribí el motivo de la anulación.", { campos: { motivo: "Escribí el motivo." } });
  if (mot.length > 300) return falla("INVALIDO", "El motivo admite hasta 300 caracteres.", { campos: { motivo: "Usá 300 caracteres o menos." } });
  try {
    return await db.transaction(async (tx) => {
      const pac = await pacienteDeCargo(tx, cargoId);
      if (!pac) return falla("NO_ENCONTRADO", "No encontramos ese cargo.");
      await tomarCandadoCuenta(tx, pac);
      const g = await cargoBloqueado(tx, cargoId);
      if (!g || g.anulado) return falla("NO_ENCONTRADO", "No encontramos ese cargo o ya está anulado.");
      if (aCentavos(g.imputado) > 0) {
        return falla("INVALIDO", "Este cargo tiene cobros aplicados. Anulá primero esos cobros y después el cargo.");
      }
      await tx.execute(sql`update cargos set anulado = true, anulado_motivo = ${mot}, anulado_por = ${usuarioId}, anulado_at = now() where id = ${cargoId}`);
      await registrar(tx, { accion: "anular", entidad: "cargo", entidadId: cargoId, usuarioId, pacienteId: g.pacienteId, profesionalId: g.profesionalId, datos: { motivo: mot, monto: g.monto } });
      return ok({ id: cargoId });
    });
  } catch (error) {
    if (codigoPg(error) === "23514") return falla("INVALIDO", "Este cargo tiene cobros aplicados. Anulá primero esos cobros y después el cargo.");
    throw error;
  }
}

// --------------------------------------------------------------------------------------------------------------
// Cobros
// --------------------------------------------------------------------------------------------------------------

type CargoPendiente = { id: string; saldo: string };

async function cargosPendientesTx(tx: Tx, pacienteId: string, profesionalId: string, primero?: string): Promise<CargoPendiente[]> {
  const { rows } = await tx.execute<CargoPendiente>(sql`
    select s.cargo_id as id, s.saldo::text from v_saldo_cargo s join cargos g on g.id = s.cargo_id
    where s.paciente_id = ${pacienteId} and s.profesional_id = ${profesionalId} and s.saldo > 0
    order by (s.cargo_id = ${primero ?? null}::uuid) desc nulls last, s.fecha, g.creado_at`);
  return rows;
}

/** Reparte `disponible` centavos entre los cargos, en orden, sin pasar el saldo de cada uno. */
export function repartir(disponible: number, cargos: { id: string; saldo: string }[]): { cargoId: string; centavos: number }[] {
  const salida: { cargoId: string; centavos: number }[] = [];
  let resto = disponible;
  for (const c of cargos) {
    if (resto <= 0) break;
    const parte = Math.min(resto, aCentavos(c.saldo));
    if (parte > 0) {
      salida.push({ cargoId: c.id, centavos: parte });
      resto -= parte;
    }
  }
  return salida;
}

export const entradaCobro = z.object({
  profesionalId: z.uuid(),
  pacienteId: z.uuid(),
  fecha,
  monto,
  medio: z.enum(["efectivo", "transferencia"], "Elegí cómo pagó."),
  cargoId: z.uuid().optional(),
});

/**
 * Registra un cobro (parcial o total) y lo aplica a los cargos pendientes: primero el elegido, si se eligió, y después los
 * más antiguos. Lo que sobra queda como pago a cuenta (RF-42, RF-43).
 */
export async function registrarCobro(
  db: Db,
  entrada: unknown,
  usuarioId: string,
): Promise<Resultado<{ id: string; imputado: string; aCuenta: string }>> {
  const p = entradaCobro.safeParse(entrada);
  if (!p.success) return invalido(camposDeZod(p.error));
  const e = p.data;
  return db.transaction(async (tx) => {
    await tomarCandadoCuenta(tx, e.pacienteId);
    const pac = await tx.execute(sql`select 1 from pacientes where id = ${e.pacienteId} and activo`);
    if (pac.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos al paciente.");
    const prof = await tx.execute(sql`select 1 from profesionales where id = ${e.profesionalId} and activo`);
    if (prof.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos al profesional.");
    const pendientes = await cargosPendientesTx(tx, e.pacienteId, e.profesionalId, e.cargoId);
    if (e.cargoId && pendientes[0]?.id !== e.cargoId) {
      return falla("INVALIDO", "Ese cargo ya está saldado o no es de este paciente.", { campos: { cargoId: "Elegí un cargo pendiente." } });
    }
    const r = await tx.execute<{ id: string }>(sql`
      insert into cobros (profesional_id, paciente_id, fecha, monto, medio, tipo, creado_por)
      values (${e.profesionalId}, ${e.pacienteId}, ${e.fecha}::date, ${e.monto}::numeric, ${e.medio}, 'cobro', ${usuarioId}) returning id`);
    const id = r.rows[0].id;
    const reparto = repartir(aCentavos(e.monto), pendientes);
    for (const parte of reparto) {
      await tx.execute(sql`insert into imputaciones (cobro_id, cargo_id, monto) values (${id}, ${parte.cargoId}, ${deCentavos(parte.centavos)}::numeric)`);
    }
    const imputado = reparto.reduce((a, x) => a + x.centavos, 0);
    const aCuenta = aCentavos(e.monto) - imputado;
    await registrar(tx, {
      accion: "crear", entidad: "cobro", entidadId: id, usuarioId, pacienteId: e.pacienteId, profesionalId: e.profesionalId,
      datos: { monto: e.monto, medio: e.medio, imputado: deCentavos(imputado), aCuenta: deCentavos(aCuenta), cargos: reparto.length },
    });
    return ok({ id, imputado: deCentavos(imputado), aCuenta: deCentavos(aCuenta) });
  });
}

/** Aplica el dinero cobrado de más (pago a cuenta) a los cargos pendientes, del más antiguo al más nuevo. */
export async function aplicarSaldoACuenta(
  db: Db,
  ids: { pacienteId: string; profesionalId: string },
  usuarioId: string,
): Promise<Resultado<{ aplicado: string }>> {
  return db.transaction(async (tx) => {
    await tomarCandadoCuenta(tx, ids.pacienteId);
    const cobros = await tx.execute<{ id: string; resto: string }>(sql`
      select c.id, (c.monto - coalesce((select sum(monto) from imputaciones where cobro_id = c.id), 0))::text as resto
      from cobros c
      where c.paciente_id = ${ids.pacienteId} and c.profesional_id = ${ids.profesionalId} and c.tipo = 'cobro'
        and not exists (select 1 from cobros a where a.anula_cobro_id = c.id)
        and c.monto > coalesce((select sum(monto) from imputaciones where cobro_id = c.id), 0)
      order by c.fecha, c.creado_at`);
    if (cobros.rows.length === 0) return falla("INVALIDO", "No hay dinero a cuenta para aplicar.");
    let pendientes = await cargosPendientesTx(tx, ids.pacienteId, ids.profesionalId);
    if (pendientes.length === 0) return falla("INVALIDO", "No hay cargos pendientes a los que aplicar el dinero a cuenta.");
    let total = 0;
    for (const c of cobros.rows) {
      const reparto = repartir(aCentavos(c.resto), pendientes);
      for (const parte of reparto) {
        await tx.execute(sql`insert into imputaciones (cobro_id, cargo_id, monto) values (${c.id}, ${parte.cargoId}, ${deCentavos(parte.centavos)}::numeric)`);
        total += parte.centavos;
      }
      pendientes = await cargosPendientesTx(tx, ids.pacienteId, ids.profesionalId);
      if (pendientes.length === 0) break;
    }
    await registrar(tx, {
      accion: "editar", entidad: "cuenta", usuarioId, pacienteId: ids.pacienteId, profesionalId: ids.profesionalId,
      datos: { aplicadoACargos: deCentavos(total) },
    });
    return ok({ aplicado: deCentavos(total) });
  });
}

/** RF-44: un cobro no se borra; se anula con otra fila de monto negativo y un motivo. */
export async function anularCobro(db: Db, cobroId: string, motivo: string, usuarioId: string): Promise<Resultado<{ id: string }>> {
  const mot = motivo.trim();
  if (mot === "") return falla("INVALIDO", "Escribí el motivo de la anulación.", { campos: { motivo: "Escribí el motivo." } });
  if (mot.length > 300) return falla("INVALIDO", "El motivo admite hasta 300 caracteres.", { campos: { motivo: "Usá 300 caracteres o menos." } });
  try {
    return await db.transaction(async (tx) => {
      const previo = await tx.execute<{ pacienteId: string }>(sql`select paciente_id as "pacienteId" from cobros where id = ${cobroId}`);
      if (!previo.rows[0]) return falla("NO_ENCONTRADO", "No encontramos ese cobro.");
      await tomarCandadoCuenta(tx, previo.rows[0].pacienteId);
      const { rows } = await tx.execute<{ id: string; profesionalId: string; pacienteId: string; monto: string; medio: string; tipo: string; anulado: boolean }>(sql`
        select id, profesional_id as "profesionalId", paciente_id as "pacienteId", monto::text, medio, tipo,
               exists (select 1 from cobros a where a.anula_cobro_id = cobros.id) as anulado
        from cobros where id = ${cobroId}`);
      const c = rows[0];
      if (c.tipo !== "cobro") return falla("INVALIDO", "Esto ya es una anulación: no se puede anular de nuevo.");
      if (c.anulado) return falla("INVALIDO", "Este cobro ya fue anulado.");
      const ins = await tx.execute<{ id: string }>(sql`
        insert into cobros (profesional_id, paciente_id, fecha, monto, medio, tipo, anula_cobro_id, motivo, creado_por)
        values (${c.profesionalId}, ${c.pacienteId}, ${hoy()}::date, ${deCentavos(-aCentavos(c.monto))}::numeric, ${c.medio}, 'anulacion', ${c.id}, ${mot}, ${usuarioId})
        returning id`);
      await registrar(tx, {
        accion: "anular", entidad: "cobro", entidadId: cobroId, usuarioId, pacienteId: c.pacienteId, profesionalId: c.profesionalId,
        datos: { motivo: mot, monto: c.monto, anulacionId: ins.rows[0].id },
      });
      return ok({ id: ins.rows[0].id });
    });
  } catch (error) {
    if (codigoPg(error) === "23505") return falla("INVALIDO", "Este cobro ya fue anulado.");
    throw error;
  }
}

// --------------------------------------------------------------------------------------------------------------
// Consultas
// --------------------------------------------------------------------------------------------------------------

export type ResumenCuenta = { profesionalId: string; profesional: string; cargos: string; cobrado: string; imputado: string; saldo: string; aCuenta: string };
export type FilaCargoCuenta = {
  id: string; profesionalId: string; fecha: string; concepto: string; monto: string; origen: "trabajo" | "ausencia" | "otro";
  trabajoId: string | null; anulado: boolean; anuladoMotivo: string | null; imputado: string; saldo: string;
};
export type FilaCobroCuenta = {
  id: string; profesionalId: string; fecha: string; monto: string; medio: string; tipo: "cobro" | "anulacion"; motivo: string | null;
  anulado: boolean; imputado: string; creadoPor: string | null;
};

const lista = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);

/** La cuenta de un paciente con cada profesional que el usuario puede ver. */
export async function cuentaPaciente(db: Pick<Db, "execute">, pacienteId: string, profesionalIds: string[]) {
  if (profesionalIds.length === 0) return { resumenes: [], cargos: [], cobros: [] };
  const resumenes = await db.execute<ResumenCuenta>(sql`
    select pr.id as "profesionalId", pr.nombre as profesional,
           coalesce(s.cargos, 0)::text as cargos, coalesce(s.cobrado, 0)::text as cobrado, coalesce(s.imputado, 0)::text as imputado,
           coalesce(s.saldo, 0)::text as saldo, coalesce(s.a_cuenta, 0)::text as "aCuenta"
    from profesionales pr
    left join v_saldo_paciente s on s.profesional_id = pr.id and s.paciente_id = ${pacienteId}
    where pr.id in (${lista(profesionalIds)})
    order by pr.nombre`);
  const cargos = await db.execute<FilaCargoCuenta>(sql`
    select g.id, g.profesional_id as "profesionalId", to_char(g.fecha, 'YYYY-MM-DD') as fecha, g.concepto, g.monto::text, g.origen,
           g.trabajo_id as "trabajoId", g.anulado, g.anulado_motivo as "anuladoMotivo",
           coalesce((select sum(monto) from v_imputaciones_vigentes where cargo_id = g.id), 0)::text as imputado,
           (g.monto - coalesce((select sum(monto) from v_imputaciones_vigentes where cargo_id = g.id), 0))::text as saldo
    from cargos g where g.paciente_id = ${pacienteId} and g.profesional_id in (${lista(profesionalIds)})
    order by g.fecha desc, g.creado_at desc`);
  const cobros = await db.execute<FilaCobroCuenta>(sql`
    select c.id, c.profesional_id as "profesionalId", to_char(c.fecha, 'YYYY-MM-DD') as fecha, c.monto::text, c.medio, c.tipo, c.motivo,
           exists (select 1 from cobros a where a.anula_cobro_id = c.id) as anulado,
           coalesce((select sum(monto) from imputaciones where cobro_id = c.id), 0)::text as imputado,
           u.nombre as "creadoPor"
    from cobros c left join usuarios u on u.id = c.creado_por
    where c.paciente_id = ${pacienteId} and c.profesional_id in (${lista(profesionalIds)})
    order by c.fecha desc, c.creado_at desc`);
  return { resumenes: resumenes.rows, cargos: cargos.rows, cobros: cobros.rows };
}

export type PacienteConSaldo = { pacienteId: string; paciente: string; telefono: string | null; profesionalId: string; profesional: string; saldo: string; aCuenta: string };

/** RF-45: pacientes que deben (saldo > 0) o tienen saldo a favor (< 0), con lo más adeudado primero. */
export async function pacientesConSaldo(db: Pick<Db, "execute">, profesionalIds: string[]): Promise<PacienteConSaldo[]> {
  if (profesionalIds.length === 0) return [];
  const { rows } = await db.execute<PacienteConSaldo>(sql`
    select s.paciente_id as "pacienteId", p.apellido || ', ' || p.nombre as paciente, p.telefono, s.profesional_id as "profesionalId",
           pr.nombre as profesional, s.saldo::text, s.a_cuenta::text as "aCuenta"
    from v_saldo_paciente s join pacientes p on p.id = s.paciente_id join profesionales pr on pr.id = s.profesional_id
    where s.profesional_id in (${lista(profesionalIds)}) and (s.saldo <> 0 or s.a_cuenta <> 0)
    order by s.saldo desc, p.apellido, p.nombre`);
  return rows;
}

export type ReporteMensual = {
  desde: string;
  hasta: string;
  prestaciones: { total: string; cantidad: number; porOrigen: { origen: string; total: string }[] };
  cobrado: { total: string; porMedio: { medio: string; total: string }[]; anulaciones: string };
  turnos: Record<"programado" | "atendido" | "ausente" | "cancelado", number>;
  pacientesAtendidos: number;
  pendienteHoy: string;
};

export const esMesValido = (anio: number, mes: number) => Number.isInteger(anio) && anio >= 2000 && anio <= 2100 && Number.isInteger(mes) && mes >= 1 && mes <= 12;

/** RF-50/51: resumen de un mes de un profesional. "Prestaciones" es lo cargado, no una factura (T-05). */
export async function reporteMensual(db: Pick<Db, "execute">, profesionalId: string, anio: number, mes: number): Promise<ReporteMensual> {
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const hasta = (() => { const d = new Date(Date.UTC(anio, mes, 1)); return d.toISOString().slice(0, 10); })();
  const [pres, origen, cob, medio, anul, turnos, pacientes, pendiente] = await Promise.all([
    db.execute<{ total: string; n: number }>(sql`select coalesce(sum(monto), 0)::text as total, count(*)::int as n from cargos where profesional_id = ${profesionalId} and not anulado and fecha >= ${desde}::date and fecha < ${hasta}::date`),
    db.execute<{ origen: string; total: string }>(sql`select origen, sum(monto)::text as total from cargos where profesional_id = ${profesionalId} and not anulado and fecha >= ${desde}::date and fecha < ${hasta}::date group by origen order by origen`),
    db.execute<{ total: string }>(sql`select coalesce(sum(monto), 0)::text as total from cobros where profesional_id = ${profesionalId} and fecha >= ${desde}::date and fecha < ${hasta}::date`),
    db.execute<{ medio: string; total: string }>(sql`select medio, sum(monto)::text as total from cobros where profesional_id = ${profesionalId} and fecha >= ${desde}::date and fecha < ${hasta}::date group by medio order by medio`),
    db.execute<{ total: string }>(sql`select coalesce(sum(monto), 0)::text as total from cobros where profesional_id = ${profesionalId} and tipo = 'anulacion' and fecha >= ${desde}::date and fecha < ${hasta}::date`),
    db.execute<{ estado: string; n: number }>(sql`select estado, count(*)::int as n from turnos where profesional_id = ${profesionalId} and lower(rango) >= ${aInstante(desde, "00:00")} and lower(rango) < ${aInstante(hasta, "00:00")} group by estado`),
    db.execute<{ n: number }>(sql`select count(distinct paciente_id)::int as n from turnos where profesional_id = ${profesionalId} and estado = 'atendido' and lower(rango) >= ${aInstante(desde, "00:00")} and lower(rango) < ${aInstante(hasta, "00:00")}`),
    db.execute<{ total: string }>(sql`select coalesce(sum(saldo) filter (where saldo > 0), 0)::text as total from v_saldo_paciente where profesional_id = ${profesionalId}`),
  ]);
  const t = { programado: 0, atendido: 0, ausente: 0, cancelado: 0 };
  for (const f of turnos.rows) if (f.estado in t) t[f.estado as keyof typeof t] = f.n;
  return {
    desde, hasta,
    prestaciones: { total: pres.rows[0].total, cantidad: pres.rows[0].n, porOrigen: origen.rows },
    cobrado: { total: cob.rows[0].total, porMedio: medio.rows, anulaciones: anul.rows[0].total },
    turnos: t,
    pacientesAtendidos: pacientes.rows[0].n,
    pendienteHoy: pendiente.rows[0].total,
  };
}

export const mesActual = () => { const f = hoy(); return { anio: Number(f.slice(0, 4)), mes: Number(f.slice(5, 7)) }; };
