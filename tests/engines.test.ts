import { describe, expect, it } from 'vitest'
import { parseChatChunk } from '../src/main/engines'

describe('streamed chat chunks', () => {
  it('reads ordinary content and usage', () => {
    const delta = parseChatChunk(
      JSON.stringify({ choices: [{ delta: { content: 'hello' } }], usage: { prompt_tokens: 9, completion_tokens: 3 } })
    )
    expect(delta).toEqual({ text: 'hello', reasoning: '', inTok: 9, outTok: 3, finish: null })
  })

  // A reply cut off by max_tokens still looks like a normal success: every chunk
  // parses, there is just less of it. Only finish_reason tells the two apart, and
  // without it the studio delivered a half-written file as complete.
  it('surfaces finish_reason so a truncated reply can be refused', () => {
    const delta = parseChatChunk(
      JSON.stringify({ choices: [{ delta: { content: ':root {' }, finish_reason: 'length' }] })
    )
    expect(delta?.finish).toBe('length')
  })

  it('reports a normal stop as finish stop', () => {
    const delta = parseChatChunk(JSON.stringify({ choices: [{ delta: { content: '}' }, finish_reason: 'stop' }] }))
    expect(delta?.finish).toBe('stop')
  })

  // A thinking model that spends its whole budget planning used to return "" and fail
  // the evidence gate, so the reasoning stream has to survive the parser.
  it('keeps reasoning when the model streams no content', () => {
    const delta = parseChatChunk(JSON.stringify({ choices: [{ delta: { reasoning: 'I will plan first' } }] }))
    expect(delta?.text).toBe('')
    expect(delta?.reasoning).toBe('I will plan first')
  })

  it('accepts the reasoning_content spelling', () => {
    expect(parseChatChunk(JSON.stringify({ choices: [{ delta: { reasoning_content: 'x' } }] }))?.reasoning).toBe('x')
  })

  it('ignores keepalive fragments instead of throwing', () => {
    expect(parseChatChunk('not json')).toBeNull()
    expect(parseChatChunk('')).toBeNull()
  })

  it('reports missing usage as null, not zero', () => {
    const delta = parseChatChunk(JSON.stringify({ choices: [{ delta: { content: 'a' } }] }))
    expect(delta?.inTok).toBeNull()
    expect(delta?.outTok).toBeNull()
  })
})
