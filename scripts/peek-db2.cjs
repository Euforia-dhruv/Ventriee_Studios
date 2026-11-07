const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
const what = process.argv[3] ?? 'tasks'

for (const t of db.prepare('select * from tasks order by createdAt').all()) {
  console.log(`\n########## ${t.role} ${t.status} attempts=${t.attempts}`)
  console.log('--- output (' + String(t.output ?? '').length + ' chars) ---')
  console.log(String(t.output ?? '').slice(0, 3000))
  console.log('--- review (' + String(t.review ?? '').length + ' chars) ---')
  console.log(String(t.review ?? '').slice(0, 3000))
}

console.log('\n\n########## messages full')
for (const m of db.prepare('select * from messages order by createdAt').all()) {
  console.log(`\n--- ${m.type} ${m.sender}->${m.recipient} (${String(m.content ?? '').length} chars)`)
  console.log(String(m.content ?? '').slice(0, 2500))
}
