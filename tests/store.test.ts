import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'

const store = () => new Store(join(mkdtempSync(join(tmpdir(), 'ventriee-store-')), 'ventriee.db'))

describe('session rows', () => {
  // The insert listed 17 columns with 16 placeholders, so every task failed before a
  // session existed and nothing was recorded. One real insert would have caught it.
  it('inserts a session with every column bound', () => {
    const s = store()
    s.insertSession({
      id: 'ses_1',
      projectId: 'prj_1',
      agentId: 'agt_1',
      taskId: 'tsk_1',
      engine: 'api-ollama',
      model: 'llama3.2:1b',
      cwd: process.cwd(),
      reasoning: 'high',
      status: 'running',
      exitCode: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      externalId: null,
      command: '',
      startedAt: Date.now(),
      endedAt: null
    })

    const row = s.db.get<Record<string, unknown>>('SELECT * FROM sessions WHERE id = ?', 'ses_1')
    expect(row?.reasoning).toBe('high')
    expect(row?.model).toBe('llama3.2:1b')
    s.db.close()
  })
})
