const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
const tables = db.prepare("select name from sqlite_master where type='table'").all().map((t) => t.name)
console.log('tables:', tables.join(', '))
for (const t of tables) {
  const cols = db.prepare('select name from pragma_table_info(?)').all(t).map((c) => c.name)
  const n = db.prepare(`select count(*) c from "${t}"`).get().c
  console.log(`  ${t} (${n}): ${cols.join(', ')}`)
}
