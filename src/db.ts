import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface LogRow {
  id: number;
  ts: string;
  server_name: string;
  method: string | null;
  tool_name: string | null;
  status: number;
  latency_ms: number;
  request_body: string | null;
  response_body: string | null;
  error: string | null;
}

export interface LogInsert {
  server_name: string;
  method: string | null;
  tool_name: string | null;
  status: number;
  latency_ms: number;
  request_body: string | null;
  response_body: string | null;
  error: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  server_name TEXT NOT NULL,
  method TEXT,
  tool_name TEXT,
  status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  request_body TEXT,
  response_body TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_calls_ts ON calls(ts DESC);
CREATE INDEX IF NOT EXISTS idx_calls_server ON calls(server_name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_calls_tool ON calls(tool_name) WHERE tool_name IS NOT NULL;
`;

export function openDb(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA);
  return db;
}

export function insertLog(db: Database.Database, row: LogInsert): void {
  db.prepare(
    `INSERT INTO calls
     (server_name, method, tool_name, status, latency_ms, request_body, response_body, error)
     VALUES (@server_name, @method, @tool_name, @status, @latency_ms, @request_body, @response_body, @error)`,
  ).run(row);
}

export function recentLogs(
  db: Database.Database,
  opts: { limit?: number; server?: string } = {},
): LogRow[] {
  const limit = Math.min(opts.limit ?? 200, 1000);
  if (opts.server) {
    return db
      .prepare(
        `SELECT * FROM calls WHERE server_name = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(opts.server, limit) as LogRow[];
  }
  return db
    .prepare(`SELECT * FROM calls ORDER BY id DESC LIMIT ?`)
    .all(limit) as LogRow[];
}
