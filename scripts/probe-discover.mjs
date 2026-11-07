/** Times modelsDiscover and prints the stages, to find what blocks. */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const child = launchApp({ port: PORT, userData: mkdtempSync(join(tmpdir(), 'ventriee-probe-')) })
const app = await connect(PORT)
const t0 = Date.now()
const ping = setInterval(() => console.log(`  … ${Math.round((Date.now() - t0) / 1000)}s`), 5000)
await sleep(2000)
console.log('app up in', Math.round((Date.now() - t0) / 1000), 's')
const started = Date.now()
try {
  const models = await app.evaluate(`window.ventriee.modelsDiscover(null)`)
  console.log('modelsDiscover returned in', Math.round((Date.now() - started) / 1000), 's:', models.length, 'models')
  const merc = models.filter((m) => m.provider === 'api-inception')
  console.log('inception options:', JSON.stringify(merc))
} catch (e) {
  console.log('modelsDiscover failed after', Math.round((Date.now() - started) / 1000), 's:', e.message)
}
clearInterval(ping)
app.ws.close()
killApp(child)
await sleep(500)
process.exit(0)
