import { batch, execute, queryFirst, queryRows } from "@/lib/db";
import { ANNOUNCEMENT_SEEDS, PHASE_SEEDS, SEASON_SEED, WALLET_SEEDS } from "@/lib/content";
import { ENTRY_TOKEN_DISPLAY } from "@/lib/economy";
import { createSolanaReference, findConfirmedEntryTransfer } from "@/lib/solana";
import type {
  ArtifactRuntimeRecord,
  CommandRuntimeRecord,
  DirectiveRuntimeRecord,
  DirectiveSurfaceRuntimeRecord,
  LeaderboardEntry,
  PaymentRecord,
  PhaseRecord,
  PhaseStatus,
  SeasonRecord,
  UserRecord,
  WalletRecord,
} from "@/lib/types";

let initPromise: Promise<void> | null = null;

function now() {
  return new Date();
}

function nowIso() {
  return now().toISOString();
}

async function hashAnswer(input: string) {
  const normalized = input.trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function phaseUnlockAt(seasonStart: string, unlockDay: number) {
  return new Date(new Date(seasonStart).getTime() + unlockDay * 24 * 60 * 60 * 1000);
}

function getDirectiveRuntimeSeeds() {
  const raw = process.env.OBLIQ_DIRECTIVE_RUNTIME || "";
  if (!raw) {
    return {} as Record<string, { answer: string; seedFragment: string }>;
  }

  return JSON.parse(raw) as Record<string, { answer: string; seedFragment: string }>;
}

async function seedIfEmpty() {
  const season = await queryFirst<{ total: number }>("SELECT COUNT(*) AS total FROM seasons");
  if ((Number(season?.total) || 0) === 0) {
    await execute(
      "INSERT INTO seasons (id, slug, name, tagline, status, start_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        SEASON_SEED.id,
        SEASON_SEED.slug,
        SEASON_SEED.name,
        SEASON_SEED.tagline,
        SEASON_SEED.status,
        SEASON_SEED.startAt,
      ]
    );
  }

  const phases = await queryFirst<{ total: number }>("SELECT COUNT(*) AS total FROM phases");
  if ((Number(phases?.total) || 0) === 0 && PHASE_SEEDS.length > 0) {
    await batch(
      PHASE_SEEDS.map((phase) => ({
        sql: `INSERT INTO phases
          (season_id, number, slug, title, difficulty, unlock_day, summary, prompt, surface, intel, answer_hash, seed_word, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        args: [
          SEASON_SEED.id,
          phase.number,
          phase.slug,
          phase.title,
          phase.difficulty,
          phase.unlockDay,
          phase.summary,
          phase.prompt,
          phase.surface,
          phase.intel,
          `directive:${phase.slug}`,
          phase.seedWord,
        ],
      }))
    );
  }

  const wallets = await queryFirst<{ total: number }>("SELECT COUNT(*) AS total FROM wallets");
  if ((Number(wallets?.total) || 0) === 0) {
    await batch(
      WALLET_SEEDS.map((wallet) => ({
        sql: `INSERT INTO wallets (label, address, share_bps, category, note) VALUES (?, ?, ?, ?, ?)`,
        args: [wallet.label, wallet.address, wallet.shareBps, wallet.category, wallet.note],
      }))
    );
  }

  const announcements = await queryFirst<{ total: number }>("SELECT COUNT(*) AS total FROM announcements");
  if ((Number(announcements?.total) || 0) === 0 && ANNOUNCEMENT_SEEDS.length > 0) {
    await batch(
      ANNOUNCEMENT_SEEDS.map((item) => ({
        sql: `INSERT INTO announcements (title, body, tone, published_at) VALUES (?, ?, ?, ?)`,
        args: [item.title, item.body, item.tone, item.publishedAt],
      }))
    );
  }

  const directiveRuntimeSeeds = getDirectiveRuntimeSeeds();
  const directiveStatements = await Promise.all(
    Object.entries(directiveRuntimeSeeds).map(async ([slug, directive]) => ({
      sql: `INSERT INTO directive_runtime (slug, answer_hash, answer_output, seed_fragment)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          answer_hash = excluded.answer_hash,
          answer_output = excluded.answer_output,
          seed_fragment = excluded.seed_fragment`,
      args: [
        slug,
        await hashAnswer(directive.answer),
        directive.answer,
        directive.seedFragment,
      ],
    }))
  );
  if (directiveStatements.length > 0) {
    await batch(directiveStatements);
  }

  const admin = await queryFirst<{ total: number }>(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
  );
  if ((Number(admin?.total) || 0) === 0) {
    await execute(
      `INSERT INTO users (id, handle, display_name, avatar_url, role, has_paid, suspicion_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        (process.env.OBLIQ_ADMIN_HANDLE || "operator").toLowerCase(),
        "Season Operator",
        null,
        "admin",
        1,
        0,
        nowIso(),
        nowIso(),
      ]
    );
  }
}

export async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await batch([
        {
          sql: `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            twitter_id TEXT,
            handle TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            avatar_url TEXT,
            role TEXT NOT NULL DEFAULT 'player',
            has_paid INTEGER NOT NULL DEFAULT 0,
            suspicion_score INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS seasons (
            id INTEGER PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            tagline TEXT NOT NULL,
            status TEXT NOT NULL,
            start_at TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS directive_runtime (
            slug TEXT PRIMARY KEY,
            answer_hash TEXT NOT NULL,
            answer_output TEXT NOT NULL,
            seed_fragment TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS command_runtime (
            shell TEXT NOT NULL,
            command TEXT NOT NULL,
            visibility TEXT NOT NULL DEFAULT 'public',
            handler TEXT NOT NULL DEFAULT 'static',
            response_text TEXT,
            response_alt_text TEXT,
            response_error_text TEXT,
            clear INTEGER NOT NULL DEFAULT 0,
            redirect_to TEXT,
            action TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (shell, command)
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS artifact_runtime (
            slug TEXT PRIMARY KEY,
            content_type TEXT NOT NULL,
            filename TEXT NOT NULL,
            asset_path TEXT NOT NULL DEFAULT '',
            payload_b64 TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS directive_surface_runtime (
            slug TEXT PRIMARY KEY,
            opening_lines_json TEXT NOT NULL,
            cleared_notice TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS phases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            number INTEGER NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            unlock_day INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL,
            prompt TEXT NOT NULL,
            surface TEXT NOT NULL,
            intel TEXT NOT NULL,
            answer_hash TEXT NOT NULL,
            seed_word TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS phase_solves (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            phase_id INTEGER NOT NULL,
            answer TEXT NOT NULL,
            solved_at TEXT NOT NULL,
            UNIQUE(user_id, phase_id)
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS submissions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            phase_id INTEGER NOT NULL,
            submitted_answer TEXT NOT NULL,
            matched INTEGER NOT NULL DEFAULT 0,
            window_key TEXT NOT NULL,
            created_at TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL,
            reference TEXT NOT NULL,
            created_at TEXT NOT NULL,
            confirmed_at TEXT
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            address TEXT NOT NULL,
            share_bps INTEGER NOT NULL,
            category TEXT NOT NULL,
            note TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            tone TEXT NOT NULL,
            published_at TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS surface_visits (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            surface_key TEXT NOT NULL,
            phase_slug TEXT,
            visited_at TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS player_notes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            surface_key TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, surface_key)
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS player_artifacts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            artifact_key TEXT NOT NULL,
            surface_key TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(user_id, artifact_key)
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS player_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            title TEXT NOT NULL,
            detail TEXT NOT NULL,
            surface_key TEXT,
            phase_slug TEXT,
            created_at TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS input_log (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            input TEXT NOT NULL,
            matched INTEGER NOT NULL DEFAULT 0,
            session_id TEXT,
            ip_hash TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`,
          args: [],
        },
      ]);

      try {
        await execute("ALTER TABLE users ADD COLUMN twitter_id TEXT");
      } catch {}
      await execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS users_twitter_id_idx ON users(twitter_id)"
      );

      try {
        await execute("ALTER TABLE artifact_runtime ADD COLUMN asset_path TEXT NOT NULL DEFAULT ''");
      } catch {}

      try {
        await execute("ALTER TABLE phases ADD COLUMN answer_hash TEXT");
      } catch {}

      await seedIfEmpty();
    })();
  }

  return initPromise;
}

