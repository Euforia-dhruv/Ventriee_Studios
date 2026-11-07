/**
 * Concurrency check: two real CLI sessions must run at the same time.
 * Instructs two different workers directly and samples agent status while both
 * are in flight. This isolates the scheduler from the planner's dependency
 * chain, which is what made the acceptance run report a peak of one.
 *
 * Run: node scripts/concurrency-check.mjs
 */
import { mkdtempSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-conc-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-conc-ws-'))

const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, errors } = app
await sleep(1800)

const project = await evaluate(`window.ventriee.createProject({
  name: 'Concurrency',
  path: ${JSON.stringify(workspace)},
  description: 'Concurrency probe.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(2500)

const snap = await evaluate(`window.ventriee.snapshot()`)
const pick = (role) => snap.agents.find((a) => a.role === role)
const a = pick('frontend')
const b = pick('backend')
if (!a || !b) {
  console.log('missing workers')
  process.exit(1)
}

await evaluate(`window.ventriee.instructAgent(${JSON.stringify(a.id)}, 'Write the single file one.txt in the workspace containing the word alpha. Nothing else.')`)
await evaluate(`window.ventriee.instructAgent(${JSON.stringify(b.id)}, 'Write the single file two.txt in the workspace containing the word beta. Nothing else.')`)

let peak = 0
let bothAtOnce = false
for (let i = 0; i < 150; i += 1) {
  await sleep(1500)
  const s = await evaluate(`window.ventriee.snapshot()`)
  const working = s.agents.filter((x) => x.status === 'working').length
  peak = Math.max(peak, working)
  if (working >= 2) bothAtOnce = true
  const running = s.sessions.filter((x) => x.status === 'running').length
  if (running >= 2) bothAtOnce = true
  if (existsSync(join(workspace, 'one.txt')) && existsSync(join(workspace, 'two.txt'))) break
  if (!s.running && working === 0) break
}

const files = existsSync(workspace) ? readdirSync(workspace) : []
console.log('peak simultaneous working workers:', peak)
console.log('both sessions live at the same time:', bothAtOnce)
console.log('files:', files.join(', ') || '(none)')
console.log('console errors:', errors.length ? errors.slice(0, 3) : 'none')

const ok = bothAtOnce && files.includes('one.txt') && files.includes('two.txt') && !errors.length
console.log(ok ? 'CONCURRENCY CHECK PASSED' : 'CONCURRENCY CHECK FAILED')

app.ws.close()
killApp(child)
await sleep(800)
process.exit(ok ? 0 : 1)
