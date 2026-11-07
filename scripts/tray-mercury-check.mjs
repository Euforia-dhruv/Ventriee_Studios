/**
 * Two runtime facts that only exist in a real process:
 *  1. Inception (Mercury) is discoverable without a stored key and flagged as needing one.
 *  2. Closing every window keeps the app alive, because the tray owns the process.
 *
 * Run: node scripts/tray-mercury-check.mjs
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-tray-'))
const child = launchApp({ port: PORT, userData })

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  if (ok) pass += 1
  else fail += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

// A devtools target can vanish mid-call, which would hang a promise forever.
const watchdog = setTimeout(() => {
  console.log('\nFAIL  check did not finish within 90 s (stalled, not necessarily wrong)')
  killApp(child)
  process.exit(1)
}, 90_000)

const app = await connect(PORT)
await sleep(2000)

const models = await app.evaluate(`window.ventriee.modelsDiscover(null)`)
const mercury = models.filter((m) => m.provider === 'api-inception')
check('Inception models discovered without a key', mercury.length > 0, mercury.map((m) => m.model).join(', ') || 'none')
check('Mercury is listed', mercury.some((m) => m.model === 'mercury-3'), mercury.map((m) => m.model).join(', '))
check('an unkeyed model is flagged, not silently usable', mercury.every((m) => !m.configured && Boolean(m.note)), mercury[0]?.note ?? '')
check('Mercury reaches the picker list (configured || note)', mercury.filter((m) => m.configured || m.note).length > 0)
check('no renderer errors before closing', app.errors.length === 0, app.errors[0] ?? '')

// Close the window without awaiting a reply: the renderer the reply would come
// from is the one disappearing, so that promise never settles.
app.ws.send(JSON.stringify({ id: 9001, method: 'Runtime.evaluate', params: { expression: 'window.close()' } }))
await sleep(4000)

// After the target closes, the devtools list may briefly refuse; that is the app
// staying alive with no page, which is exactly what this asserts.
const after = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .then((list) => list.filter((t) => t.type === 'page'))
  .catch(() => [])
check('closing the last window leaves the process running', child.exitCode === null, `exit=${child.exitCode}`)
check('no page targets remain', after.length === 0, `${after.length} page(s)`)

clearTimeout(watchdog)
console.log(`\n${fail === 0 ? 'all checks passed' : `${fail} check(s) failed`} (${pass}/${pass + fail})`)
killApp(child)
await sleep(600)
process.exit(fail === 0 ? 0 : 1)
