/**
 * Worker sessions send a full twelve-section brief, not a one-liner. This measures
 * whether a realistic prompt makes the model spend its whole output budget thinking.
 *
 * Run: node scripts/probe-brief-budget.mjs [maxTokens]
 */
const KEY = process.env.DEPLOY_API_KEY
const BASE = 'https://api-sf1-cdn.deploy.com/api/v1'
if (!KEY) {
  console.log('DEPLOY_API_KEY not set')
  process.exit(1)
}

const brief = `# Build a small task board

## 1. Objective
A single-page task board that lets one person add, complete and delete tasks, persisted in localStorage.

## 2. Requirements
- Add a task with a title and optional due date.
- Mark complete, delete, and filter by all/open/done.
- Keyboard operable; visible focus; no colour-only status.

## 3. Features
Create, complete, delete, filter, clear completed, empty states.

## 4. UI/UX
Two-column layout on desktop, one on mobile. Restrained palette, one accent. Empty state explains the next action.

## 5. Architecture
No framework. index.html, styles.css, app.js with a small state module and render function.

## 6. Stack
Vanilla HTML, CSS, ES modules served statically. No build step.

## 7. Backend
None. All state in localStorage under a versioned key.

## 8. Database
None. Storage shape: { version: 1, tasks: [{ id, title, due, done, createdAt }] }.

## 9. API
None. Internal module API: addTask, toggleTask, removeTask, clearCompleted, listTasks(filter).

## 10. Security
Escape all user text before rendering. Never inject innerHTML with raw input.

## 11. Implementation
1. index.html skeleton with regions.
2. styles.css with tokens and responsive layout.
3. app.js state, storage, render, and event wiring.
4. Verify in a browser.

## 12. Testing / acceptance
- Adding a task shows it immediately and survives reload.
- Completing and filtering behave.
- Deleting removes it from storage.
- Keyboard-only flow works end to end.`

const prompt = `${brief}

You are the UI/UX Designer for this project.

Define the visual direction, tokens and component specifications. Write them to docs/design-system.md.

Reply with the deliverable as === FILE: path === blocks and nothing else outside them.`

async function stream(model, maxTokens) {
  const started = Date.now()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: 'You are the studio UI/UX designer. Respect accessibility and avoid templated layouts.' },
        { role: 'user', content: prompt }
      ]
    }),
    signal: AbortSignal.timeout(900_000)
  })
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}` }

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
  return {
    ok: true,
    secs: Math.round((Date.now() - started) / 1000),
    finish,
    content: text.length,
    reasoning: reasoning.length,
    out,
    files: (text.match(/=== FILE:/g) ?? []).length
  }
}

const model = 'zai-org/glm-5.3-flash'
for (const cap of (process.argv[2] ? [Number(process.argv[2])] : [8000, 32000])) {
  console.log(`${model} brief-sized prompt, max_tokens=${cap}`)
  try {
    console.log(' ', JSON.stringify(await stream(model, cap)))
  } catch (error) {
    console.log('  failed:', error.message)
  }
}
