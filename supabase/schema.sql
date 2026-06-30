-- Gravador — schema v1.0.0 (modelo de WORKSPACES) — DEC-005/008/009/011/013/014/015
-- Aplicado no Supabase via migração `redesign_workspaces` (2026-06-26).
-- Convenção: DB/código em inglês; UI em pt-br. RLS ligada SEM policy: acesso só pelo
-- servidor com service_role (que ignora RLS) — reforço defensivo (DEC-011).

create extension if not exists "pgcrypto";

-- Perfis. Identidade vem do Login Google; chave por email. SEM role (agora é por workspace).
create table profiles (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  nome              text,
  sobrenome         text,
  account_level     text not null check (account_level in ('member','guest')),
  first_access      boolean not null default false,   -- member nasce true; guest sempre false
  last_workspace_id uuid,            -- workspace ativo/último (FK adicionada após workspaces)
  avatar_drive_id   text,            -- foto do Google guardada no Drive (Avatares); null = fallback inicial
  created_at        timestamptz not null default now()
);

-- Workspaces. member cria (até 10, validado no app) e é owner.
create table workspaces (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_id        uuid not null references profiles(id),
  drive_folder_id text,             -- pasta do workspace no Drive (DEC-009), criada pelo app
  created_at      timestamptz not null default now()
);

alter table profiles
  add constraint profiles_last_workspace_fk
  foreign key (last_workspace_id) references workspaces(id) on delete set null;