export async function getSeason() {
  await ensureInitialized();
  return queryFirst<SeasonRecord>(
    "SELECT id, slug, name, tagline, status, start_at FROM seasons ORDER BY id ASC LIMIT 1"
  );
}

export async function getWallets() {
  await ensureInitialized();
  return queryRows<WalletRecord>(
    "SELECT id, label, address, share_bps, category, note FROM wallets ORDER BY share_bps DESC"
  );
}

async function getPhaseRows() {
  return queryRows<PhaseRecord>(
    `SELECT id, season_id, number, slug, title, difficulty, unlock_day, summary, prompt, surface, intel, answer_hash, seed_word, active
     FROM phases
     ORDER BY number ASC`
  );
}

function hydratePhaseStatus(
  season: SeasonRecord,
  phase: PhaseRecord,
  solvedMap: Map<number, string>,
  guessesThisWindow: Map<number, number>,
  isAdmin = false
): PhaseStatus {
  const unlockTime = phaseUnlockAt(season.start_at, phase.unlock_day);
  const isUnlocked = isAdmin || (phase.active === 1 && unlockTime.getTime() <= Date.now());
  const solvedAt = solvedMap.get(phase.id) ?? null;

  return {
    ...phase,
    isUnlocked,
    isSolved: Boolean(solvedAt),
    solvedAt,
    guessesUsedInWindow: guessesThisWindow.get(phase.id) ?? 0,
  };
}

