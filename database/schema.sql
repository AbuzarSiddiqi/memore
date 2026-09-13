-- ============================================================
-- MEMORE (AURA) — Clean Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor to set up all tables, RLS policies,
-- and automatic user profile triggers.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- categories ----------
create table if not exists categories (
  id text primary key
);

insert into categories (id) values
  ('college'),('gaming'),('anime'),('football'),('programming'),
  ('bollywood'),('technology'),('workplace'),('indian'),('chaos')
on conflict (id) do nothing;

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  username text unique not null check (char_length(username) between 3 and 30),
  display_name text not null,
  avatar_bg text not null default '#7C4DFF',
  bio text default '',
  aura_balance numeric not null default 100 check (aura_balance >= 0),
  reputation integer not null default 0,
  level integer not null default 1,
  xp integer not null default 0,
  role text not null default 'user' check (role in ('user','admin')),
  is_seed boolean not null default false,
  interests text[] not null default '{}',
  onboarded boolean not null default false,
  suspended boolean not null default false,
  hunter_score integer not null default 0,
  early_discoveries integer not null default 0,
  successful_picks integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on Supabase Auth signup (Email or Google OAuth)
create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_username text;
  clean_username text;
  user_count int;
begin
  select count(*) into user_count from public.profiles;
  raw_username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  clean_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]', '_', 'g'));
  if char_length(clean_username) < 3 then
    clean_username := clean_username || '_' || substr(new.id::text, 1, 4);
  end if;

  insert into public.profiles (
    id,
    email,
    username,
    display_name,
    avatar_bg,
    aura_balance,
    reputation,
    level,
    xp,
    role,
    is_seed,
    created_at,
    updated_at
  ) values (
    new.id,
    new.email,
    clean_username,
    coalesce(new.raw_user_meta_data->>'display_name', clean_username),
    coalesce(new.raw_user_meta_data->>'avatar_bg', '#7C4DFF'),
    100, -- starter ✦100 Aura
    0,
    1,
    0,
    case when user_count = 0 then 'admin' else 'user' end,
    false,
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if already exists and recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- memes ----------
create table if not exists memes (
  id text primary key default gen_random_uuid()::text,
  creator_id uuid not null references profiles(id) on delete cascade,
  caption text not null,
  description text default '',
  category text not null references categories(id),
  tags text[] not null default '{}',
  media_type text not null check (media_type in ('image','video')),
  media_url text not null,
  thumbnail_url text not null,
  width integer not null default 800,
  height integer not null default 800,
  duration numeric,
  initial_price numeric not null default 20,
  current_price numeric not null default 20,
  net_invested numeric not null default 0,
  total_invested numeric not null default 0,
  total_sell_value numeric not null default 0,
  open_price_24h numeric not null default 20,
  all_time_high numeric not null default 20,
  volume_24h numeric not null default 0,
  momentum real not null default 0.35,
  views bigint not null default 0,
  saves integer not null default 0,
  remix_count integer not null default 0,
  battle_wins integer not null default 0,
  battle_losses integer not null default 0,
  status text not null default 'live' check (status in ('live','removed')),
  parent_meme_id text references memes(id) on delete set null,
  epitaph text,
  source text not null default 'original',
  source_url text,
  source_handle text,
  dna_humor integer not null default 50,
  dna_chaos integer not null default 50,
  dna_relatability integer not null default 50,
  dna_brainrot integer not null default 50,
  dna_wholesome integer not null default 50,
  dna_absurdity integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_memes_creator on memes(creator_id);
create index if not exists idx_memes_category on memes(category);
create index if not exists idx_memes_created on memes(created_at desc);

-- ---------- price_history ----------
create table if not exists price_history (
  id bigint generated always as identity primary key,
  meme_id text not null references memes(id) on delete cascade,
  price numeric not null,
  volume numeric not null default 0,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_price_history_meme on price_history(meme_id, recorded_at desc);

-- ---------- holdings & transactions ----------
create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  meme_id text not null references memes(id) on delete cascade,
  quantity numeric not null check (quantity >= 0),
  invested_amount numeric not null default 0,
  avg_entry_price numeric not null default 0,
  realized_pnl numeric not null default 0,
  last_notif_value numeric not null default 0,
  last_notif_at bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, meme_id)
);
create index if not exists idx_holdings_user on holdings(user_id);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  meme_id text not null references memes(id) on delete cascade,
  type text not null check (type in ('buy','sell')),
  units numeric not null check (units > 0),
  price numeric not null,
  total_value numeric not null check (total_value > 0),
  realized_pnl numeric,
  cost_basis numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_transactions_user on transactions(user_id, created_at desc);

-- ---------- social features ----------
create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  meme_id text not null references memes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_meme on comments(meme_id, created_at);

create table if not exists saved_memes (
  user_id uuid not null references profiles(id) on delete cascade,
  meme_id text not null references memes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, meme_id)
);

