-- Fase 3: cargos, cobros, imputaciones y saldos (RF-40 a RF-45).
-- Un cargo es lo que el paciente debe; un cobro es lo que pagó. Se vinculan con imputaciones.
-- Los cobros y las imputaciones son de solo inserción: anular un cobro agrega otra fila con monto negativo.

create table cargos (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales (id),
  paciente_id uuid not null references pacientes (id),
  fecha date not null,
  concepto text not null check (length(btrim(concepto)) > 0),
  monto numeric(12, 2) not null check (monto > 0),
  origen text not null check (origen in ('trabajo', 'ausencia', 'otro')),
  trabajo_id uuid references trabajos (id),
  anulado boolean not null default false,
  anulado_motivo text,
  anulado_por uuid references usuarios (id),
  anulado_at timestamptz,
  creado_por uuid references usuarios (id),
  creado_at timestamptz not null default now(),
  constraint cargos_origen_trabajo check ((origen = 'trabajo') = (trabajo_id is not null)),
  constraint cargos_anulacion_completa check (
    (not anulado and anulado_motivo is null and anulado_por is null and anulado_at is null)
    or (anulado and length(btrim(anulado_motivo)) > 0 and anulado_por is not null and anulado_at is not null)
  )
);
create unique index cargos_un_cargo_por_trabajo on cargos (trabajo_id) where trabajo_id is not null and not anulado;
create index cargos_paciente on cargos (paciente_id, profesional_id) where not anulado;
create index cargos_fecha on cargos (profesional_id, fecha) where not anulado;

create table cobros (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references profesionales (id),
  paciente_id uuid not null references pacientes (id),
  fecha date not null,
  monto numeric(12, 2) not null,
  medio text not null check (medio in ('efectivo', 'transferencia')),
  tipo text not null check (tipo in ('cobro', 'anulacion')),
  anula_cobro_id uuid unique references cobros (id),
  motivo text,
  creado_por uuid references usuarios (id),
  creado_at timestamptz not null default now(),
  constraint cobros_forma check (
    (tipo = 'cobro' and monto > 0 and anula_cobro_id is null and motivo is null)
    or (tipo = 'anulacion' and monto < 0 and anula_cobro_id is not null and length(btrim(motivo)) > 0)
  )
);
create index cobros_paciente on cobros (paciente_id, profesional_id);
create index cobros_fecha on cobros (profesional_id, fecha);

create table imputaciones (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references cobros (id),
  cargo_id uuid not null references cargos (id),
  monto numeric(12, 2) not null check (monto > 0),
  creado_at timestamptz not null default now()
);
create index imputaciones_cobro on imputaciones (cobro_id);
create index imputaciones_cargo on imputaciones (cargo_id);

create trigger cobros_inalterables
  before update or delete on cobros
  for each row execute function rechazar_cambio();
create trigger cobros_sin_truncate
  before truncate on cobros
  for each statement execute function rechazar_cambio();
create trigger imputaciones_inalterables
  before update or delete on imputaciones
  for each row execute function rechazar_cambio();
create trigger imputaciones_sin_truncate
  before truncate on imputaciones
  for each statement execute function rechazar_cambio();

-- Una anulación revierte exactamente un cobro (no una anulación) del mismo paciente y profesional.
create function controlar_anulacion() returns trigger language plpgsql as $$
declare orig cobros%rowtype;
begin
  if new.tipo <> 'anulacion' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('sto-cobros:' || new.paciente_id::text));
  select * into orig from cobros where id = new.anula_cobro_id;
  if not found or orig.tipo <> 'cobro' then
    raise exception 'Solo se puede anular un cobro' using errcode = 'check_violation';
  end if;
  if orig.paciente_id <> new.paciente_id or orig.profesional_id <> new.profesional_id or new.monto <> -orig.monto then
    raise exception 'La anulación debe revertir exactamente el cobro original' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger cobros_controlar_anulacion before insert on cobros
  for each row execute function controlar_anulacion();

