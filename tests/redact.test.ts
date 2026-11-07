import { describe, expect, it } from 'vitest'
import { redact, trimChunk, MAX_OUTPUT_CHUNK } from '../src/main/redact'

describe('redact', () => {
  it('removes a stored credential value verbatim', () => {
    const key = 'stored-key-1234567890abcdef'
    expect(redact(`using ${key} now`, [key])).toBe('using «redacted» now')
  })

  it('ignores values too short to be a real key', () => {
    // A 3-char "secret" would otherwise redact every occurrence of it.
    expect(redact('a cat sat', ['cat'])).toBe('a cat sat')
  })

  it('catches provider-shaped keys an agent prints itself', () => {
    expect(redact('OPENAI=sk-abcdefghijklmnopqrstuvwx')).toBe('OPENAI=sk-«redacted»')
    expect(redact('gh token ghp_abcdefghijklmnopqrstuvwxyz12')).toContain('«redacted»')
    expect(redact('aws AKIAABCDEFGHIJKLMNOP')).toContain('AKIA«redacted»')
    expect(redact('authorization: Bearer abcdefghijklmnopqrstuv')).toBe(
      'authorization: Bearer «redacted»'
    )
    expect(redact('https://x.test/v1?api_key=abcdefghijkl&z=1')).toBe(
      'https://x.test/v1?api_key=«redacted»&z=1'
    )
  })

  it('redacts a secret-looking JSON field', () => {
    expect(redact('{"apiKey":"abcdefghijklmnop","model":"x"}')).toBe(
      '{"apiKey":"«redacted»","model":"x"}'
    )
  })

  it('leaves ordinary prose alone', () => {
    const prose = 'The build passed in 4.2s and all 17 tests are green.'
    expect(redact(prose, [])).toBe(prose)
    expect(redact('', ['anything-long-enough'])).toBe('')
  })
})

describe('trimChunk', () => {
  it('passes short chunks through', () => {
    expect(trimChunk('hello')).toBe('hello')
  })

  it('caps a runaway stream and says so', () => {
    const out = trimChunk('x'.repeat(MAX_OUTPUT_CHUNK + 500))
    expect(out.length).toBeLessThan(MAX_OUTPUT_CHUNK + 40)
    expect(out.endsWith('truncated')).toBe(true)
  })
})
