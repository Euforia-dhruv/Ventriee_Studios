/**
 * Live-floor check: a real worker session must drive the office.
 * Instructs one worker, waits for the real `working` status, screenshots the
 * seated/typing character, then verifies the responsive layout at 1024x700.
 *
 * Run: node scripts/office-live.mjs
 */
import { mkdtempSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-live-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-live-ws-'))
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })

const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, send, screenshot, errors } = app
await sleep(1800)

const project = await evaluate(`window.ventriee.createProject({
  name: 'Live floor',
  path: ${JSON.stringify(workspace)},
  description: 'Live floor verification.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(2500)

const snap = await evaluate(`window.ventriee.snapshot()`)
const frontend = snap.agents.find((a) => a.role === 'frontend')
await evaluate(`window.ventriee.instructAgent(${JSON.stringify(frontend.id)}, ${JSON.stringify(
  'Create a file named hello.txt in the workspace containing exactly the line ventriee-ok. Then say you are done.'
)})`)

let sawWorking = false
let liveShot = false
for (let i = 0; i < 60; i += 1) {
  await sleep(2000)
  const s = await evaluate(`window.ventriee.snapshot()`)
  const agent = s.agents.find((a) => a.id === frontend.id)
  if (agent.status === 'working') {
    sawWorking = true
    if (!liveShot) {
      await sleep(2500)
      await screenshot('office-working.png')
      liveShot = true
    }
  }
  if (existsSync(join(workspace, 'hello.txt')) && agent.status !== 'working') break
  if (!s.running && s.tasks.length && s.tasks.every((t) => ['done', 'failed'].includes(t.status))) break
}
console.log('worker went to working state:', sawWorking)
const files = existsSync(workspace) ? readdirSync(workspace) : []
console.log('workspace files:', files.join(', ') || '(none)')
console.log('hello.txt:', existsSync(join(workspace, 'hello.txt')))

// Responsive: narrow window must keep the office visible and the rail hidden.
await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 700, deviceScaleFactor: 1, mobile: false })
await sleep(2200)
const narrow = await evaluate(`({
  canvas: Boolean(document.querySelector('.office-stage canvas')),
  canvasWidth: document.querySelector('.office-stage canvas')?.getBoundingClientRect().width ?? 0,
  railVisible: getComputedStyle(document.querySelector('.rail')).display !== 'none',
  previewVisible: Boolean(document.querySelector('.preview'))
})`)
console.log('narrow layout:', JSON.stringify(narrow))
await screenshot('office-narrow.png')
await send('Emulation.clearDeviceMetricsOverride')

console.log('console errors:', errors.length ? errors.slice(0, 5) : 'none')

app.ws.close()
killApp(child)
await sleep(800)
process.exit(sawWorking && existsSync(join(workspace, 'hello.txt')) && narrow.canvas && !errors.length ? 0 : 1)
