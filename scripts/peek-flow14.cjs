// What the flow check leaves behind: the prompt revisions and the failed task's review.
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
console.log('--- prompts ---')
for (const p of db.prepare('select id, parentId, version, title, length(body) len, createdAt from prompts order by createdAt').all()) {
  console.log(`${p.version}  ${String(p.id).slice(0, 12)}  parent=${String(p.parentId ?? '-').slice(0, 12)}  ${p.len}B  ${p.title}`)
}
console.log('--- tasks ---')
for (const t of db.prepare("select title, status, attempts, review from tasks order by createdAt").all()) {
  console.log(`${t.status.padEnd(8)} attempts=${t.attempts}  ${t.title}\n   review: ${String(t.review).slice(0, 300)}`)
}
console.log('--- last sessions ---')
for (const s of db.prepare('select agentId, engine, model, status, outputTokens, reasoning, startedAt from sessions order by startedAt desc limit 6').all()) {
  console.log(`${s.status.padEnd(8)} ${s.engine} ${s.model} out=${s.outputTokens} reasoning=${s.reasoning}`)
}
