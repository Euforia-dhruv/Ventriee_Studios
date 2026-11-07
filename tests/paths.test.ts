import { describe, expect, it } from 'vitest'
import { join, resolve, sep } from 'node:path'
import { isInside } from '../src/main/paths'

const root = resolve('D:/work/client-site')

describe('isInside', () => {
  it('accepts the root itself and files under it', () => {
    expect(isInside(root, root)).toBe(true)
    expect(isInside(root, join(root, 'src', 'app.tsx'))).toBe(true)
  })

  it('rejects a sibling directory that shares the name prefix', () => {
    // The bug this guards: D:\work\client-site-evil starts with D:\work\client-site.
    expect(isInside(root, resolve('D:/work/client-site-evil'))).toBe(false)
    expect(isInside(root, resolve('D:/work/client-site-evil/steal.txt'))).toBe(false)
  })

  it('rejects traversal out of the root', () => {
    expect(isInside(root, join(root, '..', 'other'))).toBe(false)
    expect(isInside(root, join(root, 'src', '..', '..', 'other'))).toBe(false)
  })

  it('rejects empty input instead of claiming containment', () => {
    expect(isInside('', root)).toBe(false)
    expect(isInside(root, '')).toBe(false)
  })

  it('is not fooled by the separator suffix of the root', () => {
    expect(isInside(`${root}${sep}`, join(root, 'a'))).toBe(true)
  })
})
