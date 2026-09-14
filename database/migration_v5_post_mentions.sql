-- ============================================================
-- MEMORE — Migration v5: POST MENTIONS (Real database user tagging)
-- Run this in the Supabase SQL Editor.
-- Stores validated user mentions on memes/posts, with uniqueness
-- ensuring no duplicated relationships per post.
-- ============================================================

-- 1. Create post_mentions table
create table if not exists public.post_mentions (
  id text primary key,
  post_id text not null references public.memes(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint uq_post_mentions_post_user unique (post_id, mentioned_user_id)
);

-- 2. Indexes for fast lookup by post and by mentioned user
create index if not exists idx_post_mentions_post_id
  on public.post_mentions(post_id);

create index if not exists idx_post_mentions_user_id
  on public.post_mentions(mentioned_user_id);

-- 3. Row Level Security
alter table public.post_mentions enable row level security;

create policy "Anyone can read post mentions"
  on public.post_mentions for select
  using (true);

create policy "Authenticated users can insert post mentions"
  on public.post_mentions for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
