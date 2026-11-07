import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deliverFiles } from '../src/main/deliver'

const roots: string[] = []
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'ventriee-deliver-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('file block delivery', () => {
  it('writes one file per block, creating folders', () => {
    const root = workspace()
    const text = [
      'Here is the work.',
      '=== FILE: src/app.ts ===',
      "export const ok = true",
      '=== END FILE ===',
      '=== FILE: docs/notes.md ===',
      '# Notes',
      '=== END FILE ==='
    ].join('\n')
    expect(deliverFiles(root, text)).toEqual(['src/app.ts', 'docs/notes.md'])
    expect(readFileSync(join(root, 'src', 'app.ts'), 'utf8')).toBe('export const ok = true\n')
    expect(readFileSync(join(root, 'docs', 'notes.md'), 'utf8')).toBe('# Notes\n')
  })

  it('refuses to escape the workspace or write into node_modules', () => {
    const root = workspace()
    const text = [
      '=== FILE: ../escape.txt ===',
      'nope',
      '=== END FILE ===',
      '=== FILE: C:\\Windows\\evil.txt ===',
      'nope',
      '=== END FILE ===',
      '=== FILE: /etc/passwd ===',
      'nope',
      '=== END FILE ===',
      '=== FILE: node_modules/x/index.js ===',
      'nope',
      '=== END FILE ===',
      '=== FILE: .git/config ===',
      'nope',
      '=== END FILE ==='
    ].join('\n')
    expect(deliverFiles(root, text)).toEqual([])
    expect(existsSync(join(root, '..', 'escape.txt'))).toBe(false)
    expect(existsSync(join(root, 'node_modules'))).toBe(false)
  })

  it('ignores an unterminated block and empty bodies', () => {
    const root = workspace()
    expect(deliverFiles(root, '=== FILE: a.txt ===\n\n=== END FILE ===')).toEqual([])
    expect(deliverFiles(root, 'no blocks at all')).toEqual([])
  })

  it('keeps inner lines that look like markdown fences', () => {
    const root = workspace()
    const text = '=== FILE: a.md ===\n```ts\nconst x = 1\n```\n=== END FILE ==='
    expect(deliverFiles(root, text)).toEqual(['a.md'])
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toContain('```ts')
  })

  it('accepts a fenced block whose path is in the info string', () => {
    const root = workspace()
    const text = 'Here you go:\n```js src/main.js\nconsole.log(1)\n```\n'
    expect(deliverFiles(root, text)).toEqual(['src/main.js'])
    expect(readFileSync(join(root, 'src', 'main.js'), 'utf8')).toBe('console.log(1)\n')
  })

  it('refuses a banner comment as a filename', () => {
    // Regression: a CSS banner (`/* ===== */`) was read as the path, so the run of
    // '=' was written as a real file and the actual stylesheet was lost.
    const root = workspace()
    const text = ['```css', '/* ================================================ */', ':root { --accent: #a78bfa }', '```'].join(
      '\n'
    )
    expect(deliverFiles(root, text)).toEqual([])
    expect(existsSync(join(root, '================================================'))).toBe(false)
  })

  it('accepts a fenced block whose path is a leading comment', () => {
    const root = workspace()
    expect(deliverFiles(root, '```css\n/* styles/app.css */\nbody{margin:0}\n```')).toEqual(['styles/app.css'])
    expect(deliverFiles(root, '```py\n# app.py\nprint(1)\n```')).toEqual(['app.py'])
  })

  it('skips a fence with no path rather than guessing a filename', () => {
    const root = workspace()
    expect(deliverFiles(root, '```js\nconst x = 1\n```')).toEqual([])
  })

  it('unwraps a fence around a source file, but keeps markdown fences', () => {
    const root = workspace()
    const text = [
      '=== FILE: src/App.jsx ===',
      '```jsx',
      'export default function App() { return null }',
      '```',
      '=== END FILE ===',
      '=== FILE: README.md ===',
      '```jsx',
      'sample',
      '```',
      '=== END FILE ==='
    ].join('\n')
    expect(deliverFiles(root, text)).toEqual(['src/App.jsx', 'README.md'])
    // Written verbatim this copy does not compile, which is how a reviewer caught it.
    expect(readFileSync(join(root, 'src', 'App.jsx'), 'utf8')).toBe(
      'export default function App() { return null }\n'
    )
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain('```jsx')
  })

  it('refuses the hint\'s own example path', () => {
    // A model copied "path/relative/to/workspace" verbatim, which wrote a junk
    // file named `path` into the owner's workspace.
    const root = workspace()
    expect(deliverFiles(root, '=== FILE: path ===\ncontent\n=== END FILE ===')).toEqual([])
    expect(deliverFiles(root, '=== FILE: path/relative/to/workspace ===\nx\n=== END FILE ===')).toEqual([])
    expect(existsSync(join(root, 'path'))).toBe(false)
  })

  it('prefers explicit markers over fences so code samples are not written out', () => {
    const root = workspace()
    const text = [
      '=== FILE: real.txt ===',
      'actual deliverable',
      '=== END FILE ===',
      'For reference:',
      '```ts config.ts',
      'sample only',
      '```'
    ].join('\n')
    expect(deliverFiles(root, text)).toEqual(['real.txt'])
    expect(existsSync(join(root, 'config.ts'))).toBe(false)
  })
})
