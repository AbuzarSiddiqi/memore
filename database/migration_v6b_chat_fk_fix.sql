-- ============================================================
-- MEMORE — Migration v6b: relax chat FK constraints
-- ============================================================
-- MEMORE's user universe is the app's own store; Supabase `profiles` only
-- mirrors the users who signed up through Supabase Auth. The chat tables'
-- FK into profiles(id) made conversation creation silently fail (or 500)
-- for any user missing from profiles. Chat authorization is enforced by
-- conversation_participants membership checks (and RLS) — not by FKs.
--
-- Run in the Supabase SQL Editor after migration_v6_e2ee_chat.sql.
-- ============================================================

alter table conversation_participants drop constraint if exists conversation_participants_user_id_fkey;
alter table chat_messages drop constraint if exists chat_messages_sender_id_fkey;
alter table chat_devices drop constraint if exists chat_devices_user_id_fkey;
