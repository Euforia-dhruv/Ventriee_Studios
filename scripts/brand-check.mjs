/**
 * Visual check for the brand restyle: purple accent tokens, real logo in the
 * topbar, no amber left anywhere on screen.
 *
 * Run: node scripts/brand-check.mjs
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const userData = mkdtempSync(join(tmpdir(), 'ventriee-brand-'))
const child = launchApp({ port: PORT, userData })
const app = await connect(PORT)
const { evaluate, screenshot, errors } = app
await sleep(2000)

const probe = await evaluate(`(() => {
  const root = getComputedStyle(document.documentElement)
  const accent = root.getPropertyValue('--accent').trim()
  const mark = document.querySelector('.brand-mark')
  const cs = mark ? getComputedStyle(mark) : null
  const amber = []
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
      const v = s[prop]
      if (!v) continue
      const m = v.match(/rgba?\\((\\d+), (\\d+), (\\d+)/)
      if (!m) continue
      const [r, g, b] = [+m[1], +m[2], +m[3]]
      // Old amber accent only. --warn (242 165 95) is a deliberate orange state colour.
      if (r === 245 && g === 193 && b === 101) amber.push(el.className + ':' + prop + '=' + v)
    }
  }
  return {
    accent,
    markBackground: cs ? cs.backgroundImage.slice(0, 120) : null,
    markHasImage: cs ? cs.backgroundImage.includes('brand-mark') : false,
    markText: mark ? mark.textContent : null,
    amber: amber.slice(0, 6)
  }
})()`)

console.log('accent token:', probe.accent)
console.log('brand mark uses logo image:', probe.markHasImage)
console.log('brand mark text content:', JSON.stringify(probe.markText))
console.log('amber elements on screen:', probe.amber.length ? probe.amber : 'none')
await screenshot('brand-restyle.png')
console.log('console errors:', errors.length ? errors.slice(0, 3) : 'none')

app.ws.close()
killApp(child)
await sleep(600)
const ok = probe.accent === '#a78bfa' && probe.markHasImage && !probe.markText && !probe.amber.length && !errors.length
console.log(ok ? 'BRAND OK' : 'BRAND FAILED')
process.exit(ok ? 0 : 1)
