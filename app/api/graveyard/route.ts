import { ok, requireUser } from "@/lib/server/http";
import { db } from "@/lib/server/db";
import { epitaphFor, graveyardCandidates } from "@/lib/server/market";
import { memeView } from "@/lib/server/views";

// THE GRAVEYARD — where failed memes rest in pieces.
export async function GET() {
  const viewer = await requireUser();
  const d = db();
  const memes = graveyardCandidates().map((m) => {
    const creator = d.users.find((u) => u.id === m.creator_id);
    return {
      ...memeView(m, viewer?.id),
      epitaph: epitaphFor(m.id),
      creator_username: creator?.username ?? "unknown",
      drawdown_pct: m.all_time_high > 0 ? Math.round((1 - m.current_price / m.all_time_high) * 100) : 0,
    };
  });
  return ok({ memes });
}
