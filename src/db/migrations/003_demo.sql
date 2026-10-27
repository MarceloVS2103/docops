-- Demo abierta: cualquiera entra sin cuenta y recibe su propia copia de la
-- empresa plantilla (ver src/lib/demo). Las copias se borran solas.

-- La plantilla no tiene usuarios con clave conocida: nadie puede entrar a ella.
alter table empresas add column plantilla boolean not null default false;
-- No nulo = copia creada por la demo abierta: cuándo y desde qué IP (para el límite de abuso).
alter table empresas add column demo_desde timestamptz;
alter table empresas add column demo_ip text;
create index empresas_demo_idx on empresas(demo_desde) where demo_desde is not null;
