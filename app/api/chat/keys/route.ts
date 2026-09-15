import { NextRequest } from "next/server";
import { requireUser, ok, fail, rateLimit } from "@/lib/server/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNotProvisioned } from "@/lib/server/chats";

const NOT_PROVISIONED = "Chat storage isn't provisioned yet. Run database/migration_v6_e2ee_chat.sql in the Supabase SQL Editor.";

interface PgErr { code?: string; message?: string }
interface PgResult<T> { data: T | null; error: PgErr | null }
async function one<T>(q: PromiseLike<PgResult<T>>): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
async function many<T>(q: PromiseLike<PgResult<T[]>>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// GET /api/chat/keys?user=<uuid>
// Returns a peer's PUBLIC key bundle for X3DH session establishment. Only
// public material leaves the database — identity key, signed prekey and its
// signature. Private keys live exclusively in the owner's IndexedDB.
// Without ?user=, returns the caller's own registered devices (the client
// uses this to know if its identity already exists in this browser).
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  const admin = createAdminClient();
  if (!admin) return fail("Key store unavailable.", 503);
  const peerId = new URL(req.url).searchParams.get("user") || "";

  try {
    if (!peerId || peerId === user.id) {
      const devices = await many<{ device_id: string; registration_id: number }>(
        admin.from("chat_devices").select("device_id,registration_id").eq("user_id", user.id)
      );
      // Self-bundle (public material only) so a device can run X3DH against
      // ITSELF — the self-copy is how the sender re-reads their own sent
      // messages after a refresh.
      const device = await one<Record<string, unknown>>(
        admin.from("chat_devices").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      );
      return ok({
        devices,
        device: device
          ? {
              device_id: device.device_id,
              registration_id: device.registration_id,
              identity_key: device.identity_key,
              signed_prekey_id: device.signed_prekey_id,
              signed_prekey_public: device.signed_prekey_public,
              signed_prekey_signature: device.signed_prekey_signature,
            }
          : null,
      });
    }
    const device = await one<Record<string, unknown>>(
      admin.from("chat_devices").select("*").eq("user_id", peerId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    );
    if (!device) return ok({ device: null });
    return ok({
      device: {
        device_id: device.device_id,
        registration_id: device.registration_id,
        identity_key: device.identity_key,
        signed_prekey_id: device.signed_prekey_id,
        signed_prekey_public: device.signed_prekey_public,
        signed_prekey_signature: device.signed_prekey_signature,
      },
    });
  } catch (err) {
    return fail(isNotProvisioned(err) ? NOT_PROVISIONED : "Key store unavailable.", 503);
  }
}

// POST /api/chat/keys — register/rotate THIS device's bundle. The client
// generates everything locally; the server is a dumb public bulletin board.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Log in first.", 401);
  if (!rateLimit(`chat-keys:${user.id}`, 15, 60 * 60_000)) return fail("Too many key updates.", 429);
  const admin = createAdminClient();
  if (!admin) return fail("Key store unavailable.", 503);
  const body = await req.json().catch(() => ({}));

  const deviceId = typeof body.device_id === "string" ? body.device_id.slice(0, 64) : "";
  const registrationId = Number(body.registration_id);
  const identityKey = typeof body.identity_key === "string" ? body.identity_key : "";
  const signedPreKeyId = Number(body.signed_prekey_id);
  const signedPreKeyPublic = typeof body.signed_prekey_public === "string" ? body.signed_prekey_public : "";
  const signedPreKeySignature = typeof body.signed_prekey_signature === "string" ? body.signed_prekey_signature : "";
  if (!deviceId || !Number.isFinite(registrationId) || !identityKey || !Number.isFinite(signedPreKeyId) || !signedPreKeyPublic || !signedPreKeySignature) {
    return fail("Incomplete key bundle.");
  }

  try {
    const { error } = await admin.from("chat_devices").upsert(
      {
        user_id: user.id,
        device_id: deviceId,
        registration_id: registrationId,
        identity_key: identityKey,
        signed_prekey_id: signedPreKeyId,
        signed_prekey_public: signedPreKeyPublic,
        signed_prekey_signature: signedPreKeySignature,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id" }
    );
    if (error) throw error;
    return ok({ registered: true });
  } catch (err) {
    return fail(isNotProvisioned(err) ? NOT_PROVISIONED : "Couldn't register keys.", 503);
  }
}
