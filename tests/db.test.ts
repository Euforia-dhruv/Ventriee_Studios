import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { Db } from '../src/main/db'

const profile = () => join(mkdtempSync(join(tmpdir(), 'ventriee-db-')), 'ventriee.db')

describe('schema migrations', () => {
  it('stamps a fresh database at the current version', () => {
    const db = new Db(profile())
    expect(db.schemaVersion).toBeGreaterThan(0)
    expect(db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")).toHaveLength(1)
    db.close()
  })

  it('adopts a profile made before versioning without losing rows', () => {
    const file = profile()
    // A pre-migration profile has tables but user_version 0, the state on disk
    // for every owner who ran an earlier build.
    const old = new DatabaseSync(file)
    old.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, projectId TEXT, title TEXT);
              CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT);
              INSERT INTO tasks(id, projectId, title) VALUES('t1', 'p1', 'kept');`)
    old.close()

    const db = new Db(file)
    expect(db.schemaVersion).toBeGreaterThan(0)
    expect(db.get<{ title: string }>('SELECT title FROM tasks WHERE id = ?', 't1')?.title).toBe('kept')
    expect(db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobs'")).toHaveLength(1)
    db.close()
  })

  it('is idempotent: reopening runs no migration twice', () => {
    const file = profile()
    const first = new Db(file)
    const version = first.schemaVersion
    first.close()
    const second = new Db(file)
    expect(second.schemaVersion).toBe(version)
    second.close()
  })
})
