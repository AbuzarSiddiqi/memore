-- ============================================================
-- MEMORE (AURA) — Migration v2: Production Cloud Sync
-- Run this in Supabase SQL Editor to add missing tables, RLS, and app_state
-- ============================================================

-- 1. App State table for fast serverless cold-start hydration
create table if not exists public.app_state (
  key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
create policy "public read app_state" on public.app_state for select using (true);

-- 2. Chats (24-hour disappearing direct conversations)
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  user1_id uuid not null references public.profiles(id) on delete cascade,
  user2_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'expired')),
  expires_at timestamptz not null,
  muted_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_chats_users on public.chats(user1_id, user2_id);
create index if not exists idx_chats_expires on public.chats(expires_at);

alter table public.chats enable row level security;
create policy "users read own chats" on public.chats for select using (auth.uid() = user1_id or auth.uid() = user2_id);
create policy "users create chats" on public.chats for insert with check (auth.uid() = creator_id);
create policy "users update own chats" on public.chats for update using (auth.uid() = user1_id or auth.uid() = user2_id);

-- 3. Chat Messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null default '',
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  sticker_id text,
  reply_to_message_id uuid references public.chat_messages(id) on delete set null,
  shared_meme_id text references public.memes(id) on delete set null,
  read_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_chat on public.chat_messages(chat_id, created_at);

alter table public.chat_messages enable row level security;
create policy "users read chat messages" on public.chat_messages for select using (
  exists (
    select 1 from public.chats c
    where c.id = chat_messages.chat_id
    and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  )
);
create policy "users insert chat messages" on public.chat_messages for insert with check (auth.uid() = sender_id);

-- 4. Message Reactions
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_id text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, reaction_id)
);

create index if not exists idx_reactions_message on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;
create policy "users read message reactions" on public.message_reactions for select using (true);
create policy "users insert message reactions" on public.message_reactions for insert with check (auth.uid() = user_id);
create policy "users delete own reactions" on public.message_reactions for delete using (auth.uid() = user_id);

-- 5. Daily Missions
create table if not exists public.user_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day text not null,
  discovered_ids text[] not null default '{}',
  invested_ids text[] not null default '{}',
  early_ids text[] not null default '{}',
  remix_ids text[] not null default '{}',
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists idx_user_daily on public.user_daily(user_id, day);

alter table public.user_daily enable row level security;
create policy "users read own daily" on public.user_daily for select using (auth.uid() = user_id);
create policy "users update own daily" on public.user_daily for update using (auth.uid() = user_id);

-- 6. User Achievements
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index if not exists idx_user_achievements on public.user_achievements(user_id);

alter table public.user_achievements enable row level security;
create policy "public read achievements" on public.user_achievements for select using (true);
create policy "users insert own achievements" on public.user_achievements for insert with check (auth.uid() = user_id);
