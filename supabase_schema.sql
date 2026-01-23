-- Elevate schema + RLS policies (Supabase)

create extension if not exists "pgcrypto";

-- Profiles (used for username lookup + settings)
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Skills (owner_id = creator, public templates via is_public_template)
create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  name text not null,
  description text,
  category text,
  is_public_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tracked skills per user
create table if not exists user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id uuid not null references skills (id) on delete cascade,
  active boolean not null default true,
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, skill_id)
);

-- AI analysis snapshots
create table if not exists skill_analysis (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references skills (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  json_result jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  version integer not null default 1
);

-- Quests
create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references skills (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  estimated_minutes integer,
  xp integer not null default 0,
  unlock_level integer not null default 1,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Tutorials
create table if not exists tutorials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id uuid references skills (id) on delete set null,
  quest_id uuid references quests (id) on delete set null,
  title text not null,
  content text,
  url text,
  created_at timestamptz not null default now()
);

-- RLS
alter table profiles enable row level security;
alter table skills enable row level security;
alter table user_skills enable row level security;
alter table skill_analysis enable row level security;
alter table quests enable row level security;
alter table tutorials enable row level security;

-- Profiles policies
create policy "profiles_select_public" on profiles
  for select using (true);
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Skills policies
create policy "skills_select_own_or_public" on skills
  for select using (is_public_template = true or owner_id = auth.uid());
create policy "skills_insert_own" on skills
  for insert with check (owner_id = auth.uid());
create policy "skills_update_own" on skills
  for update using (owner_id = auth.uid());
create policy "skills_delete_own" on skills
  for delete using (owner_id = auth.uid());

-- User skills policies
create policy "user_skills_select_own" on user_skills
  for select using (user_id = auth.uid());
create policy "user_skills_insert_own" on user_skills
  for insert with check (user_id = auth.uid());
create policy "user_skills_update_own" on user_skills
  for update using (user_id = auth.uid());
create policy "user_skills_delete_own" on user_skills
  for delete using (user_id = auth.uid());

-- Skill analysis policies
create policy "skill_analysis_select_own" on skill_analysis
  for select using (user_id = auth.uid());
create policy "skill_analysis_insert_own" on skill_analysis
  for insert with check (user_id = auth.uid());
create policy "skill_analysis_update_own" on skill_analysis
  for update using (user_id = auth.uid());
create policy "skill_analysis_delete_own" on skill_analysis
  for delete using (user_id = auth.uid());

-- Quests policies
create policy "quests_select_own" on quests
  for select using (user_id = auth.uid());
create policy "quests_insert_own" on quests
  for insert with check (user_id = auth.uid());
create policy "quests_update_own" on quests
  for update using (user_id = auth.uid());
create policy "quests_delete_own" on quests
  for delete using (user_id = auth.uid());

-- Tutorials policies
create policy "tutorials_select_own" on tutorials
  for select using (user_id = auth.uid());
create policy "tutorials_insert_own" on tutorials
  for insert with check (user_id = auth.uid());
create policy "tutorials_update_own" on tutorials
  for update using (user_id = auth.uid());
create policy "tutorials_delete_own" on tutorials
  for delete using (user_id = auth.uid());
