import { sql } from "drizzle-orm";
import { z } from "zod";
import { esquema, type Db } from "../db/cliente";
import { registrar } from "../auditoria";
import { camposDeZod, codigoPg, falla, ok, type Resultado } from "../resultado";
import { hoy } from "../tiempo";

export const TIPOS_DOCUMENTO = ["DNI", "Pasaporte", "Otro"] as const;

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usá ${max} caracteres o menos.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const baseEntrada = z
  .object({
    nombre: z.string().trim().min(1, "Escribí el nombre.").max(100, "Usá 100 caracteres o menos."),
    apellido: z.string().trim().min(1, "Escribí el apellido.").max(100, "Usá 100 caracteres o menos."),
    tipoDocumento: z.enum(TIPOS_DOCUMENTO, "Elegí un tipo de documento.").default("DNI"),
    numeroDocumento: textoOpcional(30),
    telefono: textoOpcional(40),
    nacimiento: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional()
      .transform((v) => v ?? null)
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Usá el formato día/mes/año.")
      .refine((v) => v === null || v <= hoy(), "La fecha de nacimiento no puede ser futura."),
    email: textoOpcional(120).refine((v) => v === null || z.email().safeParse(v).success, "Escribí un email válido."),
  });

export type EntradaPaciente = {
  nombre: string;
  apellido: string;
  tipoDocumento: (typeof TIPOS_DOCUMENTO)[number];
  numeroDocumento: string | null;
  telefono: string | null;
  nacimiento: string | null;
  email: string | null;
};

/** Un DNI se guarda solo con dígitos, así "30.123.456" y "30123456" son el mismo. */
const normalizarDocumento = (tipo: unknown, numero: string | null) =>
  numero && tipo === "DNI" ? numero.replace(/[.\s-]/g, "") : numero;

/** Valida y normaliza. Informa todos los campos con error a la vez, no de a uno. */
export function parsearPaciente(entrada: unknown): { ok: true; datos: EntradaPaciente } | { ok: false; campos: Record<string, string> } {
  const r = baseEntrada.safeParse(entrada);
  const crudo = (entrada ?? {}) as Record<string, unknown>;
  const campos = r.success ? {} : camposDeZod(r.error);
  const tipo = r.success ? r.data.tipoDocumento : crudo.tipoDocumento ?? "DNI";
  const bruto = r.success ? r.data.numeroDocumento : typeof crudo.numeroDocumento === "string" && crudo.numeroDocumento.trim() ? crudo.numeroDocumento.trim() : null;
  const numero = normalizarDocumento(tipo, bruto);
  if (tipo === "DNI" && numero !== null && !/^\d{6,9}$/.test(numero) && !campos.numeroDocumento) {
    campos.numeroDocumento = "El DNI tiene entre 6 y 9 números.";
  }
  if (!r.success || Object.keys(campos).length > 0) return { ok: false, campos };
  return { ok: true, datos: { ...r.data, numeroDocumento: numero } };
}


export type PacienteResumen = {
  id: string;
  nombre: string;
  apellido: string;
  tipoDocumento: string;
  numeroDocumento: string | null;
  telefono: string | null;
  nacimiento: string | null;
};

export type Duplicado = PacienteResumen & { motivo: "documento" | "parecido" };

const columnas = sql`id, nombre, apellido, tipo_documento as "tipoDocumento", numero_documento as "numeroDocumento", telefono, nacimiento::text as nacimiento`;

/** Pacientes que podrían ser la misma persona: mismo documento, o nombre muy parecido. */
export async function posiblesDuplicados(
  db: Pick<Db, "execute">,
  datos: Pick<EntradaPaciente, "nombre" | "apellido" | "tipoDocumento" | "numeroDocumento" | "nacimiento">,
  excluirId?: string,
): Promise<Duplicado[]> {
  const nombreCompleto = `${datos.apellido} ${datos.nombre}`;
  const { rows } = await db.execute<Duplicado>(sql`
    select ${columnas},
           case when numero_documento is not null and tipo_documento = ${datos.tipoDocumento}
                     and numero_documento = ${datos.numeroDocumento} then 'documento' else 'parecido' end as motivo
    from pacientes
    where activo and (${excluirId ?? null}::uuid is null or id <> ${excluirId ?? null}::uuid)
      and (
        (${datos.numeroDocumento}::text is not null and tipo_documento = ${datos.tipoDocumento}
           and numero_documento = ${datos.numeroDocumento})
        or similarity(normalizar_texto(apellido || ' ' || nombre), normalizar_texto(${nombreCompleto})) >= 0.6
        or (${datos.nacimiento}::date is not null and nacimiento = ${datos.nacimiento}::date
            and similarity(normalizar_texto(apellido || ' ' || nombre), normalizar_texto(${nombreCompleto})) >= 0.35)
      )
    order by (case when numero_documento = ${datos.numeroDocumento} then 0 else 1 end),
             similarity(normalizar_texto(apellido || ' ' || nombre), normalizar_texto(${nombreCompleto})) desc
    limit 5`);
  return rows;
}

/** Otro paciente (activo o no) con el mismo documento. El índice único de la base es la garantía final. */
async function conMismoDocumento(db: Pick<Db, "execute">, d: EntradaPaciente, excluirId?: string) {
  if (!d.numeroDocumento) return null;
  const { rows } = await db.execute<PacienteResumen>(sql`
    select ${columnas} from pacientes
    where tipo_documento = ${d.tipoDocumento} and numero_documento = ${d.numeroDocumento}
      and (${excluirId ?? null}::uuid is null or id <> ${excluirId ?? null}::uuid)
    limit 1`);
  return rows[0] ?? null;
}

