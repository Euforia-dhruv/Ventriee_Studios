const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2], { readOnly: true })
const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(process.argv[3])
const out = String(t.output || '')
console.log('output chars:', out.length)
const files = [...out.matchAll(/^=+\s*FILE:\s*(.+)$/gim)].map((m) => m[1].trim())
const ends = [...out.matchAll(/^=+\s*END FILE/gim)].length
console.log('FILE markers:', files.length, 'END markers:', ends)
console.log(files)
