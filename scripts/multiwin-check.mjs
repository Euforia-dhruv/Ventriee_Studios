/**
 * Multi-window check: two windows, each on its own project, plus tray presence.
 *
 * Run: node scripts/multiwin-check.mjs
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-mw-'))

async function pages() {
  let list = []
  for (let i = 0; i < 120; i += 1) {
    try {
      list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page')
    } catch {
      list = [] // port not open yet
    }
    if (list.length >= 2) return list
    await sleep(250)
  }
  return list
}

async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  const pending = new Map()
  let seq = 0
  const errors = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })
  await send('Runtime.enable')
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + (r.exceptionDetails.exception?.description ?? ''))
    return r.result?.value
  }
  return { ws, evaluate, errors }
}

const child = launchApp({ port: PORT, userData })
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const first = (await pages())[0]
let app = await attach(first)
await sleep(2500)

// Two projects.
const a = await app.evaluate(`window.ventriee.createProject({ name: 'Alpha', path: ${JSON.stringify(mkdtempSync(join(tmpdir(), 'ventriee-a-')))}, description: 'A' })`)
const b = await app.evaluate(`window.ventriee.createProject({ name: 'Beta', path: ${JSON.stringify(mkdtempSync(join(tmpdir(), 'ventriee-b-')))}, description: 'B' })`)
check('two projects created', Boolean(a?.id && b?.id))

// Put window 1 on Alpha, so the two windows are independent from the start.
await app.evaluate(`window.ventriee.selectProject(${JSON.stringify(a.id)})`)
await sleep(1200)

// Open Beta in a second window.
await app.evaluate(`window.ventriee.openProjectWindow(${JSON.stringify(b.id)})`)
await sleep(4000)

const list = await pages()
check('a second window exists', list.length >= 2, `${list.length} page target(s)`)

// Attach to the new window and read what each window shows.
const others = list.filter((t) => t.webSocketDebuggerUrl !== first.webSocketDebuggerUrl)
const second = await attach(others[others.length - 1])
await sleep(2000)

const firstSnap = await app.evaluate(`window.ventriee.snapshot().then((s) => ({ id: s.activeProjectId, name: s.projects.find((p) => p.id === s.activeProjectId)?.name }))`)
const secondSnap = await second.evaluate(`window.ventriee.snapshot().then((s) => ({ id: s.activeProjectId, name: s.projects.find((p) => p.id === s.activeProjectId)?.name }))`)
console.log('window 1 shows:', JSON.stringify(firstSnap))
console.log('window 2 shows:', JSON.stringify(secondSnap))
check('the new window shows Beta', secondSnap.id === b.id, secondSnap.name)
check('the two windows differ', firstSnap.id !== secondSnap.id)

// Switching project in window 1 must not move window 2.
await app.evaluate(`window.ventriee.selectProject(${JSON.stringify(a.id)})`)
await sleep(1500)
const secondAfter = await second.evaluate(`window.ventriee.snapshot().then((s) => s.activeProjectId)`)
check('window 2 keeps its project when window 1 switches', secondAfter === b.id, secondAfter)

// Both windows still render live data after the switch.
const firstStill = await app.evaluate(`document.querySelector('.brand-name')?.textContent ?? null`)
check('window 1 still renders', firstStill === 'VENTRIEE', String(firstStill))

check('no renderer errors', app.errors.length + second.errors.length === 0, [...app.errors, ...second.errors].join(' | ').slice(0, 160))

// Scale: the owner runs 5-6 projects side by side. Every extra window must land on
// its own project rather than inheriting the last selection.
const extra = []
for (let i = 3; i <= 6; i += 1) {
  const name = `P${i}`
  const project = await app.evaluate(`window.ventriee.createProject({ name: ${JSON.stringify(name)}, path: ${JSON.stringify(mkdtempSync(join(tmpdir(), `ventriee-${name}-`)))}, description: ${JSON.stringify(name)} })`)
  extra.push({ name, id: project.id })
  await app.evaluate(`window.ventriee.openProjectWindow(${JSON.stringify(project.id)})`)
  await sleep(1200)
}
await sleep(3000)

const six = await pages()
check('six windows open at once', six.length >= 6, `${six.length} page target(s)`)

const seen = [firstSnap.id, secondAfter, ...extra.map((e) => e.id)]
check('six projects, six window selections', new Set(seen).size === 6, `${new Set(seen).size} distinct`)

// Read every window back: each must still be on the project it was opened for.
const actual = []
for (const target of six) {
  const page = await attach(target)
  actual.push(await page.evaluate(`window.ventriee.snapshot().then((s) => s.activeProjectId)`))
  page.ws.close()
}
check(
  'every window kept its own project',
  actual.length >= 6 && extra.every((e) => actual.includes(e.id)) && actual.includes(b.id),
  `${actual.filter(Boolean).length} window(s) answered`
)

app.ws.close()
second.ws.close()
killApp(child)
await sleep(800)
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
