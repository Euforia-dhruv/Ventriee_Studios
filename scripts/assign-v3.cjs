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
    const snap = await ev(`window.ventriee.snapshot()`)
    const projectId = snap.activeProjectId
    const prompt = snap.prompts.find((p) => p.version === 3) ?? snap.prompts[snap.prompts.length - 1]
    if (!projectId || !prompt) { console.log('missing project or prompt'); process.exit(1) }

    // Set reasoning Off on deploy/inception workers first so the thinking fix applies.
    for (const a of snap.agents) {
      if (a.engine !== 'cli-opencode' && a.engine !== 'cli-claude') {
        await ev(`window.ventriee.updateAgent(${JSON.stringify(a.id)}, { reasoning: 'none' })`)
      }
    }
    const assigned = await ev(`window.ventriee.assignPrompt({
      projectId: ${JSON.stringify(projectId)},
      promptId: ${JSON.stringify(prompt.id)},
      mode: 'orchestrator'
    })`)
    console.log('ASSIGNED', JSON.stringify({ jobId: assigned.jobId, taskCount: assigned.taskCount, promptId: prompt.id, promptVersion: prompt.version }))
    ws.close()
  } catch (e) {
    console.error('ERR', e.message)
    process.exit(1)
  }
})()
