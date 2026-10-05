create extension if not exists pgcrypto with schema extensions;

create table setores (
  id bigint generated always as identity primary key,
  nome text not null unique check (length(trim(nome)) > 0),
  ordem int not null default 0
);

create table procuradores (
  id bigint generated always as identity primary key,
  nome text not null unique check (length(trim(nome)) > 0),
  setor_id bigint not null references setores(id) on delete restrict,
  pin_hash text,
  recesso text check (recesso in ('natal', 'ano_novo')),
  ativo boolean not null default true,
  tentativas_falhas int not null default 0,
  bloqueado_ate timestamptz
);

create table periodos_ferias (
  id bigint generated always as identity primary key,
  procurador_id bigint not null references procuradores(id) on delete cascade,
  inicio date not null,
  fim date not null,
  check (fim >= inicio)
);
create index periodos_ferias_procurador_idx on periodos_ferias (procurador_id);

create table dias_especiais (
  data date primary key,
  tipo text not null check (tipo in ('feriado', 'facultativo')),
  descricao text not null
);

-- Linha única (id = true).
create table config (
  id boolean primary key default true check (id),
  admin_hash text,
  recesso_natal_inicio date not null,
  recesso_natal_fim date not null,
  recesso_ano_novo_inicio date not null,
  recesso_ano_novo_fim date not null,
  check (recesso_natal_fim >= recesso_natal_inicio and recesso_ano_novo_fim >= recesso_ano_novo_inicio)
);

create table sessoes (
  token text primary key,
  procurador_id bigint references procuradores(id) on delete cascade,
  admin boolean not null default false,
  expira_em timestamptz not null,
  check (admin or procurador_id is not null)
);

-- RLS ligado e sem policies: anon/authenticated não acessam nada diretamente.
alter table setores enable row level security;
alter table procuradores enable row level security;
alter table periodos_ferias enable row level security;
alter table dias_especiais enable row level security;
alter table config enable row level security;
alter table sessoes enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
