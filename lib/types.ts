// AURA shared types — used by both server services and client components.

export type MediaType = "image" | "video";
export type UserRole = "user" | "admin";
export type MemeStatus = "live" | "removed";
export type HeatLevel = "COLD" | "WARM" | "HOT" | "VIRAL" | "LEGENDARY";
export type UserTitle = "AURA_LEGEND" | "MEME_ORACLE" | "DIAMOND_HANDS" | "TREND_HUNTER" | "BAGHOLDER" | null;

export interface HunterStats {
  score: number;
  early_discoveries: number;
  successful_picks: number;
}

export interface MemeDNA {
  humor: number;
  chaos: number;
  relatability: number;
  brainrot: number;
  wholesome: number;
  absurdity: number;
}

export interface Profile {
  id: string;
  email: string;
  password_hash: string;
  username: string;
  display_name: string;
  avatar_bg: string;
  bio: string;
  aura_balance: number;
  reputation: number;
  level: number;
  xp: number;
  role: UserRole;
  is_seed: boolean;
  interests: string[];
  onboarded: boolean;
  suspended: boolean;
  hunter: HunterStats;
  created_at: string;
  blocked?: string[];
  active_reactions?: string[]; // the user's five quick-reaction slots (order = priority)
}

export interface Meme {
  id: string;
  creator_id: string;
  caption: string;
  description: string;
  category: string;
  tags: string[];
  media_type: MediaType;
  media_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  duration: number | null;
  initial_price: number;
  current_price: number;
  net_invested: number;
  total_invested: number;
  total_sell_value: number;
  open_price_24h: number;
  all_time_high: number;
  volume_24h: number;
  momentum: number;
  views: number;
  saves: number;
  remix_count: number;
  battle_wins: number;
  battle_losses: number;
  status: MemeStatus;
  parent_meme_id: string | null;
  epitaph: string | null;
  source: "original" | "instagram";
  source_url: string | null;
  source_handle: string | null;
  dna: MemeDNA;
  created_at: string;
  updated_at: string;
}

export interface Holding {
  id: string;
  user_id: string;
  meme_id: string;
  quantity: number;
  invested_amount: number;
  avg_entry_price: number;
  realized_pnl: number;
  last_notif_value: number;
  last_notif_at: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  meme_id: string;
  type: "buy" | "sell";
  units: number;
  price: number;
  total_value: number;
  realized_pnl: number | null;
  cost_basis: number | null; // sell only: units × avg entry at sell time
  created_at: string;
}

export interface PricePoint {
  t: number; // epoch ms
  p: number;
  v: number; // volume delta in that bucket
}

export interface Comment {
  id: string;
  meme_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface Remix {
  id: string;
  original_meme_id: string;
  remix_meme_id: string;
  creator_id: string;
  created_at: string;
}

// AURA Call — a public prediction
export interface AuraCall {
  id: string;
  user_id: string;
  meme_id: string;
  target: "VIRAL" | "FLOP";
  price_at_call: number;
  status: "open" | "won" | "lost";
  resolves_at: string;
  created_at: string;
}

// Battle — users stake Aura on which meme moons
export interface BattleStake {
  user_id: string;
  amount: number;
  created_at: string;
}

export interface Battle {
  id: string;
  category: string;
  meme_a_id: string;
  meme_b_id: string;
  status: "open" | "resolved";
  winner_id: string | null;
  stakes_a: BattleStake[];
  stakes_b: BattleStake[];
  price_a_at_start: number;
  price_b_at_start: number;
  created_at: string;
}

export interface UserDaily {
  key: string; // `${userId}:${YYYY-MM-DD}`
  views: string[];
  invests: number;
  early: number;
  remixes: number;
  calls: number;
  completed: string[];
}

export type NotificationType =
  | "invest_made"
  | "pick_up"
  | "pick_down"
  | "trending"
  | "remix"
  | "follow"
  | "battle_win"
  | "achievement"
  | "comment"
  | "call_won"
  | "call_lost"
  | "mission";

export interface AuraNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  meme_id: string | null;
  read: boolean;
  created_at: string;
}

export interface SavedMeme {
  user_id: string;
  meme_id: string;
  created_at: string;
}

export type ReportCategory = "spam" | "harassment" | "hate" | "sexual" | "violence" | "copyright" | "other";

export interface Report {
  id: string;
  reporter_id: string;
  target_type: "meme" | "comment" | "user" | "chat";
  target_id: string;
  category: ReportCategory;
  note: string;
  status: "open" | "resolved";
  created_at: string;
}