-- Áreas (setor) por workspace; default "Todas" (is_default).
create table areas (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

-- Tags (categorias) por workspace; origem: 'system' (seed), 'user' (manual) ou 'ai' (sugerida pelo back-p).
create table tags (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  name             text not null,                       -- normalizado: minúsculas (ver lib/taxonomy)
  source           text not null default 'user' check (source in ('system','user','ai')),
  created_by       uuid references profiles(id),        -- quando source='user'
  created_by_model text,                                -- quando source='ai'
  created_at       timestamptz not null default now(),
  unique (workspace_id, name)
);

-- Adesão de membros ao workspace (papel + área + status do convite).
create table workspace_members (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  profile_id     uuid not null references profiles(id) on delete cascade,
  workspace_role text not null check (workspace_role in ('owner','admin','collaborator')),
  area_id        uuid references areas(id) on delete set null,
  status         text not null default 'invited' check (status in ('invited','active')),
  created_at     timestamptz not null default now(),
  unique (workspace_id, profile_id)
);

-- Gravações: pertencem a um workspace; v1 só modo livre (sem timeline/entrevista, DEC-006).
-- Transcrição/análise (do back de processamento) entram em sessão futura — não modeladas aqui.
create table recordings (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  author_id       uuid not null references profiles(id),
  titulo          text,                 -- rótulo do autor (≠ assunto da IA)
  observacoes     text,
  duracao_seg     integer,
  size_bytes      bigint,               -- tamanho do áudio em bytes (blob.size no finalize); nulo p/ gravações antigas — back-p roteia transcrição por tamanho
  mode            text not null default 'free' check (mode in ('free')),
  area_id         uuid references areas(id) on delete set null,
  resumo          text,                 -- frase que resume (gerada pelo back-p); nulo até processar
                                        -- (titulo = rótulo do autor, acima; refino do titulo é do back-p)
  visibilidade    text not null default 'public' check (visibilidade in ('public','private')),
  status          text not null default 'awaiting_processing'
                    check (status in ('awaiting_processing','processing','done','error')),
  drive_file_id   text,
  drive_folder_id text,
  deleted         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Tags por gravação (N:N).
create table recording_tags (
  recording_id uuid not null references recordings(id) on delete cascade,
  tag_id       uuid not null references tags(id) on delete cascade,
  primary key (recording_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Saída do BACK DE PROCESSAMENTO (outra unidade/sessão). Modeladas aqui como a
-- "tomada" para o back-p plugar; o front (v1) só LÊ (exibe) — ver migração fatia_d.
-- titulo/resumo efetivos ficam em recordings; tags efetivas em recording_tags.
-- ---------------------------------------------------------------------------
create table transcriptions (
  id           uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references recordings(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author_id    uuid references profiles(id),
  api          text,
  model        text,
  srt          text,
  texto        text,
  idioma       text,
  created_at   timestamptz not null default now()
);

create table reports (
  id           uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references recordings(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author_id    uuid references profiles(id),
  api          text,
  model        text,
  relatorio_md text,            -- relatório formatado (exibição)
  raw_response jsonb,           -- resposta estruturada ORIGINAL da IA (auditoria/reprocesso)
  created_at   timestamptz not null default now()
);

-- Operacional do back-p (custos/uso). Custo é CONGELADO no momento da chamada (snapshot de preço).
create table model_prices (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null,
  model          text not null,
  price_in       numeric,
  price_out      numeric,
  currency       text not null default 'USD',
  effective_from timestamptz not null default now()
);

create table processing_jobs (
  id           uuid primary key default gen_random_uuid(),
  recording_id uuid references recordings(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  task         text not null check (task in ('transcription','report')),
  provider     text,
  model        text,
  status       text not null default 'pending' check (status in ('pending','running','done','error')),
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table ai_usage (
  id                     uuid primary key default gen_random_uuid(),
  job_id                 uuid references processing_jobs(id) on delete cascade,
  recording_id           uuid references recordings(id) on delete set null,
  workspace_id           uuid references workspaces(id) on delete set null,
  task                   text,
  provider               text,
  model                  text,
  input_tokens_estimated integer,
  input_tokens_real      integer,
  output_tokens          integer,
  price_in               numeric,   -- snapshot do preço usado
  price_out              numeric,
  cost_total             numeric,   -- calculado AGORA; nunca recalculado
  currency               text default 'USD',
  created_at             timestamptz not null default now()
);

create index recordings_workspace_idx       on recordings(workspace_id);
create index recordings_author_idx          on recordings(author_id);
create index recordings_status_idx          on recordings(status);
create index workspace_members_profile_idx  on workspace_members(profile_id);
create index areas_workspace_idx            on areas(workspace_id);
create index tags_workspace_idx             on tags(workspace_id);

alter table profiles          enable row level security;
alter table workspaces        enable row level security;
alter table areas             enable row level security;
alter table tags              enable row level security;
alter table workspace_members enable row level security;
alter table recordings        enable row level security;
alter table recording_tags    enable row level security;
alter table transcriptions    enable row level security;
alter table reports           enable row level security;
alter table model_prices      enable row level security;
alter table processing_jobs   enable row level security;
alter table ai_usage          enable row level security;

-- ---------------------------------------------------------------------------
-- Seed inicial (DEC-008/014): o adm vira member + owner de um workspace inicial,
-- com área "Todas" e as tags do sistema.
-- `lab.learion@gmail.com` é a conta DEV (admin/owner legítimo, não descartável). Outras contas
-- member/admin/owner entram via os scripts (scripts/pre-cadastro.mjs + scripts/convite.mjs).
-- NOTA: o UPDATE de last_workspace_id é um statement SEPARADO de propósito —
-- num único statement os CTEs não enxergam a linha recém-inserida (snapshot).
-- ---------------------------------------------------------------------------
with p as (
  insert into profiles (email, nome, account_level, first_access)
  values ('lab.learion@gmail.com', 'Learion', 'member', false)
  returning id
),
w as (
  insert into workspaces (name, owner_id)
  select 'Workspace inicial', id from p
  returning id, owner_id
),
a as (
  insert into areas (workspace_id, name, is_default)
  select id, 'Todas', true from w
  returning id
),
seed_tags as (
  insert into tags (workspace_id, name, source)
  select w.id, x.name, 'system'
  from w cross join (values ('problema'),('ideia'),('sugestão'),('dúvida'),('decisão'),('pendência')) as x(name)
  returning id
)
insert into workspace_members (workspace_id, profile_id, workspace_role, area_id, status)
select w.id, w.owner_id, 'owner', a.id, 'active' from w cross join a;

update profiles p set last_workspace_id = w.id
from workspaces w
where w.owner_id = p.id and p.last_workspace_id is null;
