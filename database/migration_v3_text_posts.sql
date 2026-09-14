-- ============================================================
-- MEMORE — Migration v3: TEXT MEME posts (first-class text format)
-- Run this in the Supabase SQL Editor to let the memes table store
-- text memes directly (media_type = 'text').
--
-- OPTIONAL: until this runs, text memes still work end-to-end — they
-- persist through the app's local store + Supabase Storage snapshot.
-- After this migration, new text memes also land in the memes table
-- automatically (no code change needed).
-- ============================================================

-- 1. Allow the text format and make media optional for it
alter table public.memes
  drop constraint if exists memes_media_type_check;
alter table public.memes
  add constraint memes_media_type_check check (media_type in ('image','video','text'));

-- media_url / thumbnail_url are NOT NULL in v1; keep the NOT NULL but let text
-- posts store empty strings (matches the app's zero-value convention). If you
-- prefer schema purity, comment this in instead:
--   alter table public.memes alter column media_url drop not null;
--   alter table public.memes alter column thumbnail_url drop not null;

-- 2. Dedicated text-content column (the caption keeps working, this is an
--    explicit mirror for SQL-level querying of text post bodies)
alter table public.memes
  add column if not exists text_content text not null default '';

-- 3. Partial index so text posts are cheap to find
create index if not exists idx_memes_text_posts
  on public.memes(created_at desc) where media_type = 'text';

-- 4. Backfill text_content for any text memes previously persisted
--    through the Storage snapshot (idempotent no-op until they sync)
update public.memes
   set text_content = caption
 where media_type = 'text' and text_content = '';
