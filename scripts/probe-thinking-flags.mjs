/**
 * These Deploy models think without bound and ignore reasoning_effort, so a
 * worker prompt can spend the whole output budget reasoning. This tries the
 * flags DeepSeek/GLM actually document for turning thinking off.
 *
 * Run: node scripts/probe-thinking-flags.mjs <path-to-ventriee.db> <model>
 */
import { DatabaseSync } from 'node:sqlite'

const [, , dbPath, model] = process.argv
const KEY = process.env.DEPLOY_API_KEY
const BASE = 'https://api-sf1-cdn.deploy.com/api/v1'
if (!KEY) throw new Error('DEPLOY_API_KEY not set')

const db = new DatabaseSync(dbPath)
const task = db.prepare("select title, description, acceptance, phase from tasks where role = 'frontend'").get()

const prompt = `# Task: ${task.title}

## Task
${task.description}

## Acceptance criteria
${task.acceptance}

## Rules
1. You cannot run commands or touch disk. The studio writes your files for you.
2. Deliver every file as a block: === FILE: path === / content / === END FILE ===
3. Emit complete files, never descriptions.`

const VARIANTS = [
  ['baseline', {}],
  ['thinking-disabled', { thinking: { type: 'disabled' } }],
  ['enable_thinking-false', { enable_thinking: false }],
  ['chat_template_kwargs', { chat_template_kwargs: { enable_thinking: false } }]
]

for (const [label, extra] of VARIANTS) {
  const started = Date.now()
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
        ...extra
      }),
      signal: AbortSignal.timeout(600_000)
    })
    if (!res.ok) {
      console.log(`${label}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`)
      continue
    }
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
        if (json.usage?.completion_tokens) out = json.usage.completion_tokens
      }
    }
    console.log(
      `${label}: ${JSON.stringify({
        secs: Math.round((Date.now() - started) / 1000),
        finish,
        content: text.length,
        reasoning: reasoning.length,
        out
      })}`
    )
  } catch (error) {
    console.log(`${label}: failed ${error.message}`)
  }
}
