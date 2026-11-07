/**
 * End-to-end workflow check: chat, create prompt, edit, enhance, compare, assign,
 * real execution in the office, per-agent model change, plus adding a provider.
 *
 * Uses a real local Ollama model, so it exercises real engines, not mocks.
 * Run: node scripts/workflow-check.mjs
 */
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, freePort, killApp, launchApp, sleep } from './lib/app.mjs'

const PORT = await freePort()
const OLLAMA = { engine: 'api-ollama', model: 'llama3.2:1b', endpoint: 'http://127.0.0.1:11434/v1' }
// The assignment stage needs models that can actually follow the deliverable contract.
// The 1-4B local models answered with prose (or burned their budget reasoning) and
// correctly failed the evidence gate, which proved the gate but not the pipeline.
const DEPLOY = {
  engine: 'api-deploy',
  endpoint: 'https://api-sf1-cdn.deploy.com/api/v1',
  first: 'deepseek-ai/deepseek-v4.1-flash-1017',
  second: 'zai-org/glm-5.3-flash'
}
const hasDeployKey = Boolean(process.env.DEPLOY_API_KEY)
// With a Deploy key, the assignment runs on models that follow the deliverable contract.
// Without one, it falls back to two local models that were probed to emit file blocks:
// llama3.2:1b/3b answer in prose and qwen3.5:4b never leaves its reasoning channel.
const KAI_MODEL = hasDeployKey ? DEPLOY.first : 'qwen2.5-coder:3b'
const IRIS_MODEL = hasDeployKey ? DEPLOY.second : 'qwen3:8b'
const KAI_ENGINE = hasDeployKey ? DEPLOY.engine : OLLAMA.engine
const IRIS_ENGINE = KAI_ENGINE
const KAI_ENDPOINT = hasDeployKey ? DEPLOY.endpoint : OLLAMA.endpoint
const IRIS_ENDPOINT = KAI_ENDPOINT
const userData = mkdtempSync(join(tmpdir(), 'ventriee-flow-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-flow-ws-'))
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

async function poll(evaluate, seconds, done, onTick) {
  let last = null
  for (let t = 0; t < seconds; t += 2) {
    await sleep(2000)
    try {
      last = await evaluate(`window.ventriee.snapshot()`)
    } catch (error) {
      // The app was restarted or its DevTools socket dropped mid-run. Reconnect
      // once and keep polling instead of dying without a summary.
      console.log(`  [poll] evaluate failed at t=${t + 2}s: ${error.message} — reconnecting`)
      try {
        const fresh = await app.reconnect()
        app.evaluate = fresh.evaluate
        app.send = fresh.send
        app.errors = fresh.errors
        evaluate = fresh.evaluate
        last = await evaluate(`window.ventriee.snapshot()`)
      } catch (reconnectError) {
        console.log(`  [poll] reconnect failed: ${reconnectError.message} — ending poll early`)
        return { snap: last, timedOut: true }
      }
    }
    if (onTick) onTick(last, t)
    if (done(last)) return { snap: last, timedOut: false }
  }
  return { snap: last, timedOut: true }
}

const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, screenshot, errors } = app
await sleep(1800)

