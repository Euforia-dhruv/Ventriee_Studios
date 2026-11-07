const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
const secs = (a, b) => (a && b ? Math.round((b - a) / 1000) + 's' : 'open')

console.log('=== tasks ===')
for (const t of db.prepare('select * from tasks order by createdAt').all()) {
  console.log(`${t.id} ${t.role} status=${t.status} attempts=${t.attempts} routedBy=${t.routedBy ?? '-'} model=${t.model ?? '-'}`)
  console.log(`  title: ${t.title}`)
  console.log(`  acceptance: ${String(t.acceptance ?? '').slice(0, 200)}`)
  const rev = String(t.review ?? '').replace(/\s+/g, ' ')
  if (rev) console.log(`  review: ${rev.slice(0, 400)}`)
}

console.log('\n=== sessions ===')
for (const s of db.prepare('select * from sessions order by startedAt').all()) {
  console.log(`${s.id} task=${s.taskId} agent=${s.agentId} ${s.engine}/${s.model} ${s.status} ${secs(s.startedAt, s.endedAt)} in=${s.inputTokens} out=${s.outputTokens}`)
  console.log(`  cmd: ${String(s.command ?? '').slice(0, 160)}`)
  if (s.externalId) console.log(`  ext: ${String(s.externalId).slice(0, 120)}`)
}

console.log('\n=== events ===')
for (const e of db.prepare('select * from events order by createdAt').all()) {
  console.log(`${e.type} ${e.agentId ?? ''} ${e.taskId ?? ''}: ${String(e.message ?? '').replace(/\s+/g, ' ').slice(0, 220)}`)
}

console.log('\n=== messages ===')
for (const m of db.prepare('select * from messages order by createdAt').all()) {
  console.log(`${m.type} ${m.sender}->${m.recipient} ${m.status}: ${String(m.content ?? '').replace(/\s+/g, ' ').slice(0, 220)}`)
}

console.log('\n=== job ===')
for (const j of db.prepare('select * from jobs').all()) console.log(j.status, j.planSource, String(j.error ?? ''), j.createdAt, j.updatedAt)

console.log('\n=== assignment ===')
for (const a of db.prepare('select * from assignments').all()) console.log(a.id, a.mode, a.promptId, String(a.agents).slice(0, 400))
