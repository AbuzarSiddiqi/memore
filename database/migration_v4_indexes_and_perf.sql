-- ============================================================
-- MEMORE (AURA) — Migration v4: Production Performance Indexes
-- Run this in Supabase SQL Editor to index foreign keys and hot
-- query columns for sub-millisecond lookups.
-- ============================================================

-- Memes indexes
create index if not exists memes_created_at_desc_idx on public.memes (created_at desc);
create index if not exists memes_creator_id_idx on public.memes (creator_id);
create index if not exists memes_category_idx on public.memes (category);
create index if not exists memes_status_idx on public.memes (status);

-- Holdings indexes
create index if not exists holdings_user_id_idx on public.holdings (user_id);
create index if not exists holdings_meme_id_idx on public.holdings (meme_id);

-- Transactions indexes
create index if not exists transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index if not exists transactions_meme_id_idx on public.transactions (meme_id);

-- Comments indexes
create index if not exists comments_meme_created_idx on public.comments (meme_id, created_at asc);
create index if not exists comments_user_id_idx on public.comments (user_id);

-- Follows indexes
create index if not exists follows_follower_id_idx on public.follows (follower_id);
create index if not exists follows_following_id_idx on public.follows (following_id);

-- Saved memes indexes
create index if not exists saved_memes_user_id_idx on public.saved_memes (user_id);

-- Notifications indexes
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- Calls indexes
create index if not exists calls_user_created_idx on public.calls (user_id, created_at desc);
create index if not exists calls_meme_id_idx on public.calls (meme_id);