export async function getPhaseStatusesForUser(userId: string, isAdmin = false) {
  await ensureInitialized();
  const season = await getSeason();
  if (!season) {
    return [];
  }

  const [phases, solves] = await Promise.all([
    getPhaseRows(),
    queryRows<{ phase_id: number; solved_at: string }>(
      "SELECT phase_id, solved_at FROM phase_solves WHERE user_id = ?",
      [userId]
    ),
  ]);

  const solvedMap = new Map(solves.map((solve) => [Number(solve.phase_id), solve.solved_at]));
  return phases.map((phase) => hydratePhaseStatus(season, phase, solvedMap, new Map(), isAdmin));
}

export async function getPhaseBySlug(slug: string) {
  await ensureInitialized();
  return queryFirst<PhaseRecord>(
    `SELECT id, season_id, number, slug, title, difficulty, unlock_day, summary, prompt, surface, intel, answer_hash, seed_word, active
     FROM phases
     WHERE slug = ?`,
    [slug]
  );
}

export async function submitDirectiveAnswer(
  user: UserRecord,
  slug: string,
  rawAnswer: string
) {
  await ensureInitialized();

  if (!user.has_paid) {
    return {
      ok: false,
      solved: false,
      message: "Entry payment required before directives unlock.",
    };
  }

  const phase = await getPhaseBySlug(slug);
  const directiveRuntime = await queryFirst<DirectiveRuntimeRecord>(
    `SELECT slug, answer_hash, answer_output, seed_fragment
     FROM directive_runtime
     WHERE slug = ?`,
    [slug]
  );
  if (!phase || !directiveRuntime) {
    return { ok: false, solved: false, message: "Directive not found." };
  }

  const alreadySolved = await queryFirst<{ id: string }>(
    "SELECT id FROM phase_solves WHERE user_id = ? AND phase_id = ?",
    [user.id, phase.id]
  );
  if (alreadySolved) {
    return {
      ok: false,
      solved: true,
      message: `Directive ${String(phase.number).padStart(2, "0")} already cleared.`,
    };
  }

  const submitted = rawAnswer.trim().toLowerCase().replace(/\s+/g, " ");
  const matched = (await hashAnswer(submitted)) === directiveRuntime.answer_hash;
  const createdAt = nowIso();

  await execute(
    `INSERT INTO submissions (id, user_id, phase_id, submitted_answer, matched, window_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), user.id, phase.id, submitted, matched ? 1 : 0, `directive:${slug}`, createdAt]
  );

  if (!matched) {
    await recordPlayerEvent(
      user.id,
      "directive_miss",
      `Directive ${phase.number} miss`,
      `Submitted an incorrect answer for ${phase.title}.`,
      slug,
      slug
    );
    return {
      ok: false,
      solved: false,
      message: "incorrect.",
    };
  }

  await execute(
    `INSERT OR IGNORE INTO phase_solves (id, user_id, phase_id, answer, solved_at)
     VALUES (?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), user.id, phase.id, submitted, createdAt]
  );

  await ensurePlayerArtifact(
    user.id,
    `phase-${phase.slug}-solved`,
    phase.slug,
    `Directive ${String(phase.number).padStart(2, "0")} cleared`,
    `Solved ${phase.title} and recovered seed fragment ${directiveRuntime.seed_fragment}.`
  );
  await recordPlayerEvent(
    user.id,
    "phase_solved",
    `Directive ${String(phase.number).padStart(2, "0")} cleared`,
    `Solved ${phase.title}. Seed fragment ${directiveRuntime.seed_fragment} recovered.`,
    phase.slug,
    phase.slug
  );

  return {
    ok: true,
    solved: true,
    message: `directive ${String(phase.number).padStart(2, "0")} cleared.\nseed fragment recovered: ${directiveRuntime.seed_fragment}\n\ntype exit to return`,
    seedWord: directiveRuntime.seed_fragment,
  };
}

