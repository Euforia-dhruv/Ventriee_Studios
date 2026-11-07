/** Read a profile's events and task reviews (the sessions table has no stdout). */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const db = new DatabaseSync(join(process.argv[2], 'ventriee.db'))
console.log('=== events ===')
for (const e of db.prepare('SELECT createdAt, type, message FROM events ORDER BY createdAt').all()) {
  console.log(`${new Date(e.createdAt).toISOString().slice(11, 19)} ${String(e.type).padEnd(7)} ${String(e.message).slice(0, 300)}`)
}
console.log('\n=== tasks ===')
for (const t of db.prepare('SELECT role, status, attempts, review FROM tasks ORDER BY createdAt').all()) {
  console.log(`\n[${t.role}] ${t.status} attempts=${t.attempts}`)
  console.log(String(t.review ?? '').slice(0, 700))
}
