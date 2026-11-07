/**
 * Reproduces a real worker request outside the app: same task brief as the
 * failing run, same file-block rules, same streaming body. Prints whether the
 * model answered or spent its budget thinking.
 *
 * Run: node scripts/probe-real-task.mjs <path-to-ventriee.db> <model> <maxTokens>
 */
import { DatabaseSync } from 'node:sqlite'

const [, , dbPath, model, capArg, effort, variant] = process.argv
const cap = Number(capArg ?? 16000)
const lean = variant === 'lean'
const KEY = process.env.DEPLOY_API_KEY
const BASE = 'https://api-sf1-cdn.deploy.com/api/v1'
if (!KEY) throw new Error('DEPLOY_API_KEY not set')

const db = new DatabaseSync(dbPath)
const task = db.prepare("select title, description, acceptance, phase from tasks where role = 'frontend'").get()
if (!task) throw new Error('no frontend task in that database')

const rules = `1. You cannot run commands or touch disk. The studio writes your files for you.
2. Deliver every file as a block in this exact form, and nothing else inside the block:
=== FILE: path/relative/to/workspace ===
<complete file content>
=== END FILE ===
3. Emit the complete file, never a diff, an excerpt or a description of it.
4. Use only relative paths inside the workspace. Never absolute paths, never ..
5. Never include secrets. Never propose destructive operations.
6. After the blocks, state what each file is for and anything the next worker needs.`

const prompt = `# Task: ${task.title}

You are Kai, Frontend Developer at Ventriee Studios, working on the project "Flow check" inside the workspace.

## Task
${task.description}

## Acceptance criteria
${task.acceptance}

## Phase
${task.phase}

## Prior deliverables
(this is the first task in the chain)

## Teammates (use them instead of guessing)
${['Ada (orchestrator, Orchestrator)', 'Noor (researcher, Researcher)', 'Soren (architect, Product Architect)', 'Iris (designer, UI/UX Designer)', 'Mira (integration, Integration Developer)', 'Dario (backend, Backend Developer)', 'Vera (reviewer, Code Reviewer)', 'Rook (fixer, Bug Fixer)', 'Juno (qa, QA Engineer)', 'Lena (seo, SEO Specialist)', 'Oren (aeo, AEO/GEO Specialist)', 'Sable (deployment, Deployment Engineer)', 'Tess (monitoring, Monitoring Engineer)'].join('\n')}

## Available skills
(none installed)

## Owner and project memory
(none)

## Unread messages addressed to you
(none)

## Rules
${rules}
${variant === 'directive' ? '\nBegin your reply with the first === FILE: block immediately. Do not narrate a plan or restate the task.\n' : ''}
${variant === 'slice' ? '\n## Your slice\nYou are one worker on a team. Implement only your role\'s part, as the smallest complete working version: at most 6 files. Do not design the whole product, do not weigh alternative stacks, and do not restate the brief. Pick the simplest option for anything unspecified and start writing files.\n' : ''}
`

console.log(`brief chars: ${task.description.length} | prompt chars: ${prompt.length} | max_tokens: ${cap} | model: ${model}`)

const started = Date.now()
const res = await fetch(`${BASE}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: cap,
    ...(effort ? { reasoning_effort: effort } : {}),
    messages: [
      {
        role: 'system',
        content: lean
          ? 'You are Kai, Frontend Developer. You cannot run commands. Deliver complete files as blocks.'
          : 'Build the client exactly against the agreed API contract and design system. Ship working interactions, real state handling, error states and responsive layouts. Run the typecheck and build before claiming completion.'
      },
      { role: 'user', content: prompt }
    ]
  }),
  signal: AbortSignal.timeout(1_500_000)
})
if (!res.ok) {
  console.log(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
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

console.log(JSON.stringify({
  secs: Math.round((Date.now() - started) / 1000),
  finish,
  content: text.length,
  reasoning: reasoning.length,
  out,
  files: (text.match(/=== FILE:/g) ?? []).length
}))

// The tail tells a loop apart from a long plan: a loop repeats the same words.
const { writeFileSync } = await import('node:fs')
writeFileSync('artifacts/reasoning.txt', reasoning)
console.log('--- reasoning head ---')
console.log(reasoning.slice(0, 400).replace(/\s+/g, ' '))
console.log('--- reasoning tail ---')
console.log(reasoning.slice(-700).replace(/\s+/g, ' '))
