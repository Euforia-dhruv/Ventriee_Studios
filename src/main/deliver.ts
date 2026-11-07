import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { isInside } from './paths'

/**
 * An API model cannot run tools, so it cannot touch disk on its own. It is asked
 * to emit file blocks and the studio writes them. Paths that escape the workspace
 * are refused outright, never clamped, and nothing inside node_modules or .git
 * is ever written.
 */
export const FILE_BLOCK_HINT = `## Delivering files

You cannot run commands, so deliver every file you create or change as a block in exactly this form:

=== FILE: src/app.ts ===
<complete file content>
=== END FILE ===

The studio writes these blocks into the workspace for you. Use paths relative to the workspace root,
emit the complete file (not a diff or an excerpt), and do not put anything else inside a block.
The path above is an example, not a literal path: never emit it as a filename.`

const MARKER = /^=+\s*FILE:\s*/im
const END = /^=+\s*END FILE/im
const FORBIDDEN = /(^|[\\/])(node_modules|\.git)([\\/]|$)/

/**
 * Models often reach for a fenced block with the path in the info string or the
 * first line of the comment. That is determinate, so it is accepted too. A fence
 * with no path anywhere is skipped: guessing which file it belongs to would write
 * the wrong thing.
 */
function fencedBlocks(text: string): Array<{ rel: string; body: string }> {
  const out: Array<{ rel: string; body: string }> = []
  const fence = /^```[^\n]*\n([\s\S]*?)^```\s*$/gm
  for (const match of text.matchAll(fence)) {
    const open = match[0].slice(0, match[0].indexOf('\n')).replace(/^```/, '').trim()
    const lines = match[1].split('\n')
    const infoPath = open.split(/\s+/).find((part) => /[\\/]/.test(part) || /\.[a-z0-9]{1,8}$/i.test(part))
    const comment = lines[0]?.trim().match(/^(?:\/\/|#|<!--|\/\*)\s*([^\s*]+)[\s*>/!,-]*$/)
    // A CSS banner (`/* ===== */`) or a `# ---` rule reads as a comment, and its
    // run of punctuation is not a filename. Writing it puts junk in the workspace
    // and loses the real file, so a comment path must look like a path.
    const commentPath = comment?.[1] && (/[\\/]/.test(comment[1]) || /\.[a-z0-9]{1,8}$/i.test(comment[1]))
      ? comment[1]
      : undefined
    const rel = infoPath ?? commentPath
    if (!rel) continue
    const body = infoPath ? match[1] : lines.slice(1).join('\n')
    out.push({ rel, body })
  }
  return out
}

function safePath(rel: string): boolean {
  return (
    Boolean(rel) &&
    !rel.includes('..') &&
    !/^[\\/]/.test(rel) &&
    !/^[a-zA-Z]:/.test(rel) &&
    !FORBIDDEN.test(rel) &&
    // Models copy the hint's example path verbatim. Writing a file literally
    // named `path` is junk in the owner's workspace, not a delivery.
    !/^path([\\/]|$)/i.test(rel)
  )
}

/**
 * Models often wrap a file body in a fenced block even when the file is source.
 * Written verbatim that copy does not compile (a reviewer caught exactly this), so
 * a body that is one fence from top to bottom is unwrapped. Markdown is exempt:
 * there the fences are real content.
 */
const WRAPPED = /^```[^\n]*\n([\s\S]*?)\n?```$/
const MARKDOWN = /\.(md|mdx|markdown)$/i

function unwrapFence(rel: string, body: string): string {
  if (MARKDOWN.test(rel)) return body
  return body.trim().match(WRAPPED)?.[1] ?? body
}

function write(root: string, rel: string, body: string, written: string[]) {
  const base = resolve(root)
  const target = resolve(base, rel)
  if (!target.startsWith(base + sep) || !body.trim()) return
  try {
    // Refuse to write through a symlink: a link inside the workspace may point
    // outside it, and writeFileSync would happily follow it.
    try {
      if (lstatSync(target).isSymbolicLink()) return
    } catch {
      /* target does not exist yet */
    }
    mkdirSync(dirname(target), { recursive: true })
    // The parent directory itself could be a symlink to elsewhere.
    if (!isInside(base, realpathSync(dirname(target)))) return
    writeFileSync(target, `${unwrapFence(rel, body).trimEnd()}\n`, 'utf8')
    written.push(rel.replace(/\\/g, '/'))
  } catch {
    /* an unwritable path is not delivered; the evidence check will say so */
  }
}

export function deliverFiles(root: string, text: string): string[] {
  const written: string[] = []

  for (const part of text.split(MARKER).slice(1)) {
    const newline = part.indexOf('\n')
    if (newline < 0) continue
    const rel = part.slice(0, newline).replace(/=+\s*$/, '').trim()
    if (!safePath(rel)) continue
    let body = part.slice(newline + 1)
    const end = body.search(END)
    if (end >= 0) body = body.slice(0, end)
    write(root, rel, body, written)
  }

  if (!written.length) {
    for (const block of fencedBlocks(text)) {
      if (safePath(block.rel)) write(root, block.rel, block.body, written)
    }
  }

  return written
}
