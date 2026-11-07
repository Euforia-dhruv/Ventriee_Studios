/** Shared Electron+CDP harness for the verification scripts. */
import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * A hardcoded port collides with a stale Electron that still holds the socket, and
 * with a second copy of the same check. Ask the OS for a free one instead.
 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

export function launchApp({ port, userData, cwd = process.cwd() }) {
  const child = spawn(join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.', `--remote-debugging-port=${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd,
    env: { ...process.env, VENTRIEE_USERDATA: userData }
  })
  // Keep the full main-process output: a silent renderer disconnect is usually a main-process crash.
  const logPath = join(cwd, 'artifacts', `app-${port}.log`)
  mkdirSync(join(cwd, 'artifacts'), { recursive: true })
  const log = createWriteStream(logPath, { flags: 'a' })
  const tee = (label) => (d) => {
    const s = String(d)
    log.write(s)
    if (label === 'stderr' && s.includes('ERROR') && !s.includes('DevTools')) console.log(`[app] ${s.trim()}`)
  }
  child.stdout.on('data', tee('stdout'))
  child.stderr.on('data', tee('stderr'))
  child.on('exit', (code, signal) => {
    log.write(`\n[process exited code=${code} signal=${signal}]\n`)
    console.log(`\n[app] main process exited code=${code} signal=${signal} — see artifacts/app-${port}.log`)
  })
  return child
}

/** Electron spawns helper processes; a plain kill leaves the devtools port held. */
export function killApp(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    child.kill('SIGKILL')
  }
}

async function target(port) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* not up yet */
    }
    await sleep(300)
  }
  throw new Error('no devtools target')
}

export async function connect(port) {
  const page = await target(port)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).ok(m)
      pending.delete(m.id)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    }
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
      pending.set(id, {
        ok: (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)),
        fail: rej
      })
      ws.send(JSON.stringify({ id, method, params }))
    })
  // An unanswered evaluate never settles once the socket closes, which drains the
  // event loop and exits Node silently mid-poll with no stack and no summary. Two
  // runs died that way (#24, #25), so surface the disconnect instead.
  ws.addEventListener('close', () => {
    for (const entry of pending.values()) entry.fail(new Error('devtools connection closed'))
    pending.clear()
  })
  await send('Runtime.enable')
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + (r.exceptionDetails.exception?.description ?? ''))
    return r.result?.value
  }
  const screenshot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })
    writeFileSync(join(process.cwd(), 'artifacts', name), Buffer.from(shot.data, 'base64'))
  }
  // If the app's renderer restarts (or the socket drops), rebind to a fresh page
  // target instead of letting the next evaluate throw forever.
  const reconnect = async () => {
    const next = await connect(port)
    next.screenshot = screenshot
    return next
  }
  return { ws, send, evaluate, errors, screenshot, reconnect }
}