export async function getDirectiveRuntime(slug: string) {
  await ensureInitialized();
  return queryFirst<DirectiveRuntimeRecord>(
    `SELECT slug, answer_hash, answer_output, seed_fragment
     FROM directive_runtime
     WHERE slug = ?`,
    [slug]
  );
}

export async function getCommandRuntime(
  shell: string,
  command: string
) {
  await ensureInitialized();
  return queryFirst<CommandRuntimeRecord>(
    `SELECT shell, command, visibility, handler, response_text, response_alt_text, response_error_text, clear, redirect_to, action, sort_order
     FROM command_runtime
     WHERE shell = ? AND command = ?`,
    [shell, command]
  );
}

export async function getArtifactRuntime(slug: string) {
  await ensureInitialized();
  return queryFirst<ArtifactRuntimeRecord>(
    `SELECT slug, content_type, filename, asset_path, payload_b64
     FROM artifact_runtime
     WHERE slug = ?`,
    [slug]
  );
}

export async function getDirectiveSurfaceRuntime(slug: string) {
  await ensureInitialized();
  return queryFirst<DirectiveSurfaceRuntimeRecord>(
    `SELECT slug, opening_lines_json, cleared_notice
     FROM directive_surface_runtime
     WHERE slug = ?`,
    [slug]
  );
}

