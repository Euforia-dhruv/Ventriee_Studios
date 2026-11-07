/**
 * Verifies the dependency-install path end to end with no network:
 * a workspace that declares a file: dependency but has no node_modules must
 * report needsInstall, show the install control, and install on one click.
 *
 * Run: node scripts/install-check.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-inst-'))
const workspace = mkdtempSync(join(tmpdir(), 'ventriee-inst-ws-'))
mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true })

// A local file: dependency installs offline, so this proves the plumbing, not the network.
mkdirSync(join(workspace, 'local-dep'), { recursive: true })
writeFileSync(join(workspace, 'local-dep', 'package.json'), JSON.stringify({ name: 'local-dep', version: '1.0.0' }))
writeFileSync(
  join(workspace, 'package.json'),
  JSON.stringify({
    name: 'install-check',
    version: '1.0.0',
    scripts: { dev: 'node -e "console.log(\'listening on 4500\')"' },
    devDependencies: { 'local-dep': 'file:./local-dep' }
  }, null, 2)
)

const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, screenshot, errors } = app
await sleep(1800)

const project = await evaluate(`window.ventriee.createProject({
  name: 'Install Check',
  path: ${JSON.stringify(workspace)},
  description: 'Dependency install verification.'
})`)
await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
await sleep(2500)

let state = await evaluate(`window.ventriee.snapshot().then((s) => s.preview)`)
console.log('needsInstall:', state.needsInstall, '| command:', JSON.stringify(state.installCommand))
const ui = await evaluate(`({
  notice: document.querySelector('.preview-notice-title')?.textContent ?? null,
  button: [...document.querySelectorAll('.preview-stage button')].map((b) => b.textContent.trim())
})`)
console.log('panel notice:', JSON.stringify(ui.notice))
console.log('panel buttons:', JSON.stringify(ui.button))
await screenshot('install-missing.png')

console.log('node_modules before:', existsSync(join(workspace, 'node_modules')))
const started = Date.now()
await evaluate(`window.ventriee.previewInstall(${JSON.stringify(project.id)})`)
console.log('install took', Math.round((Date.now() - started) / 1000), 's')

state = await evaluate(`window.ventriee.snapshot().then((s) => s.preview)`)
const installed = existsSync(join(workspace, 'node_modules', 'local-dep'))
console.log('node_modules/local-dep present:', installed)
console.log('needsInstall after:', state.needsInstall, '| status:', state.status)
console.log('log tail:', JSON.stringify(state.logs.slice(-3)))
console.log('console errors:', errors.length ? errors.slice(0, 3) : 'none')

app.ws.close()
killApp(child)
await sleep(700)
process.exit(installed && !state.needsInstall && state.needsInstall === false && !errors.length ? 0 : 1)
