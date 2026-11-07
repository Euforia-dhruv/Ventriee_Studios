/** Full task row for one task, including the description the planner wrote. */
const { DatabaseSync } = require('node:sqlite')
const { join } = require('node:path')

const db = new DatabaseSync(join(process.argv[2], 'ventriee.db'), { readOnly: true })
const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(process.argv[3])
if (!t) {
  console.error('no such task')
  process.exit(1)
}
for (const [k, v] of Object.entries(t)) {
  const s = String(v ?? '')
  console.log(`--- ${k} ---`)
  console.log(s.length > 2500 ? `${s.slice(0, 2500)}\n…(${s.length} chars)` : s)
}
