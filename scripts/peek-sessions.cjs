// One session row plus its agent, for diagnosing why a run failed.
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
const rows = db
  .prepare(
    `select s.id, a.name, a.role, s.engine, s.model, s.status, s.exitCode, s.outputTokens,
            s.startedAt, s.endedAt, s.command
       from sessions s left join agents a on a.id = s.agentId
      order by s.startedAt desc limit ?`
  )
  .all(Number(process.argv[3] ?? 12))
for (const r of rows) {
  const mins = r.startedAt && r.endedAt ? Math.round((r.endedAt - r.startedAt) / 60000) : null
  console.log(
    `${new Date(r.startedAt).toISOString().slice(11, 19)} ${String(r.name).padEnd(8)} ${String(r.role).padEnd(11)} ` +
      `${String(r.engine).padEnd(14)} ${String(r.status).padEnd(8)} out=${String(r.outputTokens).padEnd(6)} ` +
      `${mins === null ? '  -' : String(mins).padStart(3) + 'm'} ${String(r.command ?? '').slice(0, 60)}`
  )
}
