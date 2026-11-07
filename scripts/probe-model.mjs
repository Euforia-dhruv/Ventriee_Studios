// One-shot probe: does a thinking model ever emit content, or only reasoning?
const model = process.argv[2] ?? 'qwen3.5:4b'
const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model,
    stream: true,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: 'You are a frontend developer.' },
      {
        role: 'user',
        content:
          'Reply with exactly one file block and nothing outside it:\n=== FILE: index.html ===\n<!doctype html><h1>hi</h1>'
      }
    ]
  })
})
let content = ''
let reasoning = ''
let finish = null
const reader = res.body.getReader()
const dec = new TextDecoder()
let buf = ''
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buf += dec.decode(value, { stream: true })
  const lines = buf.split('\n')
  buf = lines.pop()
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    const ev = JSON.parse(payload)
    const d = ev.choices?.[0]?.delta ?? {}
    if (d.content) content += d.content
    if (d.reasoning) reasoning += d.reasoning
    if (d.reasoning_content) reasoning += d.reasoning_content
    if (ev.choices?.[0]?.finish_reason) finish = ev.choices[0].finish_reason
  }
}
console.log('model:', model, 'finish:', finish)
console.log('content chars:', content.length, '| reasoning chars:', reasoning.length)
console.log('content head:', JSON.stringify(content.slice(0, 200)))
console.log('reasoning tail:', JSON.stringify(reasoning.slice(-300)))
