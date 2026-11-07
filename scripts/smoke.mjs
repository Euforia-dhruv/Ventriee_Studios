/**
 * Launches the built app with a throwaway user-data dir, drives it over the
 * DevTools protocol, and reports console errors plus a screenshot.
 * Run: node scripts/smoke.mjs [--keep]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freePort } from './lib/app.mjs'

const keep = process.argv.includes('--keep')
const userData = mkdtempSync(join(tmpdir(), 'ventriee-smoke-'))
const port = await freePort()
const electron = join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')

const child = spawn(
  electron,
  ['.', `--remote-debugging-port=${port}`],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
    env: { ...process.env, VENTRIEE_USERDATA: userData }
  }
)
child.on('exit', (code) => logs.push(`exited: ${code}`))

const logs = []
child.stdout.on('data', (d) => logs.push(`out: ${d}`))
child.stderr.on('data', (d) => logs.push(`err: ${d}`))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function target() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) break
    await sleep(400)
  }
  console.error(logs.join('\n'))
  throw new Error('DevTools target never appeared')
}

const page = await target()
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const errors = []

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    errors.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`)
  }
})

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
await send('Page.enable')
await sleep(2200)

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return result.result?.value
}

const checks = {}
checks.appMounted = await evaluate(`Boolean(document.querySelector('.app'))`)
checks.brand = await evaluate(`document.querySelector('.brand-name')?.textContent`)
checks.emptyStageOrFloor = await evaluate(
  `Boolean(document.querySelector('.empty-stage') || document.querySelector('.floor'))`
)
checks.modalOpen = await evaluate(`Boolean(document.querySelector('.modal'))`)
checks.projects = await evaluate(`document.querySelectorAll('.popover-item').length`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
const outDir = join(process.cwd(), 'artifacts')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'smoke-boot.png'), Buffer.from(shot.data, 'base64'))

console.log(JSON.stringify({ checks, errors, logs: logs.slice(-14) }, null, 2))

ws.close()
if (!keep) {
  child.kill()
  await sleep(600)
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    console.log(`(left temp profile at ${userData})`)
  }
}
process.exit(errors.length ? 1 : 0)