export async function createOrConfirmPayment(userId: string) {
  await ensureInitialized();

  const existing = await queryFirst<PaymentRecord>(
    `SELECT id, user_id, amount_cents, currency, status, reference, created_at, confirmed_at
     FROM payments
     WHERE user_id = ? AND status = 'confirmed'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (existing) {
    return existing;
  }

  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    user_id: userId,
    amount_cents: 2000,
    currency: "SPL",
    status: "confirmed",
    reference: `OBLIQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    created_at: nowIso(),
    confirmed_at: nowIso(),
  };

  await execute(
    `INSERT INTO payments (id, user_id, amount_cents, currency, status, reference, created_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id,
      payment.user_id,
      payment.amount_cents,
      payment.currency,
      payment.status,
      payment.reference,
      payment.created_at,
      payment.confirmed_at,
    ]
  );

  await execute("UPDATE users SET has_paid = 1, updated_at = ? WHERE id = ?", [nowIso(), userId]);
  await ensurePlayerArtifact(
    userId,
    "entry-payment-confirmed",
    "payments",
    "Entry payment confirmed",
    `Confirmed ${ENTRY_TOKEN_DISPLAY} entry under reference ${payment.reference}.`
  );
  await recordPlayerEvent(
    userId,
    "payment_confirmed",
    "Entry confirmed",
    `Confirmed ${ENTRY_TOKEN_DISPLAY} season entry under reference ${payment.reference}.`,
    "payments",
    null
  );

  return payment;
}

async function finalizePaymentRecord(payment: PaymentRecord, confirmedAt: string | null) {
  await execute(
    "UPDATE payments SET status = 'confirmed', confirmed_at = ? WHERE id = ?",
    [confirmedAt ?? nowIso(), payment.id]
  );
  await execute("UPDATE users SET has_paid = 1, updated_at = ? WHERE id = ?", [nowIso(), payment.user_id]);
  await ensurePlayerArtifact(
    payment.user_id,
    "entry-payment-confirmed",
    "payments",
    "Entry payment confirmed",
    `Confirmed ${ENTRY_TOKEN_DISPLAY} entry under reference ${payment.reference}.`
  );
  await recordPlayerEvent(
    payment.user_id,
    "payment_confirmed",
    "Entry confirmed",
    `Confirmed ${ENTRY_TOKEN_DISPLAY} season entry under reference ${payment.reference}.`,
    "payments",
    null
  );
}

export async function getOrCreatePaymentIntent(userId: string) {
  await ensureInitialized();

  const existing = await queryFirst<PaymentRecord>(
    `SELECT id, user_id, amount_cents, currency, status, reference, created_at, confirmed_at
     FROM payments
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (existing) {
    return existing;
  }

  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    user_id: userId,
    amount_cents: 0,
    currency: "SPL",
    status: "pending",
    reference: createSolanaReference(),
    created_at: nowIso(),
    confirmed_at: null,
  };

  await execute(
    `INSERT INTO payments (id, user_id, amount_cents, currency, status, reference, created_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id,
      payment.user_id,
      payment.amount_cents,
      payment.currency,
      payment.status,
      payment.reference,
      payment.created_at,
      payment.confirmed_at,
    ]
  );

  await recordPlayerEvent(
    userId,
    "payment_intent_created",
    "Entry payment intent created",
    `Generated ${ENTRY_TOKEN_DISPLAY} payment intent under reference ${payment.reference}.`,
    "payments",
    null
  );

  return payment;
}

export async function confirmPaymentIntent(userId: string, paymentId: string) {
  await ensureInitialized();

  const payment = await queryFirst<PaymentRecord>(
    `SELECT id, user_id, amount_cents, currency, status, reference, created_at, confirmed_at
     FROM payments
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [paymentId, userId]
  );

  if (!payment) {
    return { ok: false, message: "payment intent not found.", payment: null };
  }

  if (payment.status === "confirmed") {
    return { ok: true, message: "entry already confirmed.", payment };
  }

  const observedTransfer = await findConfirmedEntryTransfer(payment.reference);
  if (!observedTransfer) {
    return {
      ok: false,
      message: "no matching onchain entry transfer found yet. send the SPL token payment, then check again.",
      payment,
    };
  }

  const confirmedPayment = {
    ...payment,
    status: "confirmed",
    confirmed_at: observedTransfer.confirmedAt ?? nowIso(),
  };
  await finalizePaymentRecord(confirmedPayment, confirmedPayment.confirmed_at);

  await recordPlayerEvent(
    userId,
    "payment_detected_onchain",
    "Onchain entry transfer detected",
    `Observed matching Solana transaction ${observedTransfer.signature} for ${payment.reference}.`,
    "payments",
    null
  );

  return {
    ok: true,
    message: `entry confirmed onchain under reference ${payment.reference}.`,
    payment: confirmedPayment,
  };
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  await ensureInitialized();
  const rows = await queryRows<{
    user_id: string;
    handle: string;
    display_name: string;
    solved_count: number;
    last_solved_at: string | null;
    has_paid: number;
    artifact_count: number;
    visit_count: number;
  }>(
    `SELECT
       u.id AS user_id,
       u.handle,
       u.display_name,
       COUNT(DISTINCT ps.id) AS solved_count,
       MAX(ps.solved_at) AS last_solved_at,
       u.has_paid,
       COUNT(DISTINCT pa.id) AS artifact_count,
       COUNT(DISTINCT sv.id) AS visit_count
     FROM users u
     LEFT JOIN phase_solves ps ON ps.user_id = u.id
     LEFT JOIN player_artifacts pa ON pa.user_id = u.id
     LEFT JOIN surface_visits sv ON sv.user_id = u.id
     GROUP BY u.id, u.handle, u.display_name, u.has_paid
     ORDER BY solved_count DESC, last_solved_at ASC, u.created_at ASC`
  );

  return rows.map((row) => ({
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    solvedCount: Number(row.solved_count) || 0,
    lastSolvedAt: row.last_solved_at,
    hasPaid: Number(row.has_paid) === 1,
    artifactCount: Number(row.artifact_count) || 0,
    visitCount: Number(row.visit_count) || 0,
  }));
}

