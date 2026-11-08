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
    const started = Date.now()
    const snap = await ev(`window.ventriee.snapshot().then(s => JSON.stringify({
      models: s.models.length,
      visible: s.models.filter(m => m.configured || m.note).length,
      deploy: s.models.filter(m => m.provider === 'api-deploy' && (m.configured || m.note)).map(m => m.model),
      inception: s.models.filter(m => m.provider === 'api-inception' && (m.configured || m.note)).map(m => m.model)
    }))`)
    console.log('SNAP after', (Date.now() - started) + 'ms', snap)
    ws.close()
  } catch (e) {
    console.error('ERR', e.message)
    process.exit(1)
  }
})()
