-- Fase 0: identidad, sesiones, auditoría, y el núcleo de la agenda (pacientes y turnos).
-- Las reglas críticas viven acá, en la base, y no solo en el código (documentación sección 4).

create extension if not exists btree_gist;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Identidad y configuración
-- ---------------------------------------------------------------------------
create table profesionales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  matricula text,
  contacto text,
  duracion_minima_min integer not null default 60 check (duracion_minima_min > 0),
  paso_min integer not null default 30 check (paso_min > 0),
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nombre text not null,
  clave_hash text not null,
  activo boolean not null default true,
  profesional_id uuid references profesionales (id),
  creado_at timestamptz not null default now()
);
create unique index usuarios_email_unico on usuarios (lower(email));

create table roles (
  clave text primary key,
  nombre text not null
);

create table rol_permisos (
  rol text not null references roles (clave),
  permiso text not null,
  primary key (rol, permiso)
);

-- alcance: profesional_id nulo significa "todos los profesionales".
create table asignaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id),
  rol text not null references roles (clave),
  profesional_id uuid references profesionales (id)
);
create unique index asignaciones_unica
  on asignaciones (usuario_id, rol, coalesce(profesional_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- En la base se guarda solo el hash SHA-256 del token que viaja en la cookie.
create table sesiones (
  id text primary key,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  creada_at timestamptz not null default now(),
  ultima_actividad timestamptz not null default now(),
  ip text,
  navegador text
);
create index sesiones_usuario on sesiones (usuario_id);

insert into roles (clave, nombre) values
  ('profesional', 'Profesional'),
  ('secretaria', 'Secretaria');

insert into rol_permisos (rol, permiso) values
  ('profesional', 'agenda.ver'), ('profesional', 'agenda.editar'), ('profesional', 'agenda.configurar'),
  ('profesional', 'pacientes.ver'), ('profesional', 'pacientes.editar'),
  ('profesional', 'clinico.ver'), ('profesional', 'clinico.editar'),
  ('profesional', 'cobros.ver'), ('profesional', 'cobros.registrar'), ('profesional', 'cobros.anular'),
  ('profesional', 'reportes.ver'), ('profesional', 'usuarios.administrar'),
  ('secretaria', 'agenda.ver'), ('secretaria', 'agenda.editar'),
  ('secretaria', 'pacientes.ver'), ('secretaria', 'pacientes.editar'),
  ('secretaria', 'cobros.ver'), ('secretaria', 'cobros.registrar');

-- ---------------------------------------------------------------------------
-- Auditoría: solo se agrega, nunca se modifica ni se borra (RNF-07)
-- ---------------------------------------------------------------------------
create table auditoria (
  id bigint generated always as identity primary key,
  momento timestamptz not null default now(),
  usuario_id uuid,
  accion text not null,
  entidad text not null,
  entidad_id text,
  paciente_id uuid,
  profesional_id uuid,
  datos jsonb,
  ip text,
  navegador text
);
create index auditoria_momento on auditoria (momento desc);
create index auditoria_fallidos on auditoria (accion, momento desc) where accion = 'ingreso_fallido';

create function rechazar_cambio() returns trigger language plpgsql as $$
begin
  raise exception 'La tabla % es de solo inserción (%)', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger auditoria_inalterable
  before update or delete on auditoria
  for each row execute function rechazar_cambio();
create trigger auditoria_sin_truncate
  before truncate on auditoria
  for each statement execute function rechazar_cambio();

-- ---------------------------------------------------------------------------
-- Pacientes (administrativo)
-- ---------------------------------------------------------------------------
create table pacientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  tipo_documento text not null default 'DNI',
  numero_documento text,
  telefono text,
  nacimiento date,
  email text,
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);
create unique index pacientes_documento_unico
  on pacientes (tipo_documento, numero_documento) where numero_documento is not null;
create index pacientes_nombre_trgm
  on pacientes using gin ((apellido || ' ' || nombre) gin_trgm_ops);
create index pacientes_documento on pacientes (numero_documento);

-- ---------------------------------------------------------------------------
-- Turnos: la base impide que dos turnos de un profesional se superpongan (RF-22)
-- ---------------------------------------------------------------------------
create table turnos (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales (id),
  paciente_id uuid not null references pacientes (id),
  rango tstzrange not null,
  estado text not null default 'programado'
    check (estado in ('programado', 'atendido', 'ausente', 'cancelado')),
  horario_liberado boolean not null default false,
  motivo_cancelacion text,
  version integer not null default 1,
  creado_por uuid references usuarios (id),
  creado_at timestamptz not null default now(),
  constraint turnos_rango_valido
    check (not isempty(rango) and not lower_inf(rango) and not upper_inf(rango)),
  -- Rangos semiabiertos [inicio, fin): un turno hasta las 11:00 y otro desde las 11:00 no chocan.
  -- Un turno cancelado, o una ausencia con el horario liberado, deja de ocupar lugar (S-01).
  constraint turnos_sin_solapamiento
    exclude using gist (profesional_id with =, rango with &&)
    where (estado in ('programado', 'atendido') or (estado = 'ausente' and not horario_liberado))
);
create index turnos_rango on turnos using gist (rango);
create index turnos_paciente on turnos (paciente_id);
