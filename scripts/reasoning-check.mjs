/**
 * Reasoning effort: set it on a worker, confirm it persists across a restart and
 * shows in the inspector. Run: node scripts/reasoning-check.mjs
 */
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-reason-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-reason-ws-'))
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })

let child = launchApp({ port: PORT, userData })
let app = await connect(PORT)
await sleep(1800)

const project = await app.evaluate(`window.ventriee.createProject({
  name: 'Reasoning Check', path: ${JSON.stringify(workspace)}, description: 'Reasoning effort.'
})`)
await app.evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(2000)

const agents = await app.evaluate(`window.ventriee.snapshot().then((s) => s.agents)`)
const kai = agents.find((a) => a.role === 'frontend')
console.log('default reasoning:', kai.reasoning)

await app.evaluate(`window.ventriee.updateAgent(${JSON.stringify(kai.id)}, { reasoning: 'high' })`)
await sleep(800)
app.ws.close()
killApp(child)
await sleep(1500)

// Same profile, fresh process: the level must come back from the database.
child = launchApp({ port: PORT, userData })
app = await connect(PORT)
await sleep(2500)
const after = await app.evaluate(`window.ventriee.snapshot().then((s) => s.agents.find((a) => a.id === ${JSON.stringify(kai.id)}))`)
console.log('after restart:', after.reasoning)

// The app reopens on the Plan screen, so reach the Office floor before the roster.
await app.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Office')?.click()`)
await sleep(1200)
await app.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'List')?.click()`)
await sleep(700)
await app.evaluate(`[...document.querySelectorAll('.roster-row, [data-agent]')].find((r) => /Kai/.test(r.textContent ?? ''))?.click()`)
await sleep(900)
await app.evaluate(`[...document.querySelectorAll('.drawer-tab')].find((t) => /config/i.test(t.textContent ?? ''))?.click()`)
await sleep(600)
const shown = await app.evaluate(`(() => {
  const row = [...document.querySelectorAll('.kv')].find((n) => n.querySelector('dt')?.textContent?.trim() === 'Reasoning effort')
  return row ? row.querySelector('dd')?.textContent?.trim() ?? 'no value' : 'row missing'
})()`)
console.log('inspector row:', shown)
console.log('console errors:', app.errors.length ? app.errors.slice(0, 3) : 'none')

app.ws.close()
killApp(child)
await sleep(700)
process.exit(after.reasoning === 'high' && shown === 'high' && !app.errors.length ? 0 : 1)