-- Una imputación no puede pagar más de lo que tiene el cobro ni más de lo que le falta al cargo, y todo
-- debe ser del mismo paciente y profesional. El candado por paciente evita que dos pedidos simultáneos pasen juntos.
create function controlar_imputacion() returns trigger language plpgsql as $$
declare c cobros%rowtype; g cargos%rowtype; ya_cobro numeric; ya_cargo numeric;
begin
  select * into c from cobros where id = new.cobro_id;
  select * into g from cargos where id = new.cargo_id;
  perform pg_advisory_xact_lock(hashtext('sto-cobros:' || c.paciente_id::text));
  if c.tipo <> 'cobro' or exists (select 1 from cobros a where a.anula_cobro_id = c.id) then
    raise exception 'No se puede imputar un cobro anulado' using errcode = 'check_violation';
  end if;
  if g.anulado then
    raise exception 'No se puede imputar a un cargo anulado' using errcode = 'check_violation';
  end if;
  if c.paciente_id <> g.paciente_id or c.profesional_id <> g.profesional_id then
    raise exception 'El cobro y el cargo deben ser del mismo paciente y profesional' using errcode = 'check_violation';
  end if;
  select coalesce(sum(monto), 0) into ya_cobro from imputaciones where cobro_id = c.id;
  if ya_cobro + new.monto > c.monto then
    raise exception 'Se imputa más de lo que tiene el cobro' using errcode = 'check_violation';
  end if;
  select coalesce(sum(i.monto), 0) into ya_cargo from imputaciones i
    where i.cargo_id = g.id and not exists (select 1 from cobros a where a.anula_cobro_id = i.cobro_id);
  if ya_cargo + new.monto > g.monto then
    raise exception 'Se imputa más de lo que le falta al cargo' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger imputaciones_controlar before insert on imputaciones
  for each row execute function controlar_imputacion();

-- El cargo conserva su identidad; solo cambia el monto (con auditoría) o se anula, y anular es definitivo y
-- exige que no tenga cobros aplicados.
create function controlar_cargo() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los cargos no se borran: se anulan' using errcode = 'insufficient_privilege';
  end if;
  if new.profesional_id <> old.profesional_id or new.paciente_id <> old.paciente_id
     or new.origen <> old.origen or new.trabajo_id is distinct from old.trabajo_id or new.fecha <> old.fecha then
    raise exception 'Un cargo no puede cambiar de paciente, profesional, origen ni fecha' using errcode = 'insufficient_privilege';
  end if;
  if old.anulado and (not new.anulado or new.monto <> old.monto) then
    raise exception 'Un cargo anulado no se modifica' using errcode = 'insufficient_privilege';
  end if;
  if new.anulado and not old.anulado then
    perform pg_advisory_xact_lock(hashtext('sto-cobros:' || new.paciente_id::text));
    if exists (select 1 from imputaciones i where i.cargo_id = new.id
               and not exists (select 1 from cobros a where a.anula_cobro_id = i.cobro_id)) then
      raise exception 'El cargo tiene cobros aplicados: anulá primero esos cobros' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger cargos_controlados before update or delete on cargos
  for each row execute function controlar_cargo();

-- Imputaciones que todavía cuentan: las de cobros que no fueron anulados.
create view v_imputaciones_vigentes as
  select i.* from imputaciones i
  where not exists (select 1 from cobros a where a.anula_cobro_id = i.cobro_id);

-- Lo que falta cobrar de cada cargo (RF-43). Negativo = se cobró de más tras bajar el monto (saldo a favor).
create view v_saldo_cargo as
  select g.id as cargo_id, g.paciente_id, g.profesional_id, g.fecha, g.monto,
         coalesce(sum(i.monto), 0)::numeric(12, 2) as imputado,
         (g.monto - coalesce(sum(i.monto), 0))::numeric(12, 2) as saldo
  from cargos g
  left join v_imputaciones_vigentes i on i.cargo_id = g.id
  where not g.anulado
  group by g.id;

-- Cuenta de cada paciente con cada profesional (RF-43, RF-45). saldo > 0: debe; saldo < 0: tiene saldo a favor.
-- a_cuenta: plata cobrada que todavía no se aplicó a ningún cargo.
create view v_saldo_paciente as
  with cargado as (
    select paciente_id, profesional_id, sum(monto) as cargos from cargos where not anulado group by 1, 2
  ), cobrado as (
    select paciente_id, profesional_id, sum(monto) as cobrado from cobros group by 1, 2
  ), imputado as (
    select c.paciente_id, c.profesional_id, sum(i.monto) as imputado
    from v_imputaciones_vigentes i join cobros c on c.id = i.cobro_id group by 1, 2
  )
  select p.paciente_id, p.profesional_id,
         coalesce(cargado.cargos, 0)::numeric(12, 2) as cargos,
         coalesce(cobrado.cobrado, 0)::numeric(12, 2) as cobrado,
         coalesce(imputado.imputado, 0)::numeric(12, 2) as imputado,
         (coalesce(cargado.cargos, 0) - coalesce(cobrado.cobrado, 0))::numeric(12, 2) as saldo,
         (coalesce(cobrado.cobrado, 0) - coalesce(imputado.imputado, 0))::numeric(12, 2) as a_cuenta
  from (select paciente_id, profesional_id from cargos union select paciente_id, profesional_id from cobros) p
  left join cargado using (paciente_id, profesional_id)
  left join cobrado using (paciente_id, profesional_id)
  left join imputado using (paciente_id, profesional_id);