create table if not exists remixes (
  id uuid primary key default gen_random_uuid(),
  original_meme_id text not null references memes(id) on delete cascade,
  remix_meme_id text not null references memes(id) on delete cascade,
  creator_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (original_meme_id, remix_meme_id)
);

-- ---------- battles & calls ----------
create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  meme_a_id text not null references memes(id),
  meme_b_id text not null references memes(id),
  status text not null default 'open' check (status in ('open','resolved')),
  winner_id text references memes(id),
  price_a_at_start numeric not null default 20,
  price_b_at_start numeric not null default 20,
  created_at timestamptz not null default now(),
  check (meme_a_id <> meme_b_id)
);

create table if not exists battle_stakes (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references battles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  side text not null check (side in ('a','b')),
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (battle_id, user_id)
);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  meme_id text not null references memes(id) on delete cascade,
  target text not null check (target in ('VIRAL','FLOP')),
  price_at_call numeric not null,
  status text not null default 'open' check (status in ('open','won','lost')),
  resolves_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_calls_user on calls(user_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  meme_id text references memes(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications(user_id, created_at desc);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  target_type text not null check (target_type in ('meme','comment','user')),
  target_id text not null,
  category text not null,
  note text default '',
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table profiles enable row level security;
alter table memes enable row level security;
alter table price_history enable row level security;
alter table holdings enable row level security;
alter table transactions enable row level security;
alter table follows enable row level security;
alter table comments enable row level security;
alter table saved_memes enable row level security;
alter table remixes enable row level security;
alter table battles enable row level security;
alter table battle_stakes enable row level security;
alter table calls enable row level security;
alter table notifications enable row level security;
alter table reports enable row level security;

-- Profiles: Public can read basic profile info; users can update their own
create policy "public read profiles" on profiles for select using (true);
create policy "users update own profile" on profiles for update using (auth.uid() = id);

-- Memes: Anyone can read live memes; authenticated creators can insert
create policy "public read live memes" on memes for select using (status = 'live');
create policy "authenticated insert meme" on memes for insert with check (auth.uid() = creator_id);
create policy "creators update own meme" on memes for update using (auth.uid() = creator_id);

-- Holdings and Transactions: users see their own
create policy "users read own holdings" on holdings for select using (auth.uid() = user_id);
create policy "users read own transactions" on transactions for select using (auth.uid() = user_id);

-- Comments & Social
create policy "public read comments" on comments for select using (true);
create policy "authenticated insert comment" on comments for insert with check (auth.uid() = user_id);
create policy "users read own follows" on follows for select using (true);
create policy "users insert own follows" on follows for insert with check (auth.uid() = follower_id);
create policy "users delete own follows" on follows for delete using (auth.uid() = follower_id);

-- Saved memes
create policy "users read own saved" on saved_memes for select using (auth.uid() = user_id);
create policy "users insert own saved" on saved_memes for insert with check (auth.uid() = user_id);
create policy "users delete own saved" on saved_memes for delete using (auth.uid() = user_id);

-- Notifications
create policy "users read own notifications" on notifications for select using (auth.uid() = user_id);
create policy "users update own notifications" on notifications for update using (auth.uid() = user_id);
