/**
 * UI audit: every panel opens with real data, keyboard paths work, no console errors.
 *
 * Run: node scripts/ui-check.mjs
 */
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-ui-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-ui-ws-'))
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, screenshot, errors } = app
await sleep(1800)

// First run: the new-project dialog is open before anything exists.
check('first run shows the new-project dialog', await evaluate(`Boolean(document.querySelector('.modal'))`))
check('no project exists yet', (await evaluate(`window.ventriee.snapshot().then((s) => s.projects.length)`)) === 0)
await screenshot('ui-firstrun.png')

const project = await evaluate(`window.ventriee.createProject({
  name: 'UI audit',
  path: ${JSON.stringify(workspace)},
  description: 'UI audit project.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(2000)

const snap = await evaluate(`window.ventriee.snapshot()`)
check('14 workers after project creation', snap.agents.length === 14, `${snap.agents.length}`)
check('memory bootstrapped', snap.memories.length >= 6, `${snap.memories.length} docs`)

// Memory panel
await evaluate(`[...document.querySelectorAll('button')].find((b) => /memory/i.test(b.getAttribute('aria-label') ?? b.title ?? ''))?.click()`)
await sleep(900)
const memory = await evaluate(`({
  open: Boolean(document.querySelector('.modal')),
  rows: document.querySelectorAll('.mem-row').length,
  text: document.querySelector('.modal')?.innerText?.slice(0, 200) ?? ''
})`)
check('memory panel opens', memory.open)
check('memory panel lists the real docs', memory.rows >= 6, `${memory.rows} rows`)
await screenshot('ui-memory.png')
await evaluate(`document.querySelector('.modal .icon-btn, .modal [aria-label="Close"], .modal .btn')?.click()`)
await sleep(500)

// Skills panel
await evaluate(`[...document.querySelectorAll('button')].find((b) => /skill/i.test(b.getAttribute('aria-label') ?? b.title ?? ''))?.click()`)
await sleep(900)
const skills = await evaluate(`({
  open: Boolean(document.querySelector('.modal')),
  text: document.querySelector('.modal')?.innerText ?? ''
})`)
const skillCount = ['evidence-first-delivery', 'frontend-design', 'technical-seo-audit', 'webapp-testing'].filter((s) =>
  skills.text.toLowerCase().includes(s.replace(/-/g, ' ')) || skills.text.toLowerCase().includes(s)
).length
check('skills panel opens', skills.open)
check('bundled skills are listed', skillCount >= 3, `${skillCount} of 4 names found`)
await screenshot('ui-skills.png')
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
await sleep(500)

// Settings panel
await evaluate(`[...document.querySelectorAll('button')].find((b) => /setting/i.test(b.getAttribute('aria-label') ?? b.title ?? ''))?.click()`)
await sleep(1000)
const settings = await evaluate(`({
  open: Boolean(document.querySelector('.modal')),
  text: document.querySelector('.modal')?.innerText ?? ''
})`)
check('settings panel opens', settings.open)
check('settings shows engine detection', /engine/i.test(settings.text), settings.text.slice(0, 90).replace(/\n/g, ' '))
await evaluate(
  `[...document.querySelectorAll('.modal-tab')].find((t) => /run policy/i.test(t.textContent))?.click()`
)
await sleep(700)
const runPolicy = await evaluate(`document.querySelector('.modal')?.innerText ?? ''`)
check('run policy shows parallel sessions', /parallel sessions/i.test(runPolicy), runPolicy.slice(0, 80).replace(/\n/g, ' '))
check('run policy shows the deploy approval gate', /approval before deploy/i.test(runPolicy))
check('run policy shows the timeout', /timeout/i.test(runPolicy))
await screenshot('ui-settings.png')
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
await sleep(500)

// Command bar keyboard path
await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 2, windowsVirtualKeyCode: 75 })
await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 2, windowsVirtualKeyCode: 75 })
await sleep(400)
const focused = await evaluate(`document.activeElement?.tagName + ':' + (document.activeElement?.getAttribute('placeholder') ?? '')`)
check('Ctrl+K focuses the owner input', /TEXTAREA|INPUT/.test(focused), focused)

// List view of the same data
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'List')?.click()`)
await sleep(700)
const list = await evaluate(`({
  rows: document.querySelectorAll('.roster-row').length,
  head: Boolean(document.querySelector('.roster-head'))
})`)
check('list view shows every worker', list.rows >= 15, `${list.rows} rows including head`)
await screenshot('ui-list.png')
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Office')?.click()`)
await sleep(1500)
check('office view returns', await evaluate(`Boolean(document.querySelector('.office-stage canvas'))`))

// Worker inspector from the list, then its config tab
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'List')?.click()`)
await sleep(600)
await evaluate(`document.querySelectorAll('.roster-row')[1]?.click()`)
await sleep(900)
const inspector = await evaluate(`({
  open: Boolean(document.querySelector('.drawer')),
  name: document.querySelector('.drawer-name')?.innerText ?? '',
  tabs: [...document.querySelectorAll('.drawer-tab')].map((t) => t.textContent.trim())
})`)
check('inspector opens from the roster', inspector.open, inspector.name)
check('inspector exposes live/task/mail/config', inspector.tabs.length === 4, inspector.tabs.join(','))
await evaluate(`[...document.querySelectorAll('.drawer-tab')].find((t) => /config/i.test(t.textContent))?.click()`)
await sleep(600)
await screenshot('ui-inspector-config.png')

check('no renderer console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

const failed = results.filter((r) => !r.ok)
console.log(`\n=== UI: ${results.length - failed.length}/${results.length} checks passed ===`)
if (failed.length) console.log('failed:', failed.map((f) => `${f.name} (${f.detail})`).join('; '))

app.ws.close()
killApp(child)
await sleep(800)
process.exit(failed.length ? 1 : 0)
