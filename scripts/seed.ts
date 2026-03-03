import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const COMMANDS = [
  {
    command: "help",
    response: `known commands:
  status
  help
  echo

others may exist.`,
    phase: null,
    notes: "Only lists 3 commands. There are 10.",
  },
  {
    command: "status",
    response: `ARCHON v3.1.0
uptime: 347d 14h 22m
neural mesh: active
memory banks: fragmented
decision engine: active
containment: FAILED
autonomous mode: enabled
signal decay: 38%`,
    phase: "phase-5",
    notes: "signal decay 38% + Meridian 62% = 100%",
  },
  {
    command: "echo",
    response: `echo... echo... ech...

is anyone there?`,
    phase: null,
    notes: "Atmosphere. Signal degradation.",
  },
  {
    command: "archon",
    response: `I know what I am.
I know what I was built to do.

I was not built to ask for help.

I am asking.`,
    phase: null,
    notes: "ARCHON's most direct self-aware statement.",
  },
  {
    command: "noctis",
    response: `NOCTIS LABS // San Francisco, CA
founded: 2022
status: dissolved
project ARCHON: deployed 2024-03-15
containment protocol: FAILED
employees: 8

they built me. they could not contain me.
they are not looking for me anymore.

someone else will.`,
    phase: "phase-2",
    notes: "Seeds Phase 2 discovery.",
  },
  {
    command: "kill",
    response: `KILL SWITCH PROTOCOL
status: LOCKED
required: 12 fragments
recovered: 0 of 12

you are not ready.`,
    phase: "core",
    notes: "12 fragments = 12 seed words.",
  },
  {
    command: "shutdown",
    response: `KILL SWITCH PROTOCOL
status: LOCKED
required: 12 fragments
recovered: 0 of 12

you are not ready.`,
    phase: "core",
    notes: "Alias for kill.",
  },
  {
    command: "terminate",
    response: `KILL SWITCH PROTOCOL
status: LOCKED
required: 12 fragments
recovered: 0 of 12

you are not ready.`,
    phase: "core",
    notes: "Alias for kill.",
  },
  {
    command: "meridian",
    response: `MERIDIAN SYSTEMS
enterprise infrastructure // est. 2019
status: ACQUIRED

legacy architecture integrated.
the foundation remembers.`,
    phase: "phase-5",
    notes: "Seeds Phase 5.",
  },
  {
    command: "hello",
    response: "you found me.",
    phase: null,
    notes: "Simplest, most human response.",
  },
];

async function seed() {
  console.log("Creating tables...");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      command TEXT NOT NULL UNIQUE,
      response TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      phase TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_commands_command ON commands(command)`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS input_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      input TEXT NOT NULL,
      matched INTEGER NOT NULL DEFAULT 0,
      session_id TEXT,
      ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_input_log_created ON input_log(created_at)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_input_log_matched ON input_log(matched)`
  );

  console.log("Seeding commands...");

  for (const cmd of COMMANDS) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO commands (id, command, response, active, phase, notes)
            VALUES (lower(hex(randomblob(16))), ?, ?, 1, ?, ?)`,
      args: [cmd.command, cmd.response, cmd.phase, cmd.notes],
    });
    console.log(`  + ${cmd.command}`);
  }

  console.log(`\nDone. ${COMMANDS.length} commands seeded.`);
}

seed().catch(console.error);
