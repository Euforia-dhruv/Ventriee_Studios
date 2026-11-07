import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { MemoryService } from '../src/main/memory'
import { Credentials } from '../src/main/credentials'
import { Orchestrator } from '../src/main/orchestrator'
import type { Agent, Project, Task } from '../src/shared/types'

/**
 * Run #18 failed a designer task that hit its 16000-token cap mid-deliverable, so
 * a truncated reply now gets one retry with a bigger budget.
 *
 * Run #19 then showed why that alone was not enough: Deploy reported no
 * finish_reason at all, so a half-written tsconfig.json was accepted as complete
 * and broke the frontend's toolchain. The second case below is that exact reply.
 */
const chunk = (delta: object, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`

const usage = (outTok: number) =>
  `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: outTok } })}\n\n`

const truncating = (body: string) => `${chunk({ content: body }, 'length')}data: [DONE]\n\n`
const complete = (body: string) => `${chunk({ content: body }, 'stop')}data: [DONE]\n\n`

let open: (() => Promise<void>) | null = null
afterEach(async () => {
  if (open) await open()
  open = null
})

/** One frontend task through the real orchestrator, against a scripted endpoint. */
async function runFrontend(reply: (attempt: number) => string) {
  const bodies: Array<{ max_tokens?: number }> = []
  const server: Server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      bodies.push(JSON.parse(raw))
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(reply(bodies.length))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  open = () => new Promise<void>((resolve) => server.close(() => resolve()))

  const userData = mkdtempSync(join(tmpdir(), 'ventriee-retry-'))
  const workspace = mkdtempSync(join(tmpdir(), 'ventriee-work-'))
  const store = new Store(join(userData, 'ventriee.db'))
  const project: Project = store.createProject({ name: 'p', path: workspace, description: '' })

  const agent: Agent = {
    id: 'agt_1',
    projectId: project.id,
    role: 'frontend',
    name: 'Kai',
    title: 'Frontend Engineer',
    engine: 'api-openai',
    model: 'test-model',
    endpoint: `http://127.0.0.1:${port}/v1`,
    instructions: 'build',
    autonomy: 'scoped',
    reasoning: 'none',
    skills: [],
    concurrency: 1,
    budgetUsd: 0,
    color: '#fff',
    desk: 0,
    enabled: true,
    status: 'idle',
    currentTaskId: null,
    lastError: null,
    createdAt: Date.now()
  }
  store.insertAgent(agent)

  const task: Task = {
    id: 'tsk_1',
    projectId: project.id,
    parentId: null,
    title: 'Style the page',
    description: 'Write styles.css',
    acceptance: 'styles.css exists',
    role: 'frontend',
    agentId: agent.id,
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
  store.insertTask(task)

  const orchestrator = new Orchestrator({
    store,
    memory: new MemoryService(store, userData),
    creds: new Credentials(store.db),
    emit: new EventEmitter(),
    notify: () => {},
    isProjectOpen: () => false,
    models: () => [],
    providerConfigs: () => []
  })

  // Private by design: the queue adds polling and claims that this test does not
  // need. One task through the same code path is enough.
  await (
    orchestrator as unknown as {
      runTask: (p: Project, t: Task, a: Agent, context: string) => Promise<void>
    }
  ).runTask(project, task, agent, '')

  return { bodies, store, task, workspace, project }
}

