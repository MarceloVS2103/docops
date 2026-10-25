-- Archivos guardados en la propia base de datos. Lo usa el driver de
-- almacenamiento "db" (deploys sin servicio de archivos aparte, p. ej. Vercel
-- + Neon). Se borran en cascada con la empresa.

create table archivos (
  path text primary key,
  empresa_id uuid not null references empresas(id) on delete cascade,
  mime text not null,
  datos bytea not null,
  creado_en timestamptz not null default now()
);
create index archivos_empresa_idx on archivos(empresa_id);

alter table archivos enable row level security;

create policy tenant_archivos on archivos
  for all to app_tenant
  using (empresa_id = app_empresa_id()) with check (empresa_id = app_empresa_id());

grant select, insert, delete on archivos to app_tenant;
