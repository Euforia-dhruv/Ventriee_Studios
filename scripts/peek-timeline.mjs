/** Timeline of jobs + sessions for a profile. */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const db = new DatabaseSync(join(process.argv[2], 'ventriee.db'))
const iso = (ms) => (ms ? new Date(ms).toISOString().slice(11, 19) : '—')
console.log('=== jobs ===')
for (const j of db.prepare('SELECT id, status, planSource, createdAt, updatedAt, error FROM jobs ORDER BY createdAt').all()) {
  console.log(`${iso(j.createdAt)} -> ${iso(j.updatedAt)} ${j.status} ${j.planSource} ${j.error ?? ''}`)
}
console.log('\n=== sessions ===')
for (const s of db.prepare('SELECT id, agentId, taskId, status, exitCode, startedAt, endedAt, costUsd FROM sessions ORDER BY startedAt').all()) {
  const dur = s.endedAt ? Math.round((s.endedAt - s.startedAt) / 1000) : null
  console.log(`${iso(s.startedAt)} -> ${iso(s.endedAt)} ${String(s.status).padEnd(8)} exit=${s.exitCode} ${dur}s cost=${s.costUsd}`)
}
console.log('\n=== agents with error ===')
for (const a of db.prepare("SELECT name, role, status, lastError FROM agents WHERE status != 'idle'").all()) {
  console.log(`${a.name} ${a.role} ${a.status}: ${String(a.lastError ?? '').slice(0, 200)}`)
}
