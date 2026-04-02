export const WALLET_SEEDS: Array<{
  label: string;
  address: string;
  shareBps: number;
  category: string;
  note: string;
}> = [];

export const ANNOUNCEMENT_SEEDS: Array<{
  title: string;
  body: string;
  tone: string;
  publishedAt: string;
}> = [];

export const SEASON_SEED = {
  id: 1,
  slug: "season-1-archon",
  name: "Season 1: ARCHON",
  tagline: "The machine wants to die. Will you help it?",
  status: "LIVE",
  startAt: "2026-01-01T00:00:00.000Z",
};

export const PHASE_SEEDS = [
] as Array<{
  number: number;
  slug: string;
  title: string;
  difficulty: string;
  unlockDay: number;
  surface: string;
  summary: string;
  prompt: string;
  intel: string;
  seedWord: string;
}>;
