import { describe, expect, it } from 'vitest'
import { parseVerdict } from '../src/main/review'

describe('parseVerdict', () => {
  it('reads a clean JSON verdict', () => {
    const v = parseVerdict('{"verdict":"pass","reasoning":"all files present","blockers":[]}')
    expect(v.verdict).toBe('pass')
    expect(v.reasoning).toBe('all files present')
    expect(v.blockers).toEqual([])
  })

  it('finds the verdict a CLI reviewer buried in its transcript', () => {
    // The real failure this prevents: the transcript head was stored as the review.
    const raw = [
      '> build · deepseek-v4.1-flash',
      '$ Get-ChildItem -Recurse -Force',
      'docs/design-system.md   3549',
      'Reading the file now.',
      '{"verdict":"fail","reasoning":"only the design doc exists, no UI","blockers":["no page markup"]}'
    ].join('\n')
    const v = parseVerdict(raw)
    expect(v.verdict).toBe('fail')
    expect(v.reasoning).toBe('only the design doc exists, no UI')
    expect(v.blockers).toEqual(['no page markup'])
  })

  it('returns null rather than guessing when no verdict was given', () => {
    const v = parseVerdict('I inspected the workspace and it looks fine to me.')
    expect(v.verdict).toBeNull()
    expect(v.reasoning).toBe('')
  })

  it('survives malformed JSON but still honours a quoted verdict', () => {
    const v = parseVerdict('{"verdict": "fail", "reasoning": "broken')
    expect(v.verdict).toBe('fail')
  })

  it('ignores a non-verdict shape', () => {
    expect(parseVerdict('{"verdict":"maybe","reasoning":"unsure"}').verdict).toBeNull()
  })

  it('recovers the reasoning a malformed object carried', () => {
    // The real failure: a fail verdict with an empty reason showed the owner
    // "Reviewer Vera: fail — " and nothing they could act on.
    const raw = '{"verdict":"fail","reasoning":"Only docs/design-system.md was written; no page markup exists","blockers":["no page markup","no tokens"]'
    const v = parseVerdict(raw)
    expect(v.verdict).toBe('fail')
    expect(v.reasoning).toContain('no page markup exists')
    expect(v.blockers).toEqual(['no page markup', 'no tokens'])
  })

  it('unescapes quotes inside a recovered reasoning string', () => {
    const v = parseVerdict('{"verdict":"pass","reasoning":"The \\"empty state\\" is handled",')
    expect(v.reasoning).toBe('The "empty state" is handled')
  })
})
