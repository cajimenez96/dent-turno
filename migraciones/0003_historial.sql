-- Fase 2: historial de trabajos con versiones inalterables (RF-30 a RF-37).
-- La cabecera es estable; cada edición agrega una versión y la anterior se conserva para siempre.

create table trabajos (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales (id),
  paciente_id uuid not null references pacientes (id),
  turno_id uuid references turnos (id),
  version_actual integer not null default 1 check (version_actual >= 1),
  eliminado boolean not null default false,
  eliminado_motivo text,
  eliminado_por uuid references usuarios (id),
  eliminado_at timestamptz,
  creado_at timestamptz not null default now(),
  constraint trabajos_eliminacion_completa check (
    (not eliminado and eliminado_motivo is null and eliminado_por is null and eliminado_at is null)
    or (eliminado and length(btrim(eliminado_motivo)) > 0 and eliminado_por is not null and eliminado_at is not null)
  )
);
create index trabajos_paciente on trabajos (paciente_id) where not eliminado;
create index trabajos_turno on trabajos (turno_id) where not eliminado;
create index trabajos_profesional on trabajos (profesional_id);

-- Solo inserción. La fecha y el monto viajan en la versión: se pueden corregir sin perder lo anterior.
create table trabajo_versiones (
  trabajo_id uuid not null references trabajos (id),
  numero integer not null check (numero >= 1),
  fecha date not null,
  descripcion text not null check (length(btrim(descripcion)) > 0),
  piezas jsonb not null default '[]'::jsonb check (jsonb_typeof(piezas) = 'array'),
  monto_informado numeric(12, 2) check (monto_informado is null or monto_informado >= 0),
  editado_por uuid references usuarios (id),
  editado_at timestamptz not null default now(),
  resumen_cambio text,
  primary key (trabajo_id, numero)
);

create trigger trabajo_versiones_inalterable
  before update or delete on trabajo_versiones
  for each row execute function rechazar_cambio();
create trigger trabajo_versiones_sin_truncate
  before truncate on trabajo_versiones
  for each statement execute function rechazar_cambio();

-- La cabecera no se borra, no cambia de dueño y la versión vigente solo avanza de a una, hacia una versión que existe.
create function controlar_trabajo() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los trabajos no se borran: se ocultan con un motivo' using errcode = 'insufficient_privilege';
  end if;
  if new.profesional_id <> old.profesional_id or new.paciente_id <> old.paciente_id
     or new.turno_id is distinct from old.turno_id then
    raise exception 'Un trabajo no puede cambiar de paciente, profesional ni turno' using errcode = 'insufficient_privilege';
  end if;
  if old.eliminado and not new.eliminado then
    raise exception 'Un trabajo eliminado no se recupera' using errcode = 'insufficient_privilege';
  end if;
  if new.version_actual <> old.version_actual then
    if new.version_actual <> old.version_actual + 1
       or not exists (select 1 from trabajo_versiones where trabajo_id = new.id and numero = new.version_actual) then
      raise exception 'La versión vigente solo avanza a la siguiente versión existente' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger trabajos_controlados
  before update or delete on trabajos
  for each row execute function controlar_trabajo();
