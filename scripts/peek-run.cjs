const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2], { readOnly: true })
const q = (sql, ...a) => db.prepare(sql).all(...a)

console.log('--- tasks')
for (const t of q('SELECT id,role,status,attempts,review FROM tasks ORDER BY createdAt')) {
  console.log(t.id, t.role, 'status=' + t.status, 'attempts=' + t.attempts)
  console.log('   review:', String(t.review).slice(0, 700))
}
console.log('\n--- sessions')
for (const s of q('SELECT id,agentId,taskId,engine,model,reasoning,status,exitCode,inputTokens,outputTokens,startedAt,endedAt,command FROM sessions ORDER BY startedAt')) {
  console.log(`${s.id} agent=${s.agentId} task=${s.taskId} ${s.engine}/${s.model} reason=${s.reasoning} status=${s.status} exit=${s.exitCode} in=${s.inputTokens} out=${s.outputTokens} dur=${s.endedAt ? Math.round((s.endedAt - s.startedAt) / 1000) + 's' : 'live'}`)
  console.log('   cmd:', String(s.command).slice(0, 160))
}
console.log('\n--- events (note/error)')
for (const e of q("SELECT type,message,agentId,taskId FROM events WHERE type IN ('error','note','review','task') ORDER BY createdAt")) {
  console.log(`[${e.type}]`, String(e.message).slice(0, 300))
}
console.log('\n--- messages (blocker/note)')
for (const m of q("SELECT type,recipient,content FROM messages WHERE type IN ('blocker','note') ORDER BY createdAt")) {
  console.log(`[${m.type} -> ${m.recipient}]`, String(m.content).slice(0, 400))
}