// ---- stage 1: chat-first, planning only ----
const project = await evaluate(`window.ventriee.createProject({
  name: 'Flow check',
  path: ${JSON.stringify(workspace)},
  description: 'Conversational planning verification.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(1500)
await evaluate(`window.ventriee.saveSettings({
  plannerEngine: ${JSON.stringify(OLLAMA.engine)},
  plannerModel: ${JSON.stringify(OLLAMA.model)},
  plannerEndpoint: ${JSON.stringify(OLLAMA.endpoint)}
})`)
await sleep(1200)

const models = await evaluate(`window.ventriee.modelsDiscover(${JSON.stringify(project.id)})`)
check('models discovered from real providers', models.length > 0, `${models.length}: ${models.slice(0, 4).map((m) => m.model).join(', ')}`)
check('ollama models present and marked configured', models.some((m) => m.provider === 'api-ollama' && m.configured))

// The Plan workspace must be the default surface, not the office. Allow for the
// first snapshot to settle: the modal auto-open closes as soon as projects load.
await sleep(1000)
let composerReady = false
for (let t = 0; t < 10 && !composerReady; t++) {
  composerReady = await evaluate(`Boolean(document.querySelector('.chat-composer'))`)
  if (!composerReady) await sleep(500)
}
check('workspace opens on the chat stage', composerReady)
check('no task exists before any assignment', (await evaluate(`window.ventriee.snapshot().then((s) => s.tasks.length)`)) === 0)
await screenshot('flow-1-empty-chat.png')

// A real planning turn.
const chatStart = Date.now()
const turn = await evaluate(`window.ventriee.chatSend({
  projectId: ${JSON.stringify(project.id)},
  text: 'I want a small SaaS dashboard with auth, usage analytics and a billing page. Ask me what you need.',
  engine: ${JSON.stringify(OLLAMA.engine)},
  model: ${JSON.stringify(OLLAMA.model)},
  endpoint: ${JSON.stringify(OLLAMA.endpoint)}
})`)
console.log(`  chat turn took ${Math.round((Date.now() - chatStart) / 1000)}s`)
const afterChat = await poll(evaluate, 20, (s) => s.chat.some((m) => m.role === 'assistant' && m.status !== 'streaming'))
check('chat reply stored and finished', afterChat.snap.chat.some((m) => m.role === 'assistant' && m.status === 'done'))
check('reply has model recorded', Boolean(afterChat.snap.chat.find((m) => m.role === 'assistant')?.model))
check('chat did not start any task', afterChat.snap.tasks.length === 0)
check('chat did not start any session', afterChat.snap.sessions.length === 0)
// Guards the empty-reply bug (a stream parsed to ''). Length is not the signal: a small
// model can answer in one short sentence and still be a real answer.
check('assistant reply is non-empty', (afterChat.snap.chat.find((m) => m.role === 'assistant')?.content ?? '').trim().length > 0)
console.log(`  turn ids: owner=${turn.owner?.id} assistant=${turn.assistant?.id}`)
await screenshot('flow-2-chat.png')

// ---- stage 2: prompt generation ----
const generated = await evaluate(`window.ventriee.promptCreate({
  projectId: ${JSON.stringify(project.id)},
  engine: ${JSON.stringify(OLLAMA.engine)},
  model: ${JSON.stringify(OLLAMA.model)},
  endpoint: ${JSON.stringify(OLLAMA.endpoint)}
})`)
const REQUIRED = [
  'Objective', 'Requirements', 'Features', 'UI/UX Direction', 'Technical Architecture',
  'Technology Stack', 'Backend Requirements', 'Database Requirements', 'API Requirements',
  'Security Requirements', 'Implementation Instructions', 'Testing and Acceptance Criteria'
]
const sections = (generated.body.match(/^## /gm) ?? []).length
const missing = REQUIRED.filter((s) => !new RegExp(`^##\\s+${s}\\s*$`, 'm').test(generated.body))
check('prompt generated as a new revision', generated.version === 1 && generated.source === 'generated')
check('prompt has all 12 required sections', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${sections} headings`)
check('prompt is substantial', generated.body.length > 400, `${generated.body.length} chars`)

// ---- stage 3: edit, enhance, compare, restore ----
const edited = await evaluate(`window.ventriee.promptSave({
  projectId: ${JSON.stringify(project.id)},
  promptId: ${JSON.stringify(generated.id)},
  source: 'edited',
  body: ${JSON.stringify(generated.body + '\n\n## Owner notes\nShip behind a feature flag.')}
})`)
check('edit created a new revision, original untouched', edited.version === 2 && edited.parentId === generated.id)
const stillOriginal = await evaluate(`window.ventriee.snapshot().then((s) => s.prompts.find((p) => p.id === ${JSON.stringify(generated.id)}).body.includes('Owner notes'))`)
check('original revision text unchanged', stillOriginal === false)

const enhanced = await evaluate(`window.ventriee.promptEnhance({
  projectId: ${JSON.stringify(project.id)},
  promptId: ${JSON.stringify(edited.id)},
  engine: ${JSON.stringify(OLLAMA.engine)},
  model: ${JSON.stringify(OLLAMA.model)},
  endpoint: ${JSON.stringify(OLLAMA.endpoint)}
})`)
check('enhance produced a new revision', enhanced.version === 3 && enhanced.source === 'enhanced')
check('enhance kept the parent link', enhanced.parentId === edited.id)
check('enhance returned real text', enhanced.body.length > 200, `${enhanced.body.length} chars`)
check('three revisions are all retained', (await evaluate(`window.ventriee.snapshot().then((s) => s.prompts.length)`)) === 3)
await screenshot('flow-3-prompt.png')

// Compare in the UI: the panel must show both versions, and restore must be a new row.
await evaluate(`[...document.querySelectorAll('.ver')].find((b) => /compare/i.test(b.textContent))?.click()`)
let compareCols = 0
for (let t = 0; t < 10; t++) {
  compareCols = await evaluate(`document.querySelectorAll('.compare-col').length`)
  if (compareCols === 2) break
  await sleep(400)
}
check('compare renders two columns', compareCols === 2)
await screenshot('flow-4-compare.png')

const restored = await evaluate(`window.ventriee.promptSave({
  projectId: ${JSON.stringify(project.id)},
  promptId: ${JSON.stringify(enhanced.id)},
  source: 'restored',
  body: ${JSON.stringify(edited.body)}
})`)
check('restore is a new revision, nothing overwritten', restored.version === 4 && restored.body === edited.body)

// ---- stage 5: assign with per-agent models ----
const roster = await evaluate(`window.ventriee.snapshot().then((s) => s.agents.map((a) => ({ id: a.id, role: a.role, name: a.name })))`)
const iris = roster.find((a) => a.role === 'designer')
const kai = roster.find((a) => a.role === 'frontend')
check('roster has the workers the acceptance test names', Boolean(iris && kai), `${iris?.name}, ${kai?.name}`)

// Both Deploy models are thinking models: on a full brief they spend the whole
// output budget reasoning and answer with nothing. The studio retries once with
// thinking off (see runTask), which costs a wasted 150 s session per worker, so
// this check sets the level the retry would settle on. The retry itself has its
// own coverage in tests/reasoning.test.ts and was observed live in run #12.
await evaluate(`window.ventriee.updateAgent(${JSON.stringify(kai.id)}, { reasoning: 'none' })`)
await evaluate(`window.ventriee.updateAgent(${JSON.stringify(iris.id)}, { reasoning: 'none' })`)

const assigned = await evaluate(`window.ventriee.assignPrompt({
  projectId: ${JSON.stringify(project.id)},
  promptId: ${JSON.stringify(restored.id)},
  mode: 'manual',
  agents: [
    { agentId: ${JSON.stringify(kai.id)}, model: ${JSON.stringify(KAI_MODEL)}, providerId: null, engine: ${JSON.stringify(KAI_ENGINE)}, endpoint: ${JSON.stringify(KAI_ENDPOINT)} },
    { agentId: ${JSON.stringify(iris.id)}, model: ${JSON.stringify(IRIS_MODEL)}, providerId: null, engine: ${JSON.stringify(IRIS_ENGINE)}, endpoint: ${JSON.stringify(IRIS_ENDPOINT)} }
  ],
  note: 'Deliver the real files for your part of the prompt now. Never write placeholder, probe or sample files.'
})`)
check('assignment created a job', Boolean(assigned.jobId))
check('manual mode queued one task per worker', assigned.taskCount === 2, String(assigned.taskCount))

// The per-agent model must be persisted, not just displayed.
const afterAssign = await evaluate(`window.ventriee.snapshot()`)
const kaiNow = afterAssign.agents.find((a) => a.id === kai.id)
const irisNow = afterAssign.agents.find((a) => a.id === iris.id)
check('selected worker stores the chosen model', kaiNow.model === KAI_MODEL, kaiNow.model)
check('second worker stores a different model', irisNow.model === IRIS_MODEL, irisNow.model)
check('different models run simultaneously in config', kaiNow.model !== irisNow.model)

console.log('  waiting for real sessions to run...')
const ran = await poll(
  evaluate,
  40 * 60,
  (s) => s.tasks.length >= 2 && s.tasks.every((t) => ['done', 'failed', 'rework', 'blocked'].includes(t.status)) && !s.running,
  (s, t) => {
    const live = s.sessions.filter((x) => x.status === 'running').length
    process.stdout.write(`\r  t=${t + 2}s tasks=${s.tasks.length} live=${live} statuses=${s.tasks.map((x) => x.status).join(',')}   `)
  }
)
process.stdout.write('\n')
check('both assigned tasks completed', ran.snap.tasks.filter((t) => t.status === 'done').length === 2, ran.snap.tasks.map((t) => `${t.role}:${t.status}`).join(' '))
check('real sessions were recorded', ran.snap.sessions.length >= 1, `${ran.snap.sessions.length} sessions`)
const used = ran.snap.sessions.map((s) => `${s.engine} ${s.model}`)
check('sessions record the model actually used', used.some((m) => m.includes(KAI_MODEL)) && used.some((m) => m.includes(IRIS_MODEL)), used.join(' | '))
await screenshot('flow-5-after-run.png')

// Office stage shows their activity. Click the Office chip too: the floor keeps its
// own Office|List toggle, and a canvas only exists in the Office view.
await evaluate(`[...document.querySelectorAll('.ws-tab')].find((b) => /office/i.test(b.textContent))?.click()`)
await sleep(1200)
await evaluate(`[...document.querySelectorAll('.chip-toggle')].find((b) => /office/i.test(b.textContent))?.click()`)
// Pixi boots asynchronously (app.init, then tilesets), so poll the DOM through the
// page instead of a fixed sleep. poll() evaluates `window.ventriee.snapshot()`, so it
// cannot be used for a DOM probe.
let officeReady = false
for (let t = 0; t < 20 && !officeReady; t++) {
  await sleep(1000)
  officeReady = await evaluate(`Boolean(document.querySelector('.office-canvas canvas'))`)
}
check('office canvas renders after a real run', officeReady)
await screenshot('flow-6-office.png')

// The job row closes a beat after the last task finishes, and starting a second run
// before it does is refused by design ("A run is already active"). Wait for that gate.
const drained = await poll(evaluate, 120, (s) => !s.running, (s, t) => {
  if (t % 10 === 0) process.stdout.write(`\r  waiting for the job to close t=${t + 2}s   `)
})
process.stdout.write('\n')
check('job closed before the next assignment', !drained.timedOut)
if (drained.timedOut) {
  await evaluate(`window.ventriee.stopRun(${JSON.stringify(project.id)})`)
  await sleep(4000)
}

// ---- provider management ----
const before = (await evaluate(`window.ventriee.snapshot()`)).providerConfigs.length
const provider = await evaluate(`window.ventriee.addProvider({
  label: 'Local test provider',
  kind: 'openai',
  engine: 'api-vllm',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: '',
  models: ['llama3.2:1b']
})`)
check('custom provider saved', Boolean(provider?.id) && provider.label === 'Local test provider')
const probe = await evaluate(`window.ventriee.testProvider({
  id: ${JSON.stringify(provider.id)},
  engine: 'api-vllm',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'llama3.2:1b'
})`)
check('connection test reaches the real server', probe.ok, probe.detail)
const afterAdd = (await evaluate(`window.ventriee.snapshot()`)).providerConfigs
check('provider list grew by one', afterAdd.length === before + 1, `${before} -> ${afterAdd.length}`)

const custom = await evaluate(`window.ventriee.modelsDiscover(${JSON.stringify(project.id)})`)
check(
  'custom provider models appear in discovery',
  custom.some((m) => m.provider === provider.id || m.providerLabel === 'Local test provider'),
  `${custom.length} options`
)
// The added provider has to be usable, not just storable: run a real task through it.
const tess = roster.find((a) => a.role === 'monitoring')
const beforeCustom = (await evaluate(`window.ventriee.snapshot()`)).sessions.length
await evaluate(`window.ventriee.assignPrompt({
  projectId: ${JSON.stringify(project.id)},
  promptId: ${JSON.stringify(restored.id)},
  mode: 'manual',
  agents: [
    { agentId: ${JSON.stringify(tess.id)}, model: 'llama3.2:1b', providerId: ${JSON.stringify(provider.id)}, engine: 'api-vllm', endpoint: 'http://127.0.0.1:11434/v1' }
  ],
  note: 'Run entirely through the newly added provider.'
})`)
const viaProvider = await poll(
  evaluate,
  10 * 60,
  (s) => s.sessions.length > beforeCustom && s.sessions.every((x) => x.status !== 'running') && !s.running,
  (s, t) => process.stdout.write(`\r  provider run t=${t + 2}s sessions=${s.sessions.length}   `)
)
process.stdout.write('\n')
const providerSession = viaProvider.snap.sessions.find(
  (s) => s.engine === 'api-vllm' && s.model === 'llama3.2:1b'
)
check(
  'a real session ran on the newly added provider',
  Boolean(providerSession),
  providerSession
    ? `${providerSession.status}, ${providerSession.outputTokens} out tokens`
    : viaProvider.snap.sessions.map((s) => `${s.engine} ${s.model}`).join(' | ')
)

await evaluate(`window.ventriee.deleteProvider(${JSON.stringify(provider.id)})`)
check('provider removal works', (await evaluate(`window.ventriee.snapshot().then((s) => s.providerConfigs.length)`)) === before)

// ---- persistence ----
check('conversation survives in the snapshot', (await evaluate(`window.ventriee.snapshot().then((s) => s.chat.length)`)) >= 2)
// At least the four the script itself creates. An exact count would fail the
// moment anyone enhances a prompt by hand while the check is running.
check('prompt history survives', (await evaluate(`window.ventriee.snapshot().then((s) => s.prompts.length)`)) >= 4)
// Two assignments now: the roster run and the run through the added provider.
check('assignment history recorded', (await evaluate(`window.ventriee.snapshot().then((s) => s.assignments.length)`)) === 2)

console.log('')
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log(failed.map((f) => ` - ${f.name}${f.detail ? ` (${f.detail})` : ''}`).join('\n'))

app.ws.close()
killApp(child)
await sleep(800)
process.exit(failed.length ? 1 : 0)
