/**
 * Secret redaction for anything that leaves the process: streamed output,
 * stored task output, messages, reviews, logs and error strings.
 *
 * Two layers: known credential values (exact match, since we know the keys the
 * owner stored) and shape-based patterns for keys an agent might print itself.
 */

const PATTERNS: Array<[RegExp, string]> = [
  [/\b(sk|rk)-[A-Za-z0-9_-]{16,}/g, 'sk-«redacted»'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, 'gh«redacted»'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_«redacted»'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA«redacted»'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, 'xox«redacted»'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, 'AIza«redacted»'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, 'Bearer «redacted»'],
  [/([?&](?:api[_-]?key|key|token|access_token)=)[^&\s"']+/gi, '$1«redacted»'],
  [/("(?:api_?key|apiKey|token|secret|password|authorization)"\s*:\s*")[^"]{8,}(")/gi, '$1«redacted»$2']
]

/** Letters/digits and punctuation, long enough that a real key would match. */
const MIN_SECRET_LENGTH = 12

export function redact(text: string, secrets: Array<string | null | undefined> = []): string {
  if (!text) return text
  let out = text
  for (const secret of secrets) {
    if (!secret || secret.length < MIN_SECRET_LENGTH) continue
    // Split/join keeps the work linear and avoids regex-escaping the key.
    out = out.split(secret).join('«redacted»')
  }
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement)
  return out
}

/** Cap a stream buffer so a runaway CLI cannot flatten the renderer. */
export const MAX_OUTPUT_CHUNK = 8000

export function trimChunk(chunk: string): string {
  return chunk.length > MAX_OUTPUT_CHUNK ? `${chunk.slice(0, MAX_OUTPUT_CHUNK)}\n… truncated` : chunk
}
