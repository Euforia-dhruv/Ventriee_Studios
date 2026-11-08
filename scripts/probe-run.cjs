;(async () => {
  try {
    const list = await (await fetch('http://127.0.0.1:9711/json/list')).json()
    const page = list.find((t) => t.type === 'page')
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    })
    await new Promise((r) => ws.addEventListener('open', r))
    const send = (method, params = {}) => new Promise((res, rej) => {
      const n = ++id
      pending.set(n, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))
      ws.send(JSON.stringify({ id: n, method, params }))
    })
    await send('Runtime.enable')
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    }
    console.log('SNAP', await ev(`window.ventriee.snapshot().then(s => JSON.stringify({
      jobs: s.jobs.map(j => ({ id: j.id, status: j.status, error: j.error, createdAt: j.createdAt })),
      tasks: s.tasks.map(t => ({ title: t.title.slice(0,40), role: t.role, status: t.status, attempts: t.attempts, agentId: t.agentId, engine: t.engine, model: t.model, review: (t.review||'').slice(0,120), phase: t.phase })),
      agents: s.agents.map(a => ({ name: a.name, status: a.status, currentTaskId: a.currentTaskId, lastError: a.lastError, engine: a.engine, model: a.model })),
      sessions: s.sessions.slice(-8).map(x => ({ status: x.status, engine: x.engine, model: x.model, agentId: x.agentId, exitCode: x.exitCode, startedAt: x.startedAt, outputTokens: x.outputTokens })),
      running: s.running,
      assignments: s.assignments.length
    }))`))
    ws.close()
  } catch (e) {
    console.error('ERR', e.message)
    process.exit(1)
  }
})()
