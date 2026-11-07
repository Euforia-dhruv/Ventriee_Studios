import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync(process.argv[2])
const tables = db.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name)
console.log('tables:', tables.join(','))
for (const t of ['jobs', 'tasks']) {
  const cols = db.prepare(`pragma table_info(${t})`).all().map((r) => r.name)
  console.log(`\n${t}:`, cols.join(','))
  console.log(db.prepare(`select * from ${t}`).all())
}
