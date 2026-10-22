-- Esquema inicial: multi-tenant por empresa con Row Level Security.
--
-- La app se conecta como el dueño de las tablas (que salta RLS) y, en cada
-- request autenticado, abre una transacción que hace:
--   select set_config('app.empresa_id', '<uuid>', true);
--   set local role app_tenant;
-- A partir de ahí Postgres solo deja ver/escribir filas de esa empresa.
-- Solo el login, el registro de empresa y el seed usan la conexión dueña.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_tenant') then
    create role app_tenant nologin;
  end if;
end
$$;

-- En Supabase el usuario de conexión no es superusuario: necesita ser miembro
-- del rol para poder hacer SET ROLE.
do $$
begin
  execute format('grant app_tenant to %I', current_user);
exception when others then
  null;
end
$$;

create or replace function app_empresa_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.empresa_id', true), '')::uuid
$$;

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sector text not null check (sector in ('agroexportadora', 'minera')),
  -- Un documento pasa a "por vencer" cuando le quedan <= dias_alerta días.
  dias_alerta integer not null default 30 check (dias_alerta between 1 and 365),
  fecha_alta timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  email text not null unique,
  password_hash text not null,
  rol text not null check (rol in ('admin', 'analista')),
  creado_en timestamptz not null default now()
);
create index usuarios_empresa_idx on usuarios(empresa_id);

create table operarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre_completo text not null,
  dni text not null,
  puesto text,
  fecha_ingreso date,
  campana text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, dni)
);
create index operarios_empresa_idx on operarios(empresa_id);

-- Catálogo por empresa: se copia de la plantilla al crear la empresa y cada
-- empresa puede editar vigencias o agregar tipos propios.
create table tipos_documento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  nombre_corto text not null,
  -- Días de validez desde la emisión, para documentos sin fecha de vencimiento
  -- impresa (p. ej. antecedentes). null = no vence por antigüedad.
  vigencia_dias integer check (vigencia_dias is null or vigencia_dias > 0),
  obligatorio boolean not null default true,
  orden integer not null default 0,
  unique (empresa_id, codigo)
);

create table documentos_operario (
  id uuid primary key default gen_random_uuid(),
  -- Redundante con operarios.empresa_id, pero permite una política RLS simple.
  empresa_id uuid not null references empresas(id) on delete cascade,
  operario_id uuid not null references operarios(id) on delete cascade,
  tipo_documento_id uuid not null references tipos_documento(id) on delete restrict,
  archivo_path text not null,
  archivo_nombre text not null,
  archivo_mime text not null,
  fecha_emision date,
  fecha_vencimiento date,
  -- 'documento' = impresa en el documento, 'calculada' = emisión + vigencia,
  -- 'manual' = ingresada o corregida por RRHH.
  origen_vencimiento text check (origen_vencimiento in ('documento', 'calculada', 'manual')),
  revision_manual boolean not null default false,
  motivo_revision text,
  datos_extraidos_ia jsonb,
  cargado_por uuid references usuarios(id) on delete set null,
  fecha_carga timestamptz not null default now()
);
create index documentos_operario_lookup_idx
  on documentos_operario(empresa_id, operario_id, tipo_documento_id, fecha_carga desc);

-- RLS -------------------------------------------------------------------------

alter table empresas enable row level security;
alter table usuarios enable row level security;
alter table operarios enable row level security;
alter table tipos_documento enable row level security;
alter table documentos_operario enable row level security;

create policy empresa_propia on empresas
  for all to app_tenant
  using (id = app_empresa_id()) with check (id = app_empresa_id());

create policy tenant_usuarios on usuarios
  for all to app_tenant
  using (empresa_id = app_empresa_id()) with check (empresa_id = app_empresa_id());

create policy tenant_operarios on operarios
  for all to app_tenant
  using (empresa_id = app_empresa_id()) with check (empresa_id = app_empresa_id());

create policy tenant_tipos on tipos_documento
  for all to app_tenant
  using (empresa_id = app_empresa_id()) with check (empresa_id = app_empresa_id());

create policy tenant_documentos on documentos_operario
  for all to app_tenant
  using (empresa_id = app_empresa_id()) with check (empresa_id = app_empresa_id());

grant usage on schema public to app_tenant;
grant select, update on empresas to app_tenant;
grant select, insert, update, delete on usuarios, operarios, tipos_documento, documentos_operario to app_tenant;
grant execute on function app_empresa_id() to app_tenant;
