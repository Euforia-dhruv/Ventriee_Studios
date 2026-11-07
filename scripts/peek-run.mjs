/** Diagnostic: dump the live task table from the running acceptance app. */
import { connect } from './lib/app.mjs'

const app = await connect(9341)
const snap = await app.evaluate(`window.ventriee.snapshot()`)
const now = Date.now()
console.log('job:', JSON.stringify(snap.jobs.map((j) => ({ s: j.status, plan: j.planSource }))))
for (const t of snap.tasks) {
  const age = Math.round((now - (t.updatedAt ?? t.createdAt)) / 1000)
  console.log(
    `${t.status.padEnd(8)} ${t.role.padEnd(12)} attempts=${t.attempts ?? '?'} age=${age}s  ${t.title.slice(0, 60)}`
  )
  if (t.review) console.log(`         review: ${t.review.replace(/\s+/g, ' ').slice(0, 150)}`)
  if (t.error) console.log(`         error: ${String(t.error).slice(0, 150)}`)
}
console.log('sessions:', JSON.stringify(snap.sessions.slice(0, 3).map((s) => ({ st: s.status, role: s.engine, startedAt: s.startedAt }))))
const agent = snap.agents.find((a) => a.status === 'working')
console.log('working agent:', agent ? `${agent.name} (${agent.role})` : 'none')
console.log('events tail:', snap.events.slice(-6).map((e) => e.message.slice(0, 110)).join('\n  '))
app.ws.close()
process.exit(0)
