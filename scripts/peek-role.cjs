/** What a role's session actually spent: output tokens, status, and how much text landed. */
const { DatabaseSync } = require('node:sqlite')
const { join } = require('node:path')

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/peek-role.cjs <profile dir> [role]')
  process.exit(1)
}
const role = process.argv[3]
const db = new DatabaseSync(join(dir, 'ventriee.db'), { readOnly: true })

const tasks = db
  .prepare(`SELECT * FROM tasks ${role ? 'WHERE role = ?' : ''} ORDER BY createdAt`)
  .all(...(role ? [role] : []))

for (const t of tasks) {
  console.log(`\n[${t.role}] ${t.status} attempts=${t.attempts} id=${t.id}`)
  console.log(`  output stored: ${String(t.output ?? '').length} chars`)
  console.log(`  review: ${String(t.review ?? '').slice(0, 220)}`)
  const sessions = db.prepare('SELECT * FROM sessions WHERE taskId = ? ORDER BY startedAt').all(t.id)
  for (const s of sessions) {
    const mins = s.endedAt ? ((s.endedAt - s.startedAt) / 60000).toFixed(1) : 'live'
    console.log(
      `   - ${s.id} ${String(s.engine).padEnd(11)} ${String(s.model || '-').padEnd(22)} ${String(s.status).padEnd(6)} out=${String(s.outputTokens ?? '?').padStart(6)} in=${String(s.inputTokens ?? '?').padStart(6)} ${mins}m reasoning=${s.reasoning}`
    )
  }
}
