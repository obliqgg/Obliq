export type BootLine = {
  text: string;
  color?: string;
  charDelay?: number;
  dotDelay?: number;
  postDelay?: number;
  highlights?: Array<{ word: string; color: string }>;
};

export type UserRecord = {
  id: string;
  twitter_id?: string | null;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  role: "player" | "admin";
  has_paid: number;
  suspicion_score: number;
  created_at: string;
  updated_at: string;
};

export type SeasonRecord = {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  status: string;
  start_at: string;
};

export type PhaseRecord = {
  id: number;
  season_id: number;
  number: number;
  slug: string;
  title: string;
  difficulty: string;
  unlock_day: number;
  summary: string;
  prompt: string;
  surface: string;
  intel: string;
  answer_hash: string;
  seed_word: string;
  active: number;
};

export type WalletRecord = {
  id: number;
  label: string;
  address: string;
  share_bps: number;
  category: string;
  note: string;
};

export type PaymentRecord = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  reference: string;
  created_at: string;
  confirmed_at: string | null;
};

export type DirectiveRuntimeRecord = {
  slug: string;
  answer_hash: string;
  answer_output: string;
  seed_fragment: string;
};

export type CommandRuntimeRecord = {
  shell: string;
  command: string;
  visibility: "public" | "hidden";
  handler: string;
  response_text: string | null;
  response_alt_text: string | null;
  response_error_text: string | null;
  clear: number;
  redirect_to: string | null;
  action: string | null;
  sort_order: number;
};

export type ArtifactRuntimeRecord = {
  slug: string;
  content_type: string;
  filename: string;
  asset_path: string;
  payload_b64: string;
};

export type DirectiveSurfaceRuntimeRecord = {
  slug: string;
  opening_lines_json: string;
  cleared_notice: string;
};

export type PhaseStatus = PhaseRecord & {
  isUnlocked: boolean;
  isSolved: boolean;
  solvedAt: string | null;
  guessesUsedInWindow: number;
};

export type LeaderboardEntry = {
  userId: string;
  handle: string;
  displayName: string;
  solvedCount: number;
  lastSolvedAt: string | null;
  hasPaid: boolean;
  artifactCount: number;
  visitCount: number;
};
