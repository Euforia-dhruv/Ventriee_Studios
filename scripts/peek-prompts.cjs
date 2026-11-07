// Which code path created the phantom revision? Print prompt revisions and any
// event close to it in time.
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])

console.log('--- prompts ---')
for (const p of db.prepare('select id, version, source, parentId, length(body) len, createdAt, title from prompts order by createdAt').all()) {
  console.log(`${new Date(p.createdAt).toISOString()} v${p.version} ${String(p.source).padEnd(10)} ${String(p.len).padStart(6)}B parent=${p.parentId ?? '-'} title=${p.title}`)
}

console.log('\n--- events 20:05..20:20 ---')
for (const e of db.prepare('select type, agentId, taskId, substr(message,1,120) m, createdAt from events order by createdAt').all()) {
  const t = new Date(e.createdAt)
  if (t.getUTCMinutes() >= 5 && t.getUTCMinutes() <= 20 && t.getUTCHours() === 20) {
    console.log(`${t.toISOString()} ${String(e.type).padEnd(12)} ${e.agentId ?? '-'} ${e.m}`)
  }
}
