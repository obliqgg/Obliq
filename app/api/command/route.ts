import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// In-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

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

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { response: "rate limit exceeded. try again.", matched: false },
      { status: 429 }
    );
  }

  let body: { input?: string; session_id?: string };
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

  // Process input: trim, lowercase, strip leading > or /
  const input = rawInput.trim().toLowerCase().replace(/^[>/]+/, "").trim();

  if (!input) {
    return NextResponse.json({
      response: "unrecognized input. signal unclear.",
      matched: false,
    });
  }

  try {
    const result = await query(
      "SELECT response FROM commands WHERE command = ? AND active = 1",
      [input]
    );

    const matched = result.rows.length > 0;
    const response = matched
      ? (result.rows[0].response as string)
      : "unrecognized input. signal unclear.";

    // Log input (fire and forget)
    const ipHash = await sha256(ip);
    query(
      "INSERT INTO input_log (id, input, matched, session_id, ip_hash) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)",
      [input, matched ? 1 : 0, sessionId, ipHash]
    ).catch(() => {});

    return NextResponse.json({ response, matched });
  } catch (error) {
    console.error("Command lookup error:", error);
    return NextResponse.json(
      { response: "system error. try again.", matched: false },
      { status: 500 }
    );
  }
}
