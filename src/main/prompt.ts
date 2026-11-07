/**
 * Sessions are pipe-based: stdin is closed, there is no terminal to answer a
 * question on. A CLI that stops to ask one will hang until the timeout, so it is
 * detected and failed fast with a message the owner can act on instead.
 *
 * Deliberately narrow: only unmistakable question prompts, anchored to the end
 * of a line, so a log line that merely mentions the word "confirm" is ignored.
 */
const PROMPTS = [
  /do you want to (?:proceed|continue|allow)\b[^\n]*\?/i,
  /press (?:any key|enter|return)\b/i,
  /\by\/n\b[^\n]*$/i,
  /\[(?:y\/n|Y\/n|y\/N)\]\s*$/,
  /\(yes\/no\)\s*$/i,
  /enter (?:your |the )?(?:api key|token|password|name|value)\b[^\n]*:?\s*$/i,
  /(?:select|choose) (?:an? )?(?:option|model|provider)\b[^\n]*:?\s*$/i
]

/** The matched prompt text, or null. Only the last two lines are inspected. */
export function detectInteractivePrompt(text: string): string | null {
  const tail = text.slice(-400)
  for (const line of tail.split(/\r?\n/).slice(-2)) {
    for (const pattern of PROMPTS) {
      const match = pattern.exec(line.trim())
      if (match) return line.trim().slice(0, 120)
    }
  }
  return null
}