describe('truncated replies', () => {
  it('continues the answer instead of repeating the prompt', async () => {
    const { bodies, store, task, project, workspace } = await runFrontend((attempt) =>
      attempt === 1
        ? truncating('=== FILE: styles.css ===\n:root { color: red')
        : complete('; }\n=== END FILE ===\n')
    )
    expect(bodies.length).toBe(2)
    expect(bodies[0].max_tokens).toBe(16000)
    expect(bodies[1].max_tokens).toBe(32000)
    // The second prompt must carry the unfinished text, or the model just writes
    // the same answer again and gets cut off at the same place (run #20).
    expect(bodies[1].messages.at(-1).content).toContain('Continue the same answer')
    expect(bodies[1].messages.at(-1).content).toContain(':root { color: red')
    expect(store.task(task.id)?.status).toBe('done')
    expect(store.sessions(project.id).length).toBe(2)
    expect(readFileSync(join(workspace, 'styles.css'), 'utf8')).toBe(':root { color: red; }\n')
  })

  it('treats a reply that spent its whole budget as cut off, even with no finish_reason', async () => {
    // Deploy's real stream: content, then a usage-only chunk, never a finish_reason.
    // The previous code read that as a complete answer and wrote half a tsconfig.
    const { bodies, store, task, workspace } = await runFrontend((attempt) =>
      attempt === 1
        ? chunk({ content: '=== FILE: tsconfig.json ===\n{\n  "compilerOptions": {\n    "target": "ES2020",\n' }) +
          usage(16000) +
          'data: [DONE]\n\n'
        : complete('=== FILE: tsconfig.json ===\n{ "compilerOptions": {} }\n=== END FILE ===\n')
    )
    expect(bodies.length).toBe(2)
    expect(bodies[0].max_tokens).toBe(16000)
    expect(bodies[1].max_tokens).toBe(32000)
    // The half-written file must never reach the workspace, and the restart must not
    // leave a second FILE header buried in the body.
    expect(readFileSync(join(workspace, 'tsconfig.json'), 'utf8')).toBe('{ "compilerOptions": {} }\n')
    expect(store.task(task.id)?.status).toBe('done')
  })

  it('keeps files already finished and resumes the open one where it stopped', async () => {
    const { store, task, workspace } = await runFrontend((attempt) => {
      if (attempt === 1) {
        return truncating('=== FILE: a.css ===\nbody { margin: 0 }\n=== END FILE ===\n\n=== FILE: b.css ===\n.x {\n')
      }
      // The contract is "resume at the exact point you stopped", so the reply carries
      // only the rest of b.css, with no header and no repeated text.
      return complete('  color: red;\n}\n=== END FILE ===\n')
    })
    expect(store.task(task.id)?.status).toBe('done')
    // The finished file survives, and the open file is closed by the new part.
    expect(readFileSync(join(workspace, 'a.css'), 'utf8')).toBe('body { margin: 0 }\n')
    // The resume lands mid-line, and replies are trimmed, so that line's indentation
    // is lost: `.x {color:` not `.x {\n  color:`. Valid CSS, and the documented limit
    // of resuming rather than re-sending (see the shortcut note on continuePrompt).
    expect(readFileSync(join(workspace, 'b.css'), 'utf8')).toBe('.x {color: red;\n}\n')
  })

  it('resumes without duplicating a tail the model echoed back', async () => {
    // Models often re-echo the "last words" they were shown. Appending that blindly
    // would put the echo in the middle of the file, so the overlap is dropped.
    const { store, task, workspace } = await runFrontend((attempt) =>
      attempt === 1
        ? truncating('=== FILE: x.css ===\n.hero { display: flex }')
        : complete('display: flex }\n.hero-b { color: red }\n=== END FILE ===\n')
    )
    expect(store.task(task.id)?.status).toBe('done')
    expect(readFileSync(join(workspace, 'x.css'), 'utf8')).toBe(
      '.hero { display: flex }\n.hero-b { color: red }\n'
    )
  })

  it('takes a restarted file whole when the model ignores the resume instruction', async () => {
    const { store, task, workspace } = await runFrontend((attempt) =>
      attempt === 1
        ? truncating('=== FILE: b.css ===\n.x {\n')
        : complete('=== FILE: b.css ===\n.x {\n  color: red;\n}\n=== END FILE ===\n')
    )
    expect(store.task(task.id)?.status).toBe('done')
    // Replace, not append: one header, no half-written copy left behind.
    expect(readFileSync(join(workspace, 'b.css'), 'utf8')).toBe('.x {\n  color: red;\n}\n')
  })

  it('gives up after the continuation limit, and writes nothing', async () => {
    const partial = '=== FILE: tsconfig.json ===\n{\n  "compilerOptions": {\n'
    const { bodies, store, task, workspace } = await runFrontend(() => truncating(partial))
    // One first attempt plus WORKER_CONTINUATIONS (2).
    expect(bodies.length).toBe(3)
    expect(store.task(task.id)?.status).toBe('failed')
    expect(store.task(task.id)?.review).toContain('32000')
    expect(existsSync(join(workspace, 'tsconfig.json'))).toBe(false)
  })
})