export async function getPaymentForUser(userId: string) {
  return queryFirst<PaymentRecord>(
    `SELECT id, user_id, amount_cents, currency, status, reference, created_at, confirmed_at
     FROM payments
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
}

export async function recordSurfaceVisit(
  userId: string,
  surfaceKey: string,
  phaseSlug?: string | null
) {
  await ensureInitialized();

  const existing = await queryFirst<{ id: string; visited_at: string }>(
    `SELECT id, visited_at
     FROM surface_visits
     WHERE user_id = ? AND surface_key = ?
     ORDER BY visited_at DESC
     LIMIT 1`,
    [userId, surfaceKey]
  );

  if (existing && Date.now() - new Date(existing.visited_at).getTime() < 5 * 60 * 1000) {
    return;
  }

  await execute(
    `INSERT INTO surface_visits (id, user_id, surface_key, phase_slug, visited_at)
     VALUES (?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), userId, surfaceKey, phaseSlug ?? null, nowIso()]
  );
  await recordPlayerEvent(
    userId,
    "surface_visit",
    `Visited ${surfaceKey}`,
    phaseSlug ? `Entered ${surfaceKey} while tracing ${phaseSlug}.` : `Entered ${surfaceKey}.`,
    surfaceKey,
    phaseSlug ?? null
  );
}

export async function ensurePlayerArtifact(
  userId: string,
  artifactKey: string,
  surfaceKey: string,
  title: string,
  body: string
) {
  await ensureInitialized();
  const existing = await queryFirst<{ id: string }>(
    "SELECT id FROM player_artifacts WHERE user_id = ? AND artifact_key = ?",
    [userId, artifactKey]
  );

  if (existing) {
    return;
  }

  await execute(
    `INSERT INTO player_artifacts (id, user_id, artifact_key, surface_key, title, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), userId, artifactKey, surfaceKey, title, body, nowIso()]
  );
  await recordPlayerEvent(
    userId,
    "artifact_recovered",
    title,
    body,
    surfaceKey,
    null
  );
}

export async function incrementSuspicion(userId: string, delta = 1) {
  await ensureInitialized();
  await execute(
    `UPDATE users
     SET suspicion_score = suspicion_score + ?, updated_at = ?
     WHERE id = ?`,
    [delta, nowIso(), userId]
  );
}

export async function recordPlayerEvent(
  userId: string,
  eventType: string,
  title: string,
  detail: string,
  surfaceKey?: string | null,
  phaseSlug?: string | null
) {
  await ensureInitialized();
  await execute(
    `INSERT INTO player_events (id, user_id, event_type, title, detail, surface_key, phase_slug, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), userId, eventType, title, detail, surfaceKey ?? null, phaseSlug ?? null, nowIso()]
  );
}
