import { createClient, type InStatement } from "@libsql/client/web";

export type SqlValue = string | number | null;

const workerFetch =
  (globalThis as typeof globalThis & { internalFetch?: typeof fetch }).internalFetch ?? fetch;

const runtimeFetch: typeof fetch = async (input, init) => {
  if (typeof input === "string" || input instanceof URL) {
    return workerFetch(input, init);
  }

  const headers =
    typeof input.headers?.entries === "function" ? Object.fromEntries(input.headers.entries()) : undefined;

  return workerFetch(input.url, {
    method: input.method,
    headers,
    body: input.body,
    redirect: input.redirect,
    signal: input.signal,
    ...init,
  });
};

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
  fetch: runtimeFetch,
});

export async function execute(sql: string, args: SqlValue[] = []) {
  return db.execute({ sql, args });
}

export async function queryRows<T>(
  sql: string,
  args: SqlValue[] = []
): Promise<T[]> {
  const result = await execute(sql, args);
  return result.rows as unknown as T[];
}

export async function queryFirst<T>(
  sql: string,
  args: SqlValue[] = []
): Promise<T | null> {
  const rows = await queryRows<T>(sql, args);
  return rows[0] ?? null;
}

export async function batch(statements: InStatement[]) {
  return db.batch(statements, "write");
}
