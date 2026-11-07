/**
 * Per-agent models: every worker (orchestrator included) has a real model picker,
 * and picking one for the orchestrator changes what plans the next run.
 *
 * Run: node scripts/agent-model-check.mjs
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-models-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-models-ws-'))
writeFileSync(join(workspace, 'index.html'), '<!doctype html><title>m</title><h1>m</h1>')

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  if (ok) pass += 1
  else fail += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, errors } = app
await sleep(1800)

const project = await evaluate(`window.ventriee.createProject({
  name: 'Model Check', path: ${JSON.stringify(workspace)}, description: 'Per-agent models.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(2500)

// Open Settings, Workers tab.
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('settings'))?.click()`)
await sleep(900)
await evaluate(`[...document.querySelectorAll('.tab, button')].find((b) => b.textContent.trim() === 'Workers')?.click()`)
await sleep(900)

const agents = await evaluate(`window.ventriee.snapshot().then((s) => s.agents)`)

// The Workers tab lists every worker and edits one at a time, so each row must open
// that worker's own form with its own stored model.
const rows = await evaluate(`[...document.querySelectorAll('.agent-pick-name')].map((n) => n.textContent.trim())`)
check('every worker is listed', rows.length >= agents.length, `${rows.length} rows for ${agents.length} workers`)

const seen = []
for (const name of rows) {
  await evaluate(`[...document.querySelectorAll('.agent-pick')].find((b) => b.querySelector('.agent-pick-name')?.textContent.trim() === ${JSON.stringify(name)})?.click()`)
  await sleep(220)
  seen.push(await evaluate(`document.querySelector('.mp-trigger')?.textContent.trim() ?? 'no picker'`))
}
check('each worker opens with a model picker', seen.every((v) => v !== 'no picker'), `${seen.filter((v) => v !== 'no picker').length}/${seen.length}`)

const orch = agents.find((a) => a.role === 'orchestrator')
const kai = agents.find((a) => a.role === 'frontend')

// Choose a model that really resolves, straight from discovered options.
const options = await evaluate(`window.ventriee.modelsDiscover(null)`)
const usable = options.filter((m) => m.configured && m.provider !== 'cli-opencode')
const pick = usable.find((m) => m.provider === 'api-ollama') ?? usable[0]
check('a real model option exists to choose', Boolean(pick), pick ? `${pick.provider} ${pick.model}` : 'none')

await evaluate(`window.ventriee.updateAgent(${JSON.stringify(orch.id)}, { engine: ${JSON.stringify(pick.provider)}, model: ${JSON.stringify(pick.model)} })`)
await evaluate(`window.ventriee.updateAgent(${JSON.stringify(kai.id)}, { engine: ${JSON.stringify(pick.provider)}, model: ${JSON.stringify(pick.model)} })`)
await sleep(800)

const after = await evaluate(`window.ventriee.snapshot().then((s) => s.agents)`)
const orchNow = after.find((a) => a.id === orch.id)
const kaiNow = after.find((a) => a.id === kai.id)
check('orchestrator model is stored', orchNow.model === pick.model, `${orchNow.engine} ${orchNow.model}`)
check('worker model is stored', kaiNow.model === pick.model, `${kaiNow.engine} ${kaiNow.model}`)

// The settings drawer must show that choice, not a stale draft. The loop above left
// the last worker selected, so open Kai's form before reading the picker.
await sleep(600)
await evaluate(`[...document.querySelectorAll('.agent-pick')].find((b) => b.querySelector('.agent-pick-name')?.textContent.trim() === ${JSON.stringify(kai.name)})?.click()`)
await sleep(700)
const shown = await evaluate(`[...document.querySelectorAll('.mp-trigger')].map((n) => n.textContent.trim())`)
check('the picker UI shows the chosen model', shown.includes(pick.model.split('/').pop()), JSON.stringify(shown))

check('no renderer errors', errors.length === 0, errors[0] ?? '')

console.log(`\n${fail === 0 ? 'all checks passed' : `${fail} check(s) failed`} (${pass}/${pass + fail})`)
app.ws.close()
killApp(child)
await sleep(600)
process.exit(fail === 0 ? 0 : 1)
