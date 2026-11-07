// List tables and find the prompt-revision table by column shape.
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
const tables = db.prepare("select name from sqlite_master where type='table' order by name").all()
console.log('tables:', tables.map((t) => t.name).join(', '))
for (const t of tables) {
  const cols = db.prepare(`pragma table_info(${t.name})`).all().map((c) => c.name)
  if (cols.includes('body') || cols.includes('parentId') || cols.some((c) => /prompt/i.test(c))) {
    console.log(`\n${t.name}: ${cols.join(', ')}`)
  }
}
