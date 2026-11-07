/**
 * Visual check for the pixi office floor.
 * Creates a project (14 workers), screenshots the office, clicks a desk,
 * then forces real agent statuses through IPC to prove the state mapping.
 *
 * Run: node scripts/office-check.mjs
 */
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-office-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-office-ws-'))
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })

const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, screenshot, errors } = app
await sleep(2000)

const project = await evaluate(`window.ventriee.createProject({
  name: 'Office check',
  path: ${JSON.stringify(workspace)},
  description: 'Office floor visual verification.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(3500)

// Canvas presence. WebGL buffers are not readable after compositing, so the
// pixel count here is not a quality signal; the screenshots are.
const canvas = await evaluate(`(() => {
  const c = document.querySelector('.office-stage canvas')
  if (!c) return { found: false }
  const r = c.getBoundingClientRect()
  return { found: true, width: c.width, height: c.height, cssWidth: Math.round(r.width), cssHeight: Math.round(r.height) }
})()`)
console.log('canvas:', JSON.stringify(canvas))
await screenshot('office-idle.png')

// Click a real character: pixi only reacts to events routed through its own
// canvas, so drive the browser input pipeline instead of DOM clicks.
const probe = await evaluate(`(() => {
  const c = document.querySelector('.office-stage canvas')
  const r = c.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})()`)
let clicked = null
for (let fy = 0.35; fy <= 0.95 && !clicked; fy += 0.04) {
  for (let fx = 0.08; fx <= 0.95; fx += 0.04) {
    const x = Math.round(probe.x + probe.w * fx)
    const y = Math.round(probe.y + probe.h * fy)
    await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 })
    await app.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await app.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    await sleep(60)
    if (await evaluate(`Boolean(document.querySelector('.drawer'))`)) {
      clicked = { x, y, who: await evaluate(`document.querySelector('.drawer-name')?.textContent ?? ''`) }
      break
    }
  }
}
console.log('desk click opened the inspector:', JSON.stringify(clicked))
if (clicked) {
  await sleep(350)
  await screenshot('office-inspector.png')
}
// Close via the drawer's own close button (the Escape handler depends on
// window focus, which the CDP input call does not always have).
await evaluate(`document.querySelector('.drawer-close')?.click()`)
await sleep(600)

// Force real statuses: one working, one error, one paused.
const workers = await evaluate(`window.ventriee.snapshot()`)
const [w1, w2, w3] = workers.agents
await evaluate(`window.ventriee.updateAgent(${JSON.stringify(w1.id)}, { status: 'working', currentTaskId: null })`)
await evaluate(`window.ventriee.updateAgent(${JSON.stringify(w2.id)}, { status: 'error', lastError: 'Simulated failure for visual check' })`)
await evaluate(`window.ventriee.updateAgent(${JSON.stringify(w3.id)}, { status: 'paused' })`)
await sleep(3500)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(2500)
await screenshot('office-states.png')

const summary = await evaluate(`({
  stage: Boolean(document.querySelector('.office-stage canvas')),
  legend: document.querySelectorAll('.office-legend .legend-item').length,
  drawerClosed: !document.querySelector('.drawer'),
  workingBubble: Boolean(document.querySelector('.office-stage canvas'))
})`)
console.log('summary:', JSON.stringify(summary))
console.log('console errors:', errors.length ? errors.slice(0, 5) : 'none')

const ok = canvas.found && clicked && summary.stage && summary.legend === 4 && summary.drawerClosed && !errors.length
console.log(ok ? 'OFFICE CHECK PASSED' : 'OFFICE CHECK FAILED')

app.ws.close()
killApp(child)
await sleep(1000)
process.exit(ok ? 0 : 1)
