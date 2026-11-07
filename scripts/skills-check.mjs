/**
 * Skills check: the bundled library registers with real names and descriptions
 * (not folder-derived ids), the newly imported skills are present, and the
 * designer's role template actually points at them.
 *
 * Run: node scripts/skills-check.mjs
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-skills-'))
const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, errors } = app
await sleep(1800)

const project = await evaluate(`window.ventriee.createProject({
  name: 'Skills check',
  path: ${JSON.stringify(mkdtempSync(join(tmpdir(), 'ventriee-skills-ws-')))},
  description: 'skill library'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(1200)

const snap = await evaluate(`window.ventriee.snapshot()`)
const skills = snap.skills ?? []
const byId = new Map(skills.map((s) => [s.id, s]))

check('bundled library seeded', skills.length >= 60, `${skills.length} skills`)

// The CRLF bug made these register as id=folder with a blank description.
const sample = ['hallmark', 'ui-ux-pro-max', 'impeccable', 'tdd', 'gsap-core', 'writing-for-agents']
const blank = sample.filter((id) => !byId.get(id)?.description)
check('names and descriptions parse', blank.length === 0, blank.length ? `blank: ${blank.join(', ')}` : '')

const imported = ['banner-design', 'brand', 'design', 'slides', 'canvas-design', 'claude-api']
const missing = imported.filter((id) => !byId.has(id))
check('newly imported skills are registered', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : '')

const iris = (snap.agents ?? []).find((a) => a.role === 'designer')
const bound = iris?.skills ?? []
check('designer agent exists', Boolean(iris), iris?.name ?? 'none')
const notBound = ['design', 'brand', 'banner-design', 'slides', 'canvas-design'].filter((id) => !bound.includes(id))
check('designer carries the new bindings', notBound.length === 0, notBound.length ? `missing: ${notBound.join(', ')}` : '')

// Every bound id must resolve to a real record, or the prompt lists a dead path.
const dead = bound.filter((id) => !byId.has(id))
check('every bound skill resolves', dead.length === 0, dead.length ? `dead: ${dead.join(', ')}` : '')
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))

app.ws.close()
killApp(child)
await sleep(600)
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
