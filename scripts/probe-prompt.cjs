;(async () => {
  try {
    const list = await (await fetch('http://127.0.0.1:9711/json/list')).json()
    const page = list.find((t) => t.type === 'page')
    if (!page) { console.log('no page, cdp down'); process.exit(0) }
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
    console.log('STATE', await ev(`window.ventriee.snapshot().then(s => JSON.stringify({
      jobs: s.jobs.map(j => ({ status: j.status, error: j.error, instruction: j.instruction.slice(0,120) })),
      tasks: s.tasks.map(t => ({ role: t.role, status: t.status, attempts: t.attempts, title: t.title.slice(0,60), review: (t.review||'').slice(0,200) })),
      sessions: s.sessions.slice(-6).map(x => ({ status: x.status, engine: x.engine, model: x.model, outputTokens: x.outputTokens, exitCode: x.exitCode })),
      prompts: s.prompts.slice(-1).map(p => p.body.slice(0, 1200)),
      running: s.running
    }))`))
    ws.close()
  } catch (e) {
    console.error('ERR', e.message)
    process.exit(1)
  }
})()
