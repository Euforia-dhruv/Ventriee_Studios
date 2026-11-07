export interface Verdict {
  verdict: 'pass' | 'fail' | null
  reasoning: string
  blockers: string[]
}

/** Pulls one string field out of JSON a reviewer mangled (unescaped quotes, truncation). */
function field(raw: string, name: string): string {
  const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(raw)
  return match ? match[1].replace(/\\(.)/g, '$1').trim() : ''
}

/**
 * Reviewers answer with one JSON object, but a CLI reviewer wraps it in its own
 * transcript. Store the verdict's reasoning, never the transcript head: the owner
 * reads this to decide what to fix.
 */
export function parseVerdict(raw: string): Verdict {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  let parsed: { verdict?: unknown; reasoning?: unknown; blockers?: unknown } | null = null
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(raw.slice(start, end + 1))
    } catch {
      parsed = null
    }
  }
  const word = String(parsed?.verdict ?? /"verdict"\s*:\s*"(pass|fail)"/i.exec(raw)?.[1] ?? '').toLowerCase()
  // A mangled object still carries the reviewer's own words. Recovering them by
  // field beats storing "Reviewer Vera: fail — " with nothing the owner can act on.
  const reasoning = String(parsed?.reasoning ?? field(raw, 'reasoning')).trim()
  const blockerText = Array.isArray(parsed?.blockers) ? parsed.blockers.map(String) : []
  const listed = /"blockers"\s*:\s*\[((?:[^\]\\\\]|\\\\.)*)\]/.exec(raw)
  const blockers = (blockerText.length ? blockerText : (listed?.[1].match(/"(?:[^"\\\\]|\\\\.)*"/g) ?? []).map((b) => b.slice(1, -1))).slice(0, 8)
  return {
    verdict: word === 'pass' || word === 'fail' ? word : null,
    reasoning,
    blockers
  }
}
