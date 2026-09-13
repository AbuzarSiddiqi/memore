import { db } from "@/lib/server/db";
import { ok, requireUser } from "@/lib/server/http";
import { marketStats } from "@/lib/server/market";
import { eventAndSeason, marketSections, trending } from "@/lib/server/feed";
import { memeView } from "@/lib/server/views";

export async function GET() {
  const user = await requireUser();
  const stats = marketStats();
  const d = db();
  const view = (id: string | null) => (id ? memeView(d.memes.find((m) => m.id === id)!, user?.id) : null);
  const { event, season } = eventAndSeason();
  return ok({
    stats: {
      ...stats,
      biggest_gainer: view(stats.biggest_gainer),
      biggest_loser: view(stats.biggest_loser),
    },
    sections: marketSections(user),
    trending: trending(5, user),
    event,
    season,
  });
}
