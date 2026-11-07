/**
 * Proves the fence fix through the real app: an HTTP-engine worker that wraps its
 * files in ``` fences must land compilable source on disk, which is what a reviewer
 * rejected before the fix.
 *
 * Run: node scripts/fence-fix-check.mjs
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-fence-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-fence-ws-'))
const MODEL = process.argv[2] ?? 'qwen2.5-coder:3b'

const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate } = app
await sleep(1800)

const project = await evaluate(`window.ventriee.createProject({
  name: 'Fence Check',
  path: ${JSON.stringify(workspace)},
  description: 'Fence unwrapping verification.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(2000)

const snap = await evaluate(`window.ventriee.snapshot()`)
const kai = snap.agents.find((a) => a.role === 'frontend')
await evaluate(`window.ventriee.updateAgent(${JSON.stringify(kai.id)}, {
  engine: 'api-ollama', model: ${JSON.stringify(MODEL)}, endpoint: 'http://127.0.0.1:11434/v1'
})`)

await evaluate(`window.ventriee.instructAgent(${JSON.stringify(kai.id)}, ${JSON.stringify(
  'Create exactly two files. index.html: a page with an <h1>Usage dashboard</h1> and a link to app.css. app.css: body margin 0, dark background. Emit them as === FILE: path === blocks and nothing else.'
)})`)

const file = join(workspace, 'index.html')
let landed = false
for (let i = 0; i < 100; i += 1) {
  await sleep(3000)
  if (existsSync(file)) { landed = true; break }
}
const html = landed ? readFileSync(file, 'utf8') : ''
const css = existsSync(join(workspace, 'app.css')) ? readFileSync(join(workspace, 'app.css'), 'utf8') : ''

console.log('index.html written:', landed)
console.log('first line:', JSON.stringify(html.split('\n')[0]))
console.log('app.css written:', Boolean(css), '| has fence:', css.includes('```'))
console.log('index.html has fence:', html.includes('```'))
console.log('took:', landed ? 'landed' : 'timed out')

app.ws.close()
killApp(child)
await sleep(700)
const pass = landed && !html.includes('```') && !css.includes('```')
console.log(pass ? '\nfence fix verified' : '\nFAILED')
process.exit(pass ? 0 : 1)
