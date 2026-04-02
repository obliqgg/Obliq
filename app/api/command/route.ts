import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAuthConfigured } from "@/lib/auth";
import { execute } from "@/lib/db";
import {
  getCommandRuntime,
  getPhaseStatusesForUser,
  getLeaderboard,
  ensureInitialized,
  incrementSuspicion,
  recordPlayerEvent,
  submitDirectiveAnswer,
} from "@/lib/product";
import type { CommandRuntimeRecord } from "@/lib/types";

// In-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const LIVE_PUZZLE_COUNT = 2;

type ShellMode = "public" | "archon" | "directive";
type PendingPrompt =
  | {
      type: "directives_confirm";
      phaseSlug: string;
      phaseNumber: number;
      phaseTitle: string;
    }
  | undefined;

const pendingPromptMap = new Map<string, PendingPrompt>();

function hashIP(ip: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "obliq-salt");
  let hash = 0;
  for (const byte of data) {
    hash = ((hash << 5) - hash + byte) | 0;
  }
  return hash.toString(36);
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isRateLimited(ip: string): boolean {
  const key = hashIP(ip);
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

function formatLines(lines: string[]) {
  return lines.join("\n");
}

async function getPuzzlePrompt(userId: string, isAdmin = false) {
  const statuses = await getPhaseStatusesForUser(userId, isAdmin);
  const livePhases = statuses.filter((phase) => phase.number <= LIVE_PUZZLE_COUNT);
  const nextPhase = livePhases.find((phase) => !phase.isSolved);

  return {
    livePhases,
    nextPhase,
  };
}

function asResponse(command: CommandRuntimeRecord, response: string) {
  return {
    matched: true,
    clear: command.clear === 1,
    redirectTo: command.redirect_to ?? undefined,
    action: command.action ?? undefined,
    response,
  };
}

async function resolveRuntimeCommand(
  command: CommandRuntimeRecord,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  sessionId: string | null
) {
  switch (command.handler) {
    case "static":
    case "redirect":
      return asResponse(command, command.response_text ?? "");
    case "public_archon":
      return asResponse(command, user?.has_paid ? command.response_alt_text ?? "" : command.response_text ?? "");
    case "login":
      if (!isAuthConfigured()) {
        return asResponse(command, command.response_error_text ?? "command unavailable.");
      }
      return {
        matched: true,
        clear: command.clear === 1,
        action: user ? undefined : command.action ?? undefined,
        redirectTo: user ? command.redirect_to ?? undefined : undefined,
        response: user ? command.response_alt_text ?? "" : command.response_text ?? "",
      };
    case "connect":
      return user?.has_paid
        ? {
            matched: true,
            response: command.response_alt_text ?? "",
          }
        : asResponse(command, command.response_text ?? "");
    case "leaderboard": {
      if (!user?.has_paid) {
        return asResponse(command, command.response_error_text ?? "entry required.");
      }

      const board = await getLeaderboard();
      return asResponse(
        command,
        formatLines([
          command.response_text ?? "leaderboard",
          ...board.slice(0, 5).map(
            (entry, index) => `#${index + 1} @${entry.handle} // ${entry.solvedCount} solved`
          ),
        ])
      );
    }
    case "directives": {
      if (!user?.has_paid) {
        return asResponse(command, command.response_error_text ?? "entry required.");
      }

      const { livePhases, nextPhase } = await getPuzzlePrompt(user.id, user.role === "admin");
      if (!nextPhase) {
        if (sessionId) {
          pendingPromptMap.delete(sessionId);
        }
        return asResponse(
          command,
          formatLines([
            ...livePhases.map((phase) => `${String(phase.number).padStart(2, "0")} ${phase.title} [completed]`),
            "",
            command.response_alt_text ?? "",
          ])
        );
      }

      if (sessionId) {
        pendingPromptMap.set(sessionId, {
          type: "directives_confirm",
          phaseSlug: nextPhase.slug,
          phaseNumber: nextPhase.number,
          phaseTitle: nextPhase.title,
        });
      }

      return asResponse(
        command,
        formatLines([
          ...livePhases
            .filter((phase) => phase.isSolved || phase.id === nextPhase.id)
            .map((phase) =>
              phase.isSolved
                ? `${String(phase.number).padStart(2, "0")} ${phase.title} [completed]`
                : `${String(phase.number).padStart(2, "0")} ${phase.title}`
            ),
          "",
          command.response_text ?? "",
        ])
      );
    }
    default:
      return null;
  }
}

async function getDynamicCommandResponse(
  input: string,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  shell: ShellMode,
  sessionId: string | null,
  phaseSlug: string | null
) {
  const pendingPrompt = sessionId ? pendingPromptMap.get(sessionId) : undefined;

  if (shell === "directive") {
    if (!user) {
      return {
        matched: true,
        clear: true,
        redirectTo: "/",
        response: "session lost.",
      };
    }

    if (!user.has_paid) {
      return {
        matched: true,
        clear: true,
        redirectTo: "/archon",
        response: "entry required.",
      };
    }

    const shellCommand =
      (phaseSlug ? await getCommandRuntime(`directive:${phaseSlug}`, input) : null) ||
      (await getCommandRuntime("directive", input));
    if (shellCommand) {
      const resolved = await resolveRuntimeCommand(shellCommand, user, sessionId);
      if (resolved) {
        return resolved;
      }
    }

    if (!phaseSlug) {
      return {
        matched: true,
        response: "directive unavailable.",
      };
    }

    const result = await submitDirectiveAnswer(user, phaseSlug, input);
    return {
      matched: true,
      response: result.message,
    };
  }

  if (shell === "public") {
    const publicCommand = await getCommandRuntime("public", input);
    if (publicCommand) {
      return resolveRuntimeCommand(publicCommand, user, sessionId);
    }
    return null;
  }

  if (!user) {
    return {
      matched: true,
      clear: true,
      redirectTo: "/",
      response: "session lost.",
    };
  }

  if (pendingPrompt?.type === "directives_confirm") {
    if (input === "y" || input === "yes") {
      pendingPromptMap.delete(sessionId!);
      return {
        matched: true,
        clear: true,
        redirectTo: `/archon/${pendingPrompt.phaseSlug}`,
        response: `opening ${String(pendingPrompt.phaseNumber).padStart(2, "0")} ${pendingPrompt.phaseTitle.toLowerCase()}...`,
      };
    }

    if (input === "n" || input === "no") {
      pendingPromptMap.delete(sessionId!);
      return {
        matched: true,
        response: "standing by.",
      };
    }
  }

  const archonCommand = await getCommandRuntime("archon", input);
  if (archonCommand) {
    return resolveRuntimeCommand(archonCommand, user, sessionId);
  }

  return null;
}

export async function POST(request: NextRequest) {
  await ensureInitialized();
  const user = await getCurrentUser();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    if (user) {
      await incrementSuspicion(user.id, 1);
      await recordPlayerEvent(
        user.id,
        "terminal_rate_limited",
        "Terminal rate limit triggered",
        "Exceeded terminal request budget inside a one-minute window.",
        "terminal",
        null
      );
    }
    return NextResponse.json(
      { response: "rate limit exceeded. try again.", matched: false },
      { status: 429 }
    );
  }

  let body: { input?: string; session_id?: string; shell?: ShellMode; phase_slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { response: "invalid request.", matched: false },
      { status: 400 }
    );
  }

  const rawInput = body.input ?? "";
  const sessionId = body.session_id ?? null;
  const shell: ShellMode = body.shell === "archon" || body.shell === "directive" ? body.shell : "public";
  const phaseSlug = typeof body.phase_slug === "string" ? body.phase_slug : null;

  // Process input: trim, lowercase, strip leading > or /
  const input = rawInput.trim().toLowerCase().replace(/^[>/]+/, "").trim();

  if (!input) {
    return NextResponse.json({
      response: "unrecognized input. intent unclear.",
      matched: false,
    });
  }

  try {
    const dynamicResult = await getDynamicCommandResponse(input, user, shell, sessionId, phaseSlug);
    if (dynamicResult) {
      const ipHash = await sha256(ip);
      execute(
        "INSERT INTO input_log (id, input, matched, session_id, ip_hash) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)",
        [input, 1, sessionId, ipHash]
      ).catch(() => {});

      if (user) {
        await recordPlayerEvent(
          user.id,
          "terminal_match",
          `Terminal command matched: ${input}`,
          "Issued a recognized terminal command and received a mapped response.",
          shell,
          null
        );
      }

      return NextResponse.json(dynamicResult);
    }

    const ipHash = await sha256(ip);
    execute(
      "INSERT INTO input_log (id, input, matched, session_id, ip_hash) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)",
      [input, 0, sessionId, ipHash]
    ).catch(() => {});

    if (user) {
      await recordPlayerEvent(
        user.id,
        "terminal_probe",
        `Terminal probe: ${input}`,
        "Issued an unrecognized terminal command.",
        shell,
        null
      );
    }

    return NextResponse.json({ response: "unrecognized input. intent unclear.", matched: false });
  } catch (error) {
    console.error("Command lookup error:", error);
    return NextResponse.json(
      { response: "system error. try again.", matched: false },
      { status: 500 }
    );
  }
}
