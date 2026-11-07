import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dirs = readdirSync(tmpdir())
  .filter((d) => d.startsWith('ventriee-flow-'))
  .map((d) => join(tmpdir(), d))
  .filter((d) => existsSync(join(d, 'ventriee.db')) && statSync(join(d, 'ventriee.db')).size > 0)
  .sort((a, b) => statSync(join(b, 'ventriee.db')).mtimeMs - statSync(join(a, 'ventriee.db')).mtimeMs)

const dir = dirs[0]
console.log('profile:', dir)
const db = new DatabaseSync(join(dir, 'ventriee.db'))

for (const t of db.prepare('select role,status,attempts,engine,model,output,review from tasks').all()) {
  const out = String(t.output ?? '')
  console.log(`\n=== ${t.role} | ${t.status} | attempts=${t.attempts} | ${t.engine} ${t.model} | ${out.length} chars ===`)
  console.log('marker block:', out.includes('=== FILE:'), '| fence:', out.includes('```'))
  console.log('--- first 500 ---')
  console.log(out.slice(0, 500))
  console.log('--- review ---')
  console.log(String(t.review ?? '').slice(0, 300))
}
