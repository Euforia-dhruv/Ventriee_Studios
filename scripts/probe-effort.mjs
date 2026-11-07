/**
 * Can a Deploy thinking model be told to answer instead of plan? Sends the same
 * shape of request the worker path sends, with different effort controls.
 *
 * Run: node scripts/probe-effort.mjs
 */
const KEY = process.env.DEPLOY_API_KEY
const BASE = 'https://api-sf1-cdn.deploy.com/api/v1'

const filler = Array.from({ length: 12 }, (_, i) => `- Requirement ${i + 1}: the interface must stay usable and the build must pass.`).join('\n')
const prompt = `# Flow check: UI/UX Designer

## 1. Objective
Design the studio marketing site.

## 2. Requirements
${filler}

## 3. Features
Landing page, pricing, docs.

## 4. UI/UX
Restrained palette, one accent.

## 5. Architecture
Static site.

## 6. Stack
HTML and CSS.

## 7. Backend
None.

## 8. Database
None.

## 9. API
None.

## 10. Security
Escape user text.

## 11. Implementation
Write docs/design-system.md.

## 12. Testing / acceptance
The file exists and lists tokens for colour, type and spacing.

Memory: prior lessons about restrained palettes.
Team: Ada (orchestrator), Vera (reviewer).
Skills: webapp-testing.

Reply with the deliverable as === FILE: path === blocks and nothing else outside them.`

async function run(model, effort, maxTokens) {
  const started = Date.now()
  const body = {
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: 'You are the studio UI/UX designer. Respect accessibility and avoid templated layouts.' },
      { role: 'user', content: prompt }
    ]
  }
  if (effort) body.reasoning_effort = effort
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000)
  })
  if (!res.ok) return { effort, status: res.status, detail: (await res.text()).slice(0, 120) }
  let text = ''
  let reasoning = ''
  let finish = null
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
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const data = t.slice(5).trim()
      if (data === '[DONE]') continue
      let json
      try { json = JSON.parse(data) } catch { continue }
      const choice = json.choices?.[0]
      if (choice?.finish_reason) finish = choice.finish_reason
      const d = choice?.delta ?? {}
      if (typeof d.content === 'string') text += d.content
      if (typeof d.reasoning === 'string') reasoning += d.reasoning
      if (typeof d.reasoning_content === 'string') reasoning += d.reasoning_content
    }
  }
  return {
    effort: effort ?? 'absent',
    secs: Math.round((Date.now() - started) / 1000),
    finish,
    content: text.length,
    reasoning: reasoning.length,
    files: (text.match(/=== FILE:/g) ?? []).length
  }
}

for (const model of ['deepseek-ai/deepseek-v4.1-flash-1017', 'zai-org/glm-5.3-flash']) {
  for (const effort of ['none', 'low', 'minimal']) {
    try {
      console.log(model, JSON.stringify(await run(model, effort, 4000)))
    } catch (error) {
      console.log(model, effort, 'failed:', error.message)
    }
  }
}
