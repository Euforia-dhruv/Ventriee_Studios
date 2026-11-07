const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
for (const m of db.prepare("select * from messages where type='review'").all()) {
  console.log('=== review message, ' + String(m.content).length + ' chars')
  console.log(m.content)
}
for (const t of db.prepare("select id,role,status,review from tasks").all()) {
  console.log('\n=== task review col', t.role, t.status, String(t.review ?? '').length, 'chars')
  console.log(t.review)
}