function errorDocumento(existente: PacienteResumen) {
  return falla(
    "INVALIDO",
    `Ya existe ${existente.apellido}, ${existente.nombre} con ese documento. Abrí ese paciente en vez de crear otro.`,
    { campos: { numeroDocumento: "Este documento ya está cargado." }, detalle: { existente } },
  );
}

export async function crearPaciente(
  db: Db,
  entrada: unknown,
  usuarioId: string,
  confirmar = false,
): Promise<Resultado<{ id: string }>> {
  const parseo = parsearPaciente(entrada);
  if (!parseo.ok) return falla("INVALIDO", "Revisá los datos marcados.", { campos: parseo.campos });
  const d = parseo.datos;

  const mismo = await conMismoDocumento(db, d);
  if (mismo) return errorDocumento(mismo);

  if (!confirmar) {
    const duplicados = await posiblesDuplicados(db, d);
    if (duplicados.length > 0) {
      return falla("REQUIERE_CONFIRMACION", "Puede que este paciente ya esté cargado.", { detalle: { duplicados } });
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const [fila] = await tx
        .insert(esquema.pacientes)
        .values({
          nombre: d.nombre,
          apellido: d.apellido,
          tipoDocumento: d.tipoDocumento,
          numeroDocumento: d.numeroDocumento,
          telefono: d.telefono,
          nacimiento: d.nacimiento,
          email: d.email,
        })
        .returning({ id: esquema.pacientes.id });
      await registrar(tx, { accion: "crear", entidad: "paciente", entidadId: fila.id, usuarioId, pacienteId: fila.id, datos: { confirmoDuplicado: confirmar } });
      return ok({ id: fila.id });
    });
  } catch (error) {
    if (codigoPg(error) === "23505") {
      const otro = await conMismoDocumento(db, d);
      if (otro) return errorDocumento(otro);
    }
    throw error;
  }
}

export async function editarPaciente(db: Db, id: string, entrada: unknown, usuarioId: string): Promise<Resultado<{ id: string }>> {
  const parseo = parsearPaciente(entrada);
  if (!parseo.ok) return falla("INVALIDO", "Revisá los datos marcados.", { campos: parseo.campos });
  const d = parseo.datos;

  const mismo = await conMismoDocumento(db, d, id);
  if (mismo) return errorDocumento(mismo);

  try {
    return await db.transaction(async (tx) => {
      const { rows } = await tx.execute<PacienteResumen & { email: string | null }>(
        sql`select ${columnas}, email from pacientes where id = ${id} for update`,
      );
      const antes = rows[0];
      if (!antes) return falla("NO_ENCONTRADO", "No encontramos ese paciente.");
      await tx.execute(sql`
        update pacientes set nombre = ${d.nombre}, apellido = ${d.apellido}, tipo_documento = ${d.tipoDocumento},
          numero_documento = ${d.numeroDocumento}, telefono = ${d.telefono}, nacimiento = ${d.nacimiento}::date, email = ${d.email}
        where id = ${id}`);
      await registrar(tx, { accion: "editar", entidad: "paciente", entidadId: id, usuarioId, pacienteId: id, datos: { antes, despues: d } });
      return ok({ id });
    });
  } catch (error) {
    if (codigoPg(error) === "23505") {
      const otro = await conMismoDocumento(db, d, id);
      if (otro) return errorDocumento(otro);
    }
    throw error;
  }
}

/** Un paciente con turnos programados a futuro no se desactiva: primero hay que resolver esos turnos. */
export async function desactivarPaciente(db: Db, id: string, usuarioId: string): Promise<Resultado<{ id: string }>> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from turnos where paciente_id = ${id} and estado = 'programado' and lower(rango) >= now()`,
    );
    if (rows[0].n > 0) {
      return falla("INVALIDO", `Tiene ${rows[0].n} turno(s) programado(s) por delante. Cancelalos o movelos antes de desactivar al paciente.`);
    }
    const r = await tx.execute(sql`update pacientes set activo = false where id = ${id} and activo returning id`);
    if (r.rows.length === 0) return falla("NO_ENCONTRADO", "No encontramos ese paciente.");
    await registrar(tx, { accion: "anular", entidad: "paciente", entidadId: id, usuarioId, pacienteId: id });
    return ok({ id });
  });
}

export async function obtenerPaciente(db: Pick<Db, "execute">, id: string) {
  const { rows } = await db.execute<PacienteResumen & { email: string | null; activo: boolean }>(
    sql`select ${columnas}, email, activo from pacientes where id = ${id}`,
  );
  return rows[0] ?? null;
}

const escaparLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Búsqueda por nombre, apellido o documento. Sin texto, devuelve los más recientes. */
export async function buscarPacientes(db: Pick<Db, "execute">, texto: string, limite = 20): Promise<PacienteResumen[]> {
  const t = texto.trim().slice(0, 100);
  if (t === "") {
    const { rows } = await db.execute<PacienteResumen>(
      sql`select ${columnas} from pacientes where activo order by apellido, nombre limit ${limite}`,
    );
    return rows;
  }
  const soloDigitos = t.replace(/[.\s]/g, "");
  const { rows } = await db.execute<PacienteResumen>(sql`
    select ${columnas} from pacientes
    where activo and (
      normalizar_texto(apellido || ' ' || nombre) like normalizar_texto(${"%" + escaparLike(t) + "%"})
      or normalizar_texto(nombre || ' ' || apellido) like normalizar_texto(${"%" + escaparLike(t) + "%"})
      or (${/^\d{3,}$/.test(soloDigitos)} and numero_documento like ${escaparLike(soloDigitos) + "%"})
      or normalizar_texto(apellido || ' ' || nombre) % normalizar_texto(${t})
    )
    order by similarity(normalizar_texto(apellido || ' ' || nombre), normalizar_texto(${t})) desc, apellido, nombre
    limit ${limite}`);
  return rows;
}

