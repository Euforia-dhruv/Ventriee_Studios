import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type Row = Record<string, unknown>

/**
 * Ordered schema migrations. `user_version` records how many have run, so a new
 * column is added to the end of this list instead of being silently skipped by
 * `CREATE TABLE IF NOT EXISTS`.
 *
 * Never edit or reorder an entry that has shipped: existing profiles have
 * already stamped it. Append a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL,
    description TEXT DEFAULT '', createdAt INTEGER, updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, role TEXT, name TEXT, title TEXT,
    engine TEXT, model TEXT, endpoint TEXT DEFAULT '', instructions TEXT DEFAULT '',
    autonomy TEXT DEFAULT 'scoped', concurrency INTEGER DEFAULT 1, budgetUsd REAL DEFAULT 5,
    color TEXT, desk INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, status TEXT DEFAULT 'idle',
    currentTaskId TEXT, lastError TEXT, createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, parentId TEXT, title TEXT, description TEXT,
    acceptance TEXT DEFAULT '', role TEXT, agentId TEXT, status TEXT DEFAULT 'todo',
    dependsOn TEXT DEFAULT '[]', output TEXT DEFAULT '', review TEXT DEFAULT '',
    attempts INTEGER DEFAULT 0, phase TEXT DEFAULT 'build', createdAt INTEGER, updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, projectId TEXT, taskId TEXT, sender TEXT, recipient TEXT, type TEXT,
    content TEXT, status TEXT DEFAULT 'unread', createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, projectId TEXT, agentId TEXT, taskId TEXT, type TEXT, message TEXT, createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, projectId TEXT, agentId TEXT, taskId TEXT, engine TEXT, model TEXT,
    cwd TEXT, status TEXT, exitCode INTEGER, inputTokens INTEGER DEFAULT 0, outputTokens INTEGER DEFAULT 0,
    costUsd REAL DEFAULT 0, externalId TEXT, command TEXT DEFAULT '', startedAt INTEGER, endedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY, scope TEXT, projectId TEXT, agentId TEXT, path TEXT, title TEXT,
    body TEXT, tags TEXT DEFAULT '[]', pinned INTEGER DEFAULT 0, confidence REAL DEFAULT 0.6,
    source TEXT DEFAULT '', evidence TEXT DEFAULT '', updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY, name TEXT, description TEXT, path TEXT, enabled INTEGER DEFAULT 1,
    version TEXT DEFAULT '1.0.0', uses INTEGER DEFAULT 0, successes INTEGER DEFAULT 0,
    source TEXT DEFAULT '', updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY, projectId TEXT, name TEXT, instruction TEXT,
    intervalMinutes INTEGER DEFAULT 60, enabled INTEGER DEFAULT 1,
    lastRunAt INTEGER, nextRunAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, projectId TEXT, instruction TEXT, status TEXT,
    planSource TEXT, createdAt INTEGER, updatedAt INTEGER, error TEXT
  );
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(projectId);
  CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(projectId);
  CREATE INDEX IF NOT EXISTS idx_events_project ON events(projectId);
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(projectId);
  CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(projectId);
  `,
  // Planning is a first-class record: conversations, their messages, every prompt
  // revision, configured providers and what was assigned to whom.
  `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, createdAt INTEGER, updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, conversationId TEXT NOT NULL,
    role TEXT, content TEXT, model TEXT DEFAULT '', status TEXT DEFAULT 'done', createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, conversationId TEXT NOT NULL,
    title TEXT DEFAULT '', body TEXT NOT NULL, version INTEGER DEFAULT 1,
    source TEXT DEFAULT 'generated', parentId TEXT, createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY, label TEXT, kind TEXT, engine TEXT, baseUrl TEXT DEFAULT '',
    models TEXT DEFAULT '[]', createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, promptId TEXT, jobId TEXT,
    mode TEXT, agents TEXT DEFAULT '[]', createdAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(projectId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(projectId, version);
  `,
  // Per-task routing override, so a task can run on a different model than its
  // worker's default without changing that default.
  `
  ALTER TABLE tasks ADD COLUMN engine TEXT;
  ALTER TABLE tasks ADD COLUMN model TEXT;
  ALTER TABLE tasks ADD COLUMN endpoint TEXT;
  ALTER TABLE tasks ADD COLUMN routedBy TEXT;
  `,
  // Reasoning effort and the exact config a session actually ran with.
  `
  ALTER TABLE agents ADD COLUMN reasoning TEXT NOT NULL DEFAULT 'auto';
  ALTER TABLE sessions ADD COLUMN reasoning TEXT;
  `,
  // Which skills a worker is offered. Empty falls back to its role template.
  `
  ALTER TABLE agents ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
  `
]

export class Db {
  private db: DatabaseSync

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate()
  }

  /** Exposed for the migration test; the app never needs to read it. */
  get schemaVersion(): number {
    const row = this.get<{ user_version: number }>('PRAGMA user_version')
    return Number(row?.user_version ?? 0)
  }

  /**
   * Each migration runs in its own transaction together with the version bump,
   * so an interrupted upgrade retries the same step instead of skipping it.
   * A profile created before versioning has the tables but version 0; every
   * statement above is IF NOT EXISTS, so re-running step 1 is safe.
   */
  private migrate() {
    const from = this.schemaVersion
    for (let version = from; version < MIGRATIONS.length; version += 1) {
      this.db.exec('BEGIN')
      try {
        this.db.exec(MIGRATIONS[version]!)
        this.db.exec(`PRAGMA user_version = ${version + 1}`)
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw new Error(`Database migration ${version + 1} failed: ${(error as Error).message}`)
      }
    }
  }

  get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined
  }

  all<T = Row>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[]
  }

  run(sql: string, ...params: unknown[]) {
    this.db.prepare(sql).run(...(params as never[]))
  }

  exec(sql: string) {
    this.db.exec(sql)
  }

  kvGet(key: string): string | null {
    const row = this.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)
    return row?.value ?? null
  }

  kvSet(key: string, value: string) {
    this.run('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }

  kvDelete(key: string) {
    this.run('DELETE FROM kv WHERE key = ?', key)
  }

  close() {
    this.db.close()
  }
}
