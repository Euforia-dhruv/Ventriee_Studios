import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync(process.argv[2])
const where = process.argv[3] ?? "1=1"
const rows = db.prepare(`select type, message, createdAt from events where ${where} order by createdAt desc limit 40`).all()
for (const r of rows) console.log(new Date(r.createdAt).toISOString().slice(11, 19), r.type, '|', r.message)
