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
    console.log('SESSIONS', await ev(`window.ventriee.snapshot().then(s => JSON.stringify(s.sessions.slice(-12).map(x => ({
      status: x.status, engine: x.engine, model: x.model, exitCode: x.exitCode,
      in: x.inputTokens, out: x.outputTokens, cost: x.costUsd,
      command: (x.command||'').slice(0,80), started: new Date(x.startedAt).toLocaleTimeString()
    }))))`))
    console.log('AGENTS', await ev(`window.ventriee.snapshot().then(s => JSON.stringify(s.agents.filter(a => a.lastError).map(a => ({ name: a.name, lastError: a.lastError }))))`))
    console.log('EVENTS', await ev(`window.ventriee.snapshot().then(s => JSON.stringify(s.events.slice(-15).map(e => e.type + ': ' + (e.message||'').slice(0,140))))`))
    ws.close()
  } catch (e) {
    console.error('ERR', e.message)
    process.exit(1)
  }
})()
