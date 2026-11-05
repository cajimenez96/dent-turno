// Espejo tipado de migraciones/*.sql. El SQL de las migraciones manda: si cambiás una
// tabla, escribí una migración nueva y actualizá este archivo.
import { bigint, boolean, customType, date, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

const rangoDeTiempo = customType<{ data: string }>({
  dataType() {
    return "tstzrange";
  },
});

export const profesionales = pgTable("profesionales", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  matricula: text("matricula"),
  contacto: text("contacto"),
  duracionMinimaMin: integer("duracion_minima_min").notNull().default(60),
  pasoMin: integer("paso_min").notNull().default(30),
  activo: boolean("activo").notNull().default(true),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  nombre: text("nombre").notNull(),
  claveHash: text("clave_hash").notNull(),
  activo: boolean("activo").notNull().default(true),
  profesionalId: uuid("profesional_id").references(() => profesionales.id),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  clave: text("clave").primaryKey(),
  nombre: text("nombre").notNull(),
});

export const rolPermisos = pgTable("rol_permisos", {
  rol: text("rol").notNull().references(() => roles.clave),
  permiso: text("permiso").notNull(),
});

export const asignaciones = pgTable("asignaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
  rol: text("rol").notNull().references(() => roles.clave),
  profesionalId: uuid("profesional_id").references(() => profesionales.id),
});

export const sesiones = pgTable("sesiones", {
  id: text("id").primaryKey(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
  creadaAt: timestamp("creada_at", { withTimezone: true }).notNull().defaultNow(),
  ultimaActividad: timestamp("ultima_actividad", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
  navegador: text("navegador"),
});

export const auditoria = pgTable("auditoria", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  momento: timestamp("momento", { withTimezone: true }).notNull().defaultNow(),
  usuarioId: uuid("usuario_id"),
  accion: text("accion").notNull(),
  entidad: text("entidad").notNull(),
  entidadId: text("entidad_id"),
  pacienteId: uuid("paciente_id"),
  profesionalId: uuid("profesional_id"),
  datos: jsonb("datos"),
  ip: text("ip"),
  navegador: text("navegador"),
});

export const pacientes = pgTable("pacientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  tipoDocumento: text("tipo_documento").notNull().default("DNI"),
  numeroDocumento: text("numero_documento"),
  telefono: text("telefono"),
  nacimiento: date("nacimiento"),
  email: text("email"),
  activo: boolean("activo").notNull().default(true),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const turnos = pgTable("turnos", {
  id: uuid("id").primaryKey().defaultRandom(),
  profesionalId: uuid("profesional_id").notNull().references(() => profesionales.id),
  pacienteId: uuid("paciente_id").notNull().references(() => pacientes.id),
  rango: rangoDeTiempo("rango").notNull(),
  estado: text("estado").notNull().default("programado"),
  horarioLiberado: boolean("horario_liberado").notNull().default(false),
  motivoCancelacion: text("motivo_cancelacion"),
  version: integer("version").notNull().default(1),
  creadoPor: uuid("creado_por").references(() => usuarios.id),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const horariosLaborales = pgTable("horarios_laborales", {
  id: uuid("id").primaryKey().defaultRandom(),
  profesionalId: uuid("profesional_id").notNull().references(() => profesionales.id),
  diaSemana: smallint("dia_semana").notNull(),
  horaInicio: time("hora_inicio").notNull(),
  horaFin: time("hora_fin").notNull(),
});

export const bloqueos = pgTable("bloqueos", {
  id: uuid("id").primaryKey().defaultRandom(),
  profesionalId: uuid("profesional_id").notNull().references(() => profesionales.id),
  tipo: text("tipo").notNull(),
  rango: rangoDeTiempo("rango"),
  diaSemana: smallint("dia_semana"),
  horaInicio: time("hora_inicio"),
  horaFin: time("hora_fin"),
  vigenteDesde: date("vigente_desde"),
  vigenteHasta: date("vigente_hasta"),
  motivo: text("motivo").notNull(),
  anulado: boolean("anulado").notNull().default(false),
  creadoPor: uuid("creado_por").references(() => usuarios.id),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trabajos = pgTable("trabajos", {
  id: uuid("id").primaryKey().defaultRandom(),
  profesionalId: uuid("profesional_id").notNull().references(() => profesionales.id),
  pacienteId: uuid("paciente_id").notNull().references(() => pacientes.id),
  turnoId: uuid("turno_id").references(() => turnos.id),
  versionActual: integer("version_actual").notNull().default(1),
  eliminado: boolean("eliminado").notNull().default(false),
  eliminadoMotivo: text("eliminado_motivo"),
  eliminadoPor: uuid("eliminado_por").references(() => usuarios.id),
  eliminadoAt: timestamp("eliminado_at", { withTimezone: true }),
  creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trabajoVersiones = pgTable(
  "trabajo_versiones",
  {
    trabajoId: uuid("trabajo_id").notNull().references(() => trabajos.id),
    numero: integer("numero").notNull(),
    fecha: date("fecha").notNull(),
    descripcion: text("descripcion").notNull(),
    piezas: jsonb("piezas").notNull().default([]),
    montoInformado: numeric("monto_informado", { precision: 12, scale: 2 }),
    editadoPor: uuid("editado_por").references(() => usuarios.id),
    editadoAt: timestamp("editado_at", { withTimezone: true }).notNull().defaultNow(),
    resumenCambio: text("resumen_cambio"),
  },
  (t) => [primaryKey({ columns: [t.trabajoId, t.numero] })],
);
