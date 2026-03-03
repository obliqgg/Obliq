const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

function getHttpUrl() {
  // Convert libsql:// to https://
  return TURSO_URL.replace("libsql://", "https://");
}

type TursoRow = Record<string, string | number | null>;

interface TursoResult {
  rows: TursoRow[];
}

export async function query(
  sql: string,
  args: (string | number | null)[] = []
): Promise<TursoResult> {
  const url = `${getHttpUrl()}/v2/pipeline`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql,
            args: args.map((a) => {
              if (a === null) return { type: "null", value: null };
              if (typeof a === "number")
                return { type: "integer", value: String(a) };
              return { type: "text", value: String(a) };
            }),
          },
        },
        { type: "close" },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Turso HTTP error: ${res.status}`);
  }

  const data = await res.json();
  const result = data.results?.[0]?.response?.result;

  if (!result) {
    return { rows: [] };
  }

  const cols = result.cols.map((c: { name: string }) => c.name);
  const rows = result.rows.map((row: { value: string | number | null }[]) => {
    const obj: TursoRow = {};
    row.forEach((cell: { value: string | number | null }, i: number) => {
      obj[cols[i]] = cell.value;
    });
    return obj;
  });

  return { rows };
}
