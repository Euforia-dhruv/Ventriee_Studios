import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSkill } from '../src/main/skills'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function skillFile(frontmatter: string) {
  const root = mkdtempSync(join(tmpdir(), 'ventriee-skill-'))
  roots.push(root)
  const file = join(root, 'SKILL.md')
  writeFileSync(file, frontmatter, 'utf8')
  return file
}

describe('parseSkill', () => {
  it('reads name, description and version from a LF skill', () => {
    const file = skillFile('---\nname: hallmark\ndescription: Looks designed.\nversion: 2.0.0\n---\n\n# Hallmark\n')
    const skill = parseSkill(file, 'hallmark')
    expect(skill.id).toBe('hallmark')
    expect(skill.description).toBe('Looks designed.')
    expect(skill.version).toBe('2.0.0')
  })

  it('reads a CRLF skill, which is how most imported repos store them', () => {
    // Regression: a \n-only pattern matched nothing here, so 51 of the 65 bundled
    // skills registered with a folder-derived id and a blank description.
    const file = skillFile('---\r\nname: tdd\r\ndescription: Test first.\r\nversion: 1.1.0\r\n---\r\n\r\n# TDD\r\n')
    const skill = parseSkill(file, 'tdd')
    expect(skill.id).toBe('tdd')
    expect(skill.name).toBe('tdd')
    expect(skill.description).toBe('Test first.')
    expect(skill.version).toBe('1.1.0')
  })
})
