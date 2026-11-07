/**
 * How much output budget does a thinking model need before it actually answers?
 * Sends the same tiny deliverable request at two caps and reports what came back.
 *
 * Run: node scripts/probe-budget.mjs
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

async function attempt(model, maxTokens) {
  const started = Date.now()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(300_000)
  })
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }
  const body = await res.json()
  const choice = body.choices?.[0]
  const content = choice?.message?.content ?? ''
  const reasoning = choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? ''
  return {
    ok: true,
    secs: Math.round((Date.now() - started) / 1000),
    finish: choice?.finish_reason,
    content: content.length,
    reasoning: reasoning.length,
    out: body.usage?.completion_tokens,
    head: content.trim().slice(0, 60)
  }
}

for (const model of ['deepseek-ai/deepseek-v4.1-flash-1017', 'zai-org/glm-5.3-flash']) {
  for (const cap of [8000, 16000]) {
    console.log(`${model} max_tokens=${cap}`)
    try {
      console.log(' ', JSON.stringify(await attempt(model, cap)))
    } catch (error) {
      console.log('  failed:', error.message)
    }
  }
}
