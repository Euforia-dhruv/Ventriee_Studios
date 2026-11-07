import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { MemoryService } from '../src/main/memory'
import { Credentials } from '../src/main/credentials'
import { Orchestrator } from '../src/main/orchestrator'
import type { Task } from '../src/shared/types'

/**
 * The evidence check must attribute only files inside the worker's claimed scope,
 * so a concurrent writer's changes cannot pass a task that wrote nothing.
 */
function makeTask(role: string): Task {
  return {
    id: 'tsk_1',
    projectId: 'prj_1',
    parentId: null,
    title: 't',
    description: '',
    acceptance: '',
    role,
    agentId: 'agt_1',
    status: 'running',
    dependsOn: [],
    output: '',
    review: '',
    attempts: 0,
    phase: 'build',
    engine: null,
    model: null,
    endpoint: null,
    routedBy: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

function orchestrator(): Orchestrator {
  const userData = mkdtempSync(join(tmpdir(), 'ventriee-evidence-'))
  const store = new Store(join(userData, 'ventriee.db'))
  return new Orchestrator({
    store,
    memory: new MemoryService(store, userData),
    creds: new Credentials(store.db),
    emit: new EventEmitter(),
    notify: () => {},
    isProjectOpen: () => false,
    models: () => [],
    providerConfigs: () => []
  })
}

const check = (o: Orchestrator, task: Task, beforeFiles: Record<string, number>, afterFiles: Record<string, number>, output: string) =>
  (o as unknown as {
    checkEvidence: (
      task: Task,
      before: { files: Map<string, number>; git: string },
      after: { files: Map<string, number>; git: string },
      output: string
    ) => { passed: boolean; changed: string[]; removed: string[] }
  }).checkEvidence(
    task,
    { files: new Map(Object.entries(beforeFiles)), git: '' },
    { files: new Map(Object.entries(afterFiles)), git: '' },
    output
  )

describe('evidence scoping', () => {
  it('counts only files inside the frontend scope', () => {
    const o = orchestrator()
    const r = check(o, makeTask('frontend'), {}, { 'src/app.ts': 1, 'server/api.ts': 1 }, 'built the app and verified it. summary summary summary summary summary')
    expect(r.passed).toBe(true)
    expect(r.changed).toEqual(['src/app.ts'])
  })

  it('fails a frontend task whose only change is in another scope', () => {
    const o = orchestrator()
    const r = check(o, makeTask('frontend'), {}, { 'server/api.ts': 1 }, 'typed for an hour with nothing to show. summary summary summary summary')
    expect(r.passed).toBe(false)
    expect(r.changed).toEqual([])
  })

  it('counts root-level shared files for any writer', () => {
    const o = orchestrator()
    const r = check(o, makeTask('frontend'), {}, { 'package.json': 2 }, 'added deps to the manifest and resolved them. summary summary summary summary')
    expect(r.passed).toBe(true)
    expect(r.changed).toEqual(['package.json'])
  })

  it('fixer with star scope counts every change', () => {
    const o = orchestrator()
    const r = check(o, makeTask('fixer'), {}, { 'server/api.ts': 1, 'src/app.ts': 2 }, 'fixed both files and reran the suite. summary summary summary summary summary')
    expect(r.passed).toBe(true)
    expect(r.changed.sort()).toEqual(['server/api.ts', 'src/app.ts'])
  })

  it('does not scope analysis roles', () => {
    const o = orchestrator()
    const r = check(o, makeTask('researcher'), {}, { 'docs/notes.md': 1, 'server/api.ts': 2 }, 'findings compiled and delivered. summary summary summary summary summary')
    expect(r.passed).toBe(true)
    expect(r.changed.length).toBe(2)
  })
})