export interface Session {
  token: string;
  user_id: string;
  created_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface UserAchievement {
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

export interface DB {
  users: Profile[];
  memes: Meme[];
  holdings: Holding[];
  transactions: Transaction[];
  price_history: Record<string, PricePoint[]>;
  comments: Comment[];
  follows: Follow[];
  remixes: Remix[];
  calls: AuraCall[];
  battles: Battle[];
  notifications: AuraNotification[];
  saved_memes: SavedMeme[];
  reports: Report[];
  sessions: Session[];
  chats: ChatConversation[];
  chat_messages: ChatMessage[];
  message_reactions: MessageReaction[];
  achievements: Achievement[];
  user_achievements: UserAchievement[];
  user_daily: UserDaily[];
  meta: { last_tick: number; tick_count: number; version: number };
}

// ---------- 24-hour disappearing chat ----------
export interface ChatConversation {
  id: string;
  participants: [string, string]; // sorted pair of user ids (1-to-1 in V1)
  created_at: string;
  expires_at: string; // server-authoritative: created_at + 24h
  status: "active" | "expired";
  reads: Record<string, string>; // user_id -> last read timestamp
  muted: Record<string, boolean>; // user_id -> muted (no badge)
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: "text" | "post" | "image" | "video" | "sticker";
  content: string;
  post_id: string | null;
  media_url: string | null;
  sticker_id: string | null; // key into the MEMORE sticker catalog (lib/stickers.ts)
  reply_to_message_id: string | null; // quote reference — never a duplicated object
  created_at: string;
}

// compact quote hydrated onto a message that replies to another message
export interface ChatReplyRef {
  id: string;
  sender_id: string;
  type: ChatMessage["type"];
  content: string;
  sticker_id: string | null;
  post: { id: string; caption: string; thumbnail_url: string } | null;
}

// one user holds at most ONE reaction per message (a new choice replaces the old)
export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction_id: string; // key into the shared REACTIONS catalog (lib/reactions.ts)
  created_at: string;
}

export interface MessageReactionSummary {
  reaction_id: string;
  count: number;
  mine: boolean; // the requesting user is one of the reactors
}

export interface ChatOtherUser {
  id: string;
  username: string;
  display_name: string;
  avatar_bg: string;
}

export interface ChatListItem {
  id: string;
  other: ChatOtherUser;
  preview: string;
  preview_type: ChatMessage["type"];
  last_at: string; // last message time
  unread: number;
  remaining_ms: number;
  expires_at: string;
  muted: boolean;
}

export interface ChatMessageView extends ChatMessage {
  post: MemeView | null; // hydrated meme preview for shared posts
  seen: boolean; // other participant's read timestamp >= created_at
  reactions: MessageReactionSummary[]; // aggregated, catalog-ordered
  reply_to: ChatReplyRef | null; // hydrated quote target
}

export interface ChatDetail {
  conversation: { id: string; created_at: string; expires_at: string; remaining_ms: number; other_read_at?: string };
  other: ChatOtherUser;
  messages: ChatMessageView[];
  is_delta?: boolean;
}

// ---------- API payload shapes ----------

export interface PublicUser {
  id: string;
  username: string;
  display_name: string;
  avatar_bg: string;
  bio: string;
  aura_balance: number;
  reputation: number;
  level: number;
  xp: number;
  role: UserRole;
  is_seed: boolean;
  interests: string[];
  onboarded: boolean;
  suspended?: boolean;
  active_reactions?: string[]; // the user's five quick-reaction slots (order = priority)
  hunter: HunterStats;
  prediction_iq: number;
  title: UserTitle;
  created_at: string;
  followers?: number;
  following?: number;
  meme_count?: number;
  is_following?: boolean;
}

export interface Heat {
  level: HeatLevel;
  score: number;
}

export interface MemeView extends Meme {
  creator: PublicUser;
  change_24h: number;
  change_all: number;
  investor_count: number;
  comment_count: number;
  label: MemeLabel | null;
  heat: Heat;
  smart_money: { legends: number; aura: number };
  spark: number[];
  is_saved?: boolean;
  my_position?: PositionView | null;
  my_call?: { target: "VIRAL" | "FLOP"; status: "open" | "won" | "lost" } | null;
  dna_match?: number | null;
}

export interface PositionView {
  quantity: number;
  invested_amount: number;
  avg_entry_price: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
}

export interface FeedResponse {
  memes: MemeView[];
  has_more: boolean;
  page: number;
  event: EventView;
  season: SeasonView;
}

export interface EventView {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export type MemeLabel =
  | "RISING" | "EXPLODING" | "UNDERVALUED" | "FRESH" | "COOLING" | "CRASHING" | "SMART_PICK" | "EARLY";

export interface MarketSection { id: string; title: string; subtitle: string; memes: MemeView[] }

export interface MissionView {
  id: string;
  name: string;
  hint: string;
  progress: number;
  need: number;
  reward: number;
  done: boolean;
}

export interface SeasonView {
  id: number;
  name: string;
  ends_at: string;
}
