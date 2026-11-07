/** Does a local model follow the file-block contract? One shot, no app involved. */
const ENDPOINT = 'http://127.0.0.1:11434/v1/chat/completions'
const MODEL = process.argv[2] ?? 'gemma4:12b'

const system = `You are Kai, Frontend Developer. You cannot run commands or touch disk. The studio writes your files for you.
Deliver every file as a block in this exact form, and nothing else inside the block:
=== FILE: path/relative/to/workspace ===
<complete file content>
=== END FILE ===`

const prompt = `# Task: build the dashboard shell

Create exactly two files: index.html (a page with an <h1>Usage dashboard</h1> and a link to app.css)
and app.css (body margin 0, dark background). No other files.`

const started = Date.now()
const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    stream: false,
    max_tokens: 900,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  })
})

const body = await res.json()
const text = body.choices?.[0]?.message?.content ?? ''
const blocks = [...text.matchAll(/^=+\s*FILE:\s*(.+?)\s*=+\s*$/gm)].map((m) => m[1])

console.log(`model: ${MODEL}`)
console.log(`took: ${Math.round((Date.now() - started) / 1000)}s`)
console.log(`chars: ${text.length}`)
console.log(`file blocks: ${blocks.length ? blocks.join(', ') : 'NONE'}`)
console.log(`has fence: ${text.includes('\`\`\`')}`)
if (!blocks.length) console.log(`--- head ---\n${text.slice(0, 600)}`)
