-- 必备扩展（若已存在会忽略）
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto"; -- 用于 gen_random_uuid()

-- ========================
-- 核心表
-- ========================

-- 回合（出题）
create table if not exists public.rounds (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  title text not null,
  body text not null,
  truth boolean,
  credible_sources text[],
  status text not null default 'pending',
  created_by uuid,
  created_at timestamptz not null default now()
);

-- 观众投票（👍/👎）
create table if not exists public.votes (
  id uuid primary key default uuid_generate_v4(),
  round_code text not null references rounds(code) on delete cascade,
  user_id uuid default gen_random_uuid(),
  value text check (value in ('up','down')) not null,
  created_at timestamptz not null default now()
);

-- 观众留言（理由/弹幕）
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  round_code text not null references rounds(code) on delete cascade,
  user_id uuid default gen_random_uuid(),
  content text not null,
  tag text, -- 我们现在不让观众选“real/mislead”，统一记 'unknown' 或留空
  created_at timestamptz not null default now()
);

-- 挑战者判定（可选）
create table if not exists public.decisions (
  id uuid primary key default uuid_generate_v4(),
  round_code text not null references rounds(code) on delete cascade,
  challenger_id uuid default gen_random_uuid(),
  verdict boolean not null,
  reason text,
  ref_link text,
  submitted_at timestamptz not null default now(),
  is_correct boolean
);

-- messages.tag 约束（允许 'real'|'mislead'|'unknown' 或 NULL）
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema='public' and table_name='messages' and constraint_name='messages_tag_check'
  ) then
    alter table public.messages drop constraint messages_tag_check;
  end if;
end$$;

alter table public.messages
  add constraint messages_tag_check check (tag in ('real','mislead','unknown') or tag is null);

-- ========================
-- 视图 & 函数
-- ========================

create or replace view public.messages_view as
select m.*, r.id as round_id, r.code, r.title
from public.messages m
join public.rounds r on r.code = m.round_code;

create or replace function public.get_vote_counts(p_round_code text)
returns json language plpgsql as $$
declare upc int; downc int; begin
  select count(*) into upc from votes where round_code = p_round_code and value = 'up';
  select count(*) into downc from votes where round_code = p_round_code and value = 'down';
  return json_build_object('up', upc, 'down', downc);
end $$;

-- ========================
-- RLS（行级安全策略）
-- ========================
alter table public.rounds    enable row level security;
alter table public.votes     enable row level security;
alter table public.messages  enable row level security;
alter table public.decisions enable row level security;

-- 开放读 + 基本写（演示环境下）
create policy if not exists "read_rounds"     on public.rounds   for select using (true);
create policy if not exists "insert_rounds"   on public.rounds   for insert with check (true);

create policy if not exists "read_votes"      on public.votes    for select using (true);
create policy if not exists "insert_votes"    on public.votes    for insert with check (true);

create policy if not exists "read_messages"   on public.messages for select using (true);
create policy if not exists "insert_messages" on public.messages for insert with check (char_length(content) >= 3);

create policy if not exists "read_decisions"  on public.decisions for select using (true);
create policy if not exists "insert_decisions" on public.decisions for insert with check (true);

-- ========================
-- 索引
-- ========================
create index if not exists idx_rounds_code          on public.rounds(code);
create index if not exists idx_votes_round_code     on public.votes(round_code);
create index if not exists idx_messages_round_code  on public.messages(round_code);
create index if not exists idx_decisions_round_code on public.decisions(round_code);
