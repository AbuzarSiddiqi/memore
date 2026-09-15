-- ============================================================
-- MEMORE — Migration v6: E2EE chat on Supabase Postgres
-- ============================================================
-- Chat moves from the plaintext JSON snapshot (chats_v2.json in Storage)
-- to Postgres. From this migration on, the server only ever stores:
--   • CIPHERTEXT message bodies (Signal protocol envelopes, base64)
--   • metadata required to run the app (type, timestamps, reads, reactions)
--   • PUBLIC key material (identity keys, signed prekeys) for X3DH
-- Private keys never reach the database.
--
-- NOTE: legacy plaintext message CONTENT is intentionally NOT migrated.
-- Existing conversations/contacts/reads/mutes are imported by
-- scripts/migrate-chats-to-postgres.mjs; their messages (all ≤24h old)
-- simply expire and are gone. No plaintext path remains after cutover.
--
-- Run this whole file in the Supabase SQL Editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- last seen (persistent, updated sparingly — see presence) ----------
alter table profiles add column if not exists last_seen_at timestamptz;

-- ---------- conversations (persistent contact threads) ----------
create table if not exists conversations (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  temp_chat boolean not null default false
);

create table if not exists conversation_participants (
  conversation_id text not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default '1970-01-01T00:00:00Z',
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_conv_parts_user on conversation_participants(user_id);

-- ---------- messages (ciphertext only — the server never sees plaintext) ----------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('text','image','video','sticker','post')),
  ciphertext text not null default '',            -- Signal-protocol envelope (base64); '' for sticker-only messages
  encryption_version text not null default 'signal-x3dh-dr-v1',
  to_device text,                                 -- recipient device the envelope is addressed to (metadata only)
  post_id text,                                   -- PUBLIC shared-post reference (not user content)
  media_url text,                                 -- points to an ENCRYPTED blob in storage
  sticker_id text,                                -- catalog reference (not user content)
  reply_to_message_id uuid references chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),  -- server clock, always
  expires_at timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  constraint chat_messages_ttl check (expires_at <= created_at + interval '24 hours' + interval '1 minute')
);
create index if not exists idx_chat_messages_conv on chat_messages(conversation_id, created_at desc);
create index if not exists idx_chat_messages_expiry on chat_messages(expires_at) where deleted_at is null;

-- ---------- reactions (metadata only — reaction ids are catalog keys) ----------
create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reaction_id text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);
create index if not exists idx_message_reactions_msg on message_reactions(message_id);

-- ---------- E2EE PUBLIC key material ----------
-- One row per device. Private keys live ONLY in the device's IndexedDB.
create table if not exists chat_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  device_id text not null,
  registration_id integer not null check (registration_id between 0 and 16383),
  identity_key text not null,                     -- PUBLIC identity key (base64)
  signed_prekey_id integer not null,
  signed_prekey_public text not null,             -- PUBLIC signed prekey (base64)
  signed_prekey_signature text not null,          -- signature over the signed prekey (base64)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);
create index if not exists idx_chat_devices_user on chat_devices(user_id, created_at desc);

-- ============================================================
-- Row Level Security — defense in depth. The Next.js server talks to
-- these tables with the service-role key and re-checks conversation
-- membership on every request; these policies additionally DENY any
-- direct client access that does not present a participant JWT
-- (auth.uid()). With no policy match, Postgres returns zero rows.
-- ============================================================
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table chat_messages enable row level security;
alter table message_reactions enable row level security;
alter table chat_devices enable row level security;

create policy "participants read conversation" on conversations
  for select using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = conversations.id and cp.user_id = auth.uid()
    )
  );

create policy "participants see participants" on conversation_participants
  for select using (
    exists (
      select 1 from conversation_participants me
      where me.conversation_id = conversation_participants.conversation_id
        and me.user_id = auth.uid()
    )
  );
create policy "join own conversations" on conversation_participants
  for insert with check (auth.uid() = user_id);
create policy "update own participation" on conversation_participants
  for update using (auth.uid() = user_id);

create policy "participants read messages" on chat_messages
  for select using (
    deleted_at is null
    and expires_at > now()
    and exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = chat_messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );
create policy "participants send messages" on chat_messages
  for insert with check (
    auth.uid() = sender_id
    and expires_at > now()
    and exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = chat_messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );
create policy "senders unsend own messages" on chat_messages
  for update using (auth.uid() = sender_id);

create policy "participants read reactions" on message_reactions
  for select using (
    exists (
      select 1 from conversation_participants cp
      join chat_messages m on m.id = message_reactions.message_id
      where cp.conversation_id = m.conversation_id and cp.user_id = auth.uid()
    )
  );
create policy "react as self" on message_reactions
  for insert with check (auth.uid() = user_id);
create policy "unreact as self" on message_reactions
  for delete using (auth.uid() = user_id);

-- Public key bundles must be fetchable by other users (X3DH), but only
-- their owner may create/rotate them.
create policy "authenticated read key bundles" on chat_devices
  for select using (auth.role() = 'authenticated');
create policy "devices manage own keys" on chat_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
