/**
 * The app streams with stream_options.include_usage. Non-streaming at the same cap
 * works, so test whether streaming is what turns an answer into reasoning-only.
 *
 * Run: node scripts/probe-stream-budget.mjs
 */
const KEY = process.env.DEPLOY_API_KEY
const BASE = 'https://api-sf1-cdn.deploy.com/api/v1'
if (!KEY) {
  console.log('DEPLOY_API_KEY not set')
  process.exit(1)
}

const prompt = `Reply with exactly one block and nothing else:
=== FILE: hello.txt ===
ventriee-budget-ok
=== END ===`

async function attempt(model, body) {
  const started = Date.now()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, ...body }),
    signal: AbortSignal.timeout(600_000)
  })
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }

  let text = ''
  let reasoning = ''
  let finish = null
  let out = null
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      let json
      try {
        json = JSON.parse(data)
      } catch {
        continue
      }
      const choice = json.choices?.[0]
      if (choice?.finish_reason) finish = choice.finish_reason
      const delta = choice?.delta ?? {}
      if (typeof delta.content === 'string') text += delta.content
      if (typeof delta.reasoning === 'string') reasoning += delta.reasoning
      if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content
      if (json.usage?.completion_tokens) out = json.usage.completion_tokens
    }
  }
  return {
    ok: true,
    secs: Math.round((Date.now() - started) / 1000),
    finish,
    content: text.length,
    reasoning: reasoning.length,
    out,
    head: text.trim().slice(0, 50)
  }
}

const appBody = (maxTokens) => ({
  stream: true,
  stream_options: { include_usage: true },
  max_tokens: maxTokens,
  messages: [{ role: 'system', content: 'You are a frontend developer.' }, { role: 'user', content: prompt }]
})

for (const model of ['deepseek-ai/deepseek-v4.1-flash-1017', 'zai-org/glm-5.3-flash']) {
  for (const cap of [8000, 16000]) {
    console.log(`${model} streaming max_tokens=${cap}`)
    try {
      console.log(' ', JSON.stringify(await attempt(model, appBody(cap))))
    } catch (error) {
      console.log('  failed:', error.message)
    }
  }
}
