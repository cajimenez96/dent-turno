-- Fase 1: horario laboral y bloqueos de agenda.
-- Hora de referencia: America/Argentina/Buenos_Aires. Días de la semana ISO: 1 = lunes ... 7 = domingo.

create table horarios_laborales (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales (id),
  dia_semana smallint not null check (dia_semana between 1 and 7),
  hora_inicio time not null,
  hora_fin time not null,
  constraint horarios_franja_valida check (hora_fin > hora_inicio)
);
create index horarios_laborales_profesional on horarios_laborales (profesional_id, dia_semana);

-- Un bloqueo puntual es un rango de fechas (vacaciones, un congreso); uno semanal es una regla
-- que se repite (almuerzo todos los días, reunión los viernes). No se borran: se anulan.
create table bloqueos (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales (id),
  tipo text not null check (tipo in ('puntual', 'semanal')),
  rango tstzrange,
  dia_semana smallint,
  hora_inicio time,
  hora_fin time,
  vigente_desde date,
  vigente_hasta date,
  motivo text not null check (length(btrim(motivo)) > 0),
  anulado boolean not null default false,
  creado_por uuid references usuarios (id),
  creado_at timestamptz not null default now(),
  constraint bloqueos_forma check (
    (tipo = 'puntual' and rango is not null and not isempty(rango)
       and not lower_inf(rango) and not upper_inf(rango)
       and dia_semana is null and hora_inicio is null and hora_fin is null)
    or
    (tipo = 'semanal' and rango is null and dia_semana between 1 and 7
       and hora_inicio is not null and hora_fin is not null and hora_fin > hora_inicio)
  )
);
create index bloqueos_profesional on bloqueos (profesional_id) where not anulado;
create index bloqueos_rango on bloqueos using gist (rango) where tipo = 'puntual' and not anulado;

-- Bloqueos activos que tocan un rango, con los límites concretos de cada ocurrencia.
create function bloqueos_en(p_profesional uuid, p_rango tstzrange)
returns table (id uuid, motivo text, desde timestamptz, hasta timestamptz)
language sql stable as $$
  select b.id, b.motivo, lower(b.rango), upper(b.rango)
  from bloqueos b
  where b.profesional_id = p_profesional and not b.anulado and b.tipo = 'puntual' and b.rango && p_rango
  union all
  select b.id, b.motivo,
         (d::date + b.hora_inicio) at time zone 'America/Argentina/Buenos_Aires',
         (d::date + b.hora_fin) at time zone 'America/Argentina/Buenos_Aires'
  from bloqueos b
  cross join generate_series(
    (lower(p_rango) at time zone 'America/Argentina/Buenos_Aires')::date::timestamp,
    (upper(p_rango) at time zone 'America/Argentina/Buenos_Aires')::date::timestamp,
    interval '1 day') as d
  where b.profesional_id = p_profesional and not b.anulado and b.tipo = 'semanal'
    and extract(isodow from d)::int = b.dia_semana
    and (b.vigente_desde is null or d::date >= b.vigente_desde)
    and (b.vigente_hasta is null or d::date <= b.vigente_hasta)
    and tstzrange(
          (d::date + b.hora_inicio) at time zone 'America/Argentina/Buenos_Aires',
          (d::date + b.hora_fin) at time zone 'America/Argentina/Buenos_Aires', '[)') && p_rango;
$$;

-- ¿El rango queda fuera del horario laboral? Si el profesional todavía no cargó horario,
-- no se restringe nada. Un turno que cruza un corte (por ejemplo el almuerzo) cuenta como fuera.
create function fuera_de_horario(p_profesional uuid, p_rango tstzrange)
returns boolean
language sql stable as $$
  select exists (select 1 from horarios_laborales h where h.profesional_id = p_profesional)
     and not exists (
       select 1 from horarios_laborales h
       where h.profesional_id = p_profesional
         and h.dia_semana = extract(isodow from (lower(p_rango) at time zone 'America/Argentina/Buenos_Aires'))::int
         and tstzrange(
               ((lower(p_rango) at time zone 'America/Argentina/Buenos_Aires')::date + h.hora_inicio)
                 at time zone 'America/Argentina/Buenos_Aires',
               ((lower(p_rango) at time zone 'America/Argentina/Buenos_Aires')::date + h.hora_fin)
                 at time zone 'America/Argentina/Buenos_Aires', '[)') @> p_rango
     );
$$;

-- Búsqueda de pacientes sin importar tildes ni mayúsculas ("perez" encuentra "Pérez"),
-- sin depender de la configuración regional del servidor.
create function normalizar_texto(t text) returns text
language sql immutable parallel safe as $$
  select translate(lower(t), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')
$$;

drop index pacientes_nombre_trgm;
create index pacientes_nombre_trgm
  on pacientes using gin (normalizar_texto(apellido || ' ' || nombre) gin_trgm_ops);
