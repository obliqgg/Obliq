import { redirect } from "next/navigation";
import { getServerSession, type NextAuthOptions } from "next-auth";
import TwitterProvider from "next-auth/providers/twitter";
import { execute, queryFirst } from "@/lib/db";
import { ensureInitialized, recordPlayerEvent } from "@/lib/product";
import type { UserRecord } from "@/lib/types";

const ADMIN_HANDLE = (process.env.OBLIQ_ADMIN_HANDLE || "operator").toLowerCase();

type OAuthProfile = {
  id?: string;
  username?: string;
  name?: string;
  profile_image_url?: string;
  data?: {
    id?: string;
    username?: string;
    name?: string;
    profile_image_url?: string;
  };
};

function nowIso() {
  return new Date().toISOString();
}

export function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

function extractProfile(profile: OAuthProfile) {
  const source = profile.data ?? profile;
  const twitterId = String(source.id || "").trim();
  const rawHandle = String(source.username || "").trim();
  const fallbackHandle = twitterId ? `x-${twitterId.slice(-8).toLowerCase()}` : "";
  return {
    twitterId,
    handle: normalizeHandle(rawHandle || fallbackHandle),
    displayName: String(source.name || source.username || "").trim(),
    avatarUrl: source.profile_image_url || null,
  };
}

async function upsertOAuthUser(profile: OAuthProfile) {
  await ensureInitialized();

  const { twitterId, handle, displayName, avatarUrl } = extractProfile(profile);
  if (!twitterId) {
    console.error("Twitter profile missing id", profile);
    throw new Error("Twitter profile missing required id.");
  }

  const existing = await queryFirst<UserRecord>(
    `SELECT id, handle, display_name, avatar_url, role, has_paid, suspicion_score, created_at, updated_at
     FROM users
     WHERE twitter_id = ? OR handle = ?
     LIMIT 1`,
    [twitterId, handle]
  );

  const userId = existing?.id ?? crypto.randomUUID();
  const role = handle === ADMIN_HANDLE ? "admin" : "player";
  const now = nowIso();

  await execute(
    `INSERT INTO users (id, twitter_id, handle, display_name, avatar_url, role, has_paid, suspicion_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?, ?)
     ON CONFLICT(handle) DO UPDATE SET
       twitter_id = excluded.twitter_id,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       role = excluded.role,
       updated_at = excluded.updated_at`,
    [
      userId,
      twitterId,
      handle,
      displayName || handle,
      avatarUrl,
      role,
      existing?.has_paid ?? 0,
      existing?.suspicion_score ?? 0,
      existing?.created_at ?? now,
      now,
    ]
  );

  await recordPlayerEvent(
    userId,
    existing ? "session_created" : "player_registered",
    existing ? "Session restored" : "Player registered",
    existing
      ? `Signed back into the season shell as @${handle} through X OAuth.`
      : `Created a new season identity as @${handle} through X OAuth.`,
    "login",
    null
  );

  return {
    id: userId,
    handle,
    role,
  };
}

export function isAuthConfigured() {
  return Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_TWITTER_ID &&
      process.env.AUTH_TWITTER_SECRET
  );
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  debug: process.env.AUTH_DEBUG === "1",
  session: {
    strategy: "jwt",
  },
  providers: isAuthConfigured()
    ? [
        TwitterProvider({
          clientId: process.env.AUTH_TWITTER_ID!,
          clientSecret: process.env.AUTH_TWITTER_SECRET!,
          version: "2.0",
          authorization: {
            url: "https://x.com/i/oauth2/authorize",
            params: {
              scope: "tweet.read users.read",
            },
          },
          profile(profile) {
            const source = (profile as OAuthProfile).data ?? (profile as OAuthProfile);
            const twitterId = String(source.id || "");
            const rawHandle = String(source.username || "");
            return {
              id: twitterId,
              name: String(source.name || source.username || ""),
              email: null,
              image: source.profile_image_url || null,
              handle: normalizeHandle(rawHandle || (twitterId ? `x-${twitterId.slice(-8).toLowerCase()}` : "")),
            };
          },
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "twitter" && profile) {
        const synced = await upsertOAuthUser(profile as OAuthProfile);
        token.obliqId = synced.id;
        token.handle = synced.handle;
        token.role = synced.role;
      } else if ((user as { handle?: string } | undefined)?.handle) {
        token.handle = (user as { handle?: string }).handle;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string; handle?: string; role?: string }).id = String(token.obliqId || "");
        (session.user as { id?: string; handle?: string; role?: string }).handle = String(token.handle || "");
        (session.user as { id?: string; handle?: string; role?: string }).role = String(token.role || "player");
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      try {
        const target = new URL(url);
        if (target.origin === baseUrl) {
          return url;
        }
      } catch {}
      return `${baseUrl}/archon`;
    },
  },
  logger: {
    error(code, metadata) {
      console.error("[auth][error]", code, metadata);
    },
    warn(code) {
      console.warn("[auth][warn]", code);
    },
    debug(code, metadata) {
      if (process.env.AUTH_DEBUG === "1") {
        console.debug("[auth][debug]", code, metadata);
      }
    },
  },
};

export async function getCurrentUser() {
  await ensureInitialized();

  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; handle?: string } | undefined;
  if (!sessionUser?.id) {
    return null;
  }

  return queryFirst<UserRecord>(
    `SELECT id, handle, display_name, avatar_url, role, has_paid, suspicion_score, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [sessionUser.id]
  );
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  return user;
}
