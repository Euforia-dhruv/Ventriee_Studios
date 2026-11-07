/** Scan leftover run profiles and show what the designer/frontend workers actually spent. */
const { DatabaseSync } = require('node:sqlite')
const { readdirSync, statSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const root = process.env.TEMP
const dirs = readdirSync(root)
  .filter((n) => n.startsWith('ventriee-flow-'))
  .map((n) => join(root, n))
  .filter((p) => existsSync(join(p, 'ventriee.db')))
  .map((p) => ({ p, size: statSync(join(p, 'ventriee.db')).size, mtime: statSync(join(p, 'ventriee.db')).mtimeMs }))
  .filter((d) => d.size > 20000)
  .sort((a, b) => b.mtime - a.mtime)

for (const d of dirs.slice(0, 3)) {
  console.log(`\n### ${d.p}  (${d.size} bytes, ${new Date(d.mtime).toISOString()})`)
  let db
  try {
    db = new DatabaseSync(join(d.p, 'ventriee.db'), { readOnly: true })
    for (const t of db.prepare('SELECT id, role, status, attempts, length(output) AS n FROM tasks ORDER BY createdAt').all()) {
      const sessions = db
        .prepare('SELECT outputTokens, status FROM sessions WHERE taskId = ? ORDER BY startedAt')
        .all(t.id)
        .map((s) => `${s.outputTokens ?? '?'}t/${s.status}`)
      console.log(`[${String(t.role).padEnd(12)}] ${String(t.status).padEnd(8)} out=${String(t.n).padStart(7)} ch  sessions: ${sessions.join(', ') || '-'}`)
    }
  } catch (e) {
    console.log('  (unreadable)', e.message)
  }
}
