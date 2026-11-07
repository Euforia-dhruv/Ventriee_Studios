/**
 * Visual + functional check of the always-on preview panel.
 * Creates a project whose workspace already contains a static site, verifies the
 * panel serves it, verifies a file edit bumps the reload revision, then captures
 * screenshots. No CLI calls, so it is fast.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freePort } from './lib/app.mjs'

const userData = mkdtempSync(join(tmpdir(), 'ventriee-prev-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-pvws-'))
const port = await freePort()
const electron = join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

const html = (accent) => `<!doctype html><html><head><meta charset="utf-8"><title>Preview check</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0d0f12;color:#e9ebee;font-family:Inter,system-ui}
h1{font-size:32px;letter-spacing:-.02em;margin:0 0 8px}p{color:${accent};margin:0;font-family:ui-monospace}</style></head>
<body><div><h1>Ventriee live preview</h1><p>edited at ${new Date().toISOString()}</p></div></body></html>`

writeFileSync(join(workspace, 'index.html'), html('#f5c165'))

const child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VENTRIEE_USERDATA: userData }
})
child.stderr.on('data', (d) => {
  const s = String(d)
  if (s.includes('ERROR') && !s.includes('DevTools')) log(`[app] ${s.trim()}`)
})

async function connect() {
  let target = null
  for (let i = 0; i < 80 && !target; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find((t) => t.type === 'page') ?? null
    } catch {
      /* retry */
    }
    if (!target) await sleep(300)
  }
  if (!target) throw new Error('no devtools target')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
  })
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
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
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })
    writeFileSync(join(process.cwd(), 'artifacts', name), Buffer.from(s.data, 'base64'))
    log('screenshot:', name)
  }
  return { ws, evaluate, send, errors, shot }
}

const { ws, evaluate, send, errors, shot } = await connect()
await sleep(1800)

const project = await evaluate(`window.ventriee.createProject({
  name: 'Preview Check',
  path: ${JSON.stringify(workspace)},
  description: 'Static site used to verify the always-on preview.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(1200)

let state = await evaluate(`window.ventriee.snapshot().then((s) => s.preview)`)
log('classified:', state.kind, '| status:', state.status, '| command:', JSON.stringify(state.command))

await evaluate(`window.ventriee.previewStart(${JSON.stringify(project.id)})`)
for (let i = 0; i < 20 && state.status !== 'ready'; i += 1) {
  await sleep(500)
  state = await evaluate(`window.ventriee.snapshot().then((s) => s.preview)`)
}
log('after start:', state.status, '| url:', state.url)
if (state.status !== 'ready' || !state.url) throw new Error('preview did not become ready')

// the served bytes must be the real file
const served = await (await fetch(state.url)).text()
log('served real html:', served.includes('Ventriee live preview'))

await sleep(800)
await shot('preview-static.png')

const before = state.revision
writeFileSync(join(workspace, 'index.html'), html('#79dcb4'))
let revision = before
for (let i = 0; i < 12 && revision === before; i += 1) {
  await sleep(1000)
  revision = (await evaluate(`window.ventriee.snapshot().then((s) => s.preview)`)).revision
}
log('revision after edit:', before, '->', revision)
const served2 = await (await fetch(state.url)).text()
log('served updated html:', served2.includes('#79dcb4'))
await sleep(1200)
await shot('preview-updated.png')

// python artifact adapter
const py = mkdtempSync(join(tmpdir(), 'ventriee-py-'))
writeFileSync(join(py, 'report.py'), 'print("ventriee-python-artifact-ok")\nprint("rows:", 3)\n')
const project2 = await evaluate(`window.ventriee.createProject({
  name: 'Python Check',
  path: ${JSON.stringify(py)},
  description: 'Script artifact.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project2.id)})`)
await sleep(1000)
let p2 = await evaluate(`window.ventriee.snapshot().then((s) => s.preview)`)
log('python classified:', p2.kind, '| command:', p2.command)
await evaluate(`window.ventriee.previewStart(${JSON.stringify(project2.id)})`)
for (let i = 0; i < 30 && !p2.logs.some((l) => l.includes('exit code')); i += 1) {
  await sleep(500)
  p2 = await evaluate(`window.ventriee.snapshot().then((s) => s.preview)`)
}
log('python status:', p2.status, '| output:', JSON.stringify(p2.logs.slice(-4)))
await shot('preview-python.png')

log('console errors:', errors.length ? errors : 'none')
ws.close()
child.kill()
await sleep(600)
rmSync(workspace, { recursive: true, force: true })
rmSync(py, { recursive: true, force: true })
const ok = served.includes('Ventriee live preview') && served2.includes('#79dcb4') && p2.logs.some((l) => l.includes('ventriee-python-artifact-ok'))
log(ok ? 'PREVIEW CHECK PASSED' : 'PREVIEW CHECK FAILED')
process.exit(ok ? 0 : 1)
