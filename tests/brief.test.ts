import { describe, expect, it } from 'vitest'
import { SECTIONS, ensureSections, scopeToRole, DELIVERABLE_BY_ROLE } from '../src/main/brief'
import { ROLE_TEMPLATES } from '../src/main/roles'

const headings = (body: string) => [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim())

describe('development brief sections', () => {
  it('promotes a bold section line to a real heading', () => {
    const out = ensureSections('**Objective**\n\nA dashboard.\n\n**Requirements**\n\nAuth.')
    expect(headings(out)).toContain('Objective')
    expect(headings(out)).toContain('Requirements')
    expect(out).not.toContain('**Objective**')
    expect(out).toContain('A dashboard.')
  })

  it('tolerates a heading that is already correct, and a colon suffix', () => {
    const out = ensureSections('## Objective: things\n\ntext\n\n### Technology Stack\n\nNode.')
    expect(headings(out)).toContain('Objective')
    expect(headings(out)).toContain('Technology Stack')
  })

  it('adds every missing section as unanswered, inventing nothing', () => {
    const out = ensureSections('## Objective\n\nOnly this one was written.')
    const found = headings(out)
    for (const section of SECTIONS) expect(found).toContain(section)
    expect(out.match(/Not specified in the conversation yet\./g)).toHaveLength(SECTIONS.length - 1)
    expect(out).toContain('Only this one was written.')
  })

  it('does not add a section twice when the model used the exact heading', () => {
    const body = SECTIONS.map((s) => `## ${s}\n\ncontent`).join('\n\n')
    const out = ensureSections(body)
    expect(headings(out)).toEqual(SECTIONS)
    expect(out).not.toContain('Not specified')
  })

  it('does not treat bold prose as a section or a heading', () => {
    const out = ensureSections('**Important:** this is an aside, not a heading.')
    expect(out).toContain('**Important:** this is an aside, not a heading.')
    expect(headings(out)).toEqual(SECTIONS)
  })
})

describe('scoping the brief to a role', () => {
  const body = [
    '## Objective',
    'Build a task board.',
    '## Requirements',
    'Add and complete tasks.',
    '## UI/UX Direction',
    'Restrained palette.',
    '## Backend Requirements',
    'None.',
    '## API Requirements',
    'GET /tasks.',
    '## Security Requirements',
    'Escape user text.'
  ].join('\n\n')

  // A designer answering the backend and API sections burned its budget on work
  // that belongs to other workers, and got it wrong.
  it('gives the designer the design sections only', () => {
    const out = scopeToRole(body, 'designer')
    expect(headings(out)).toEqual(['Objective', 'Requirements', 'UI/UX Direction'])
    expect(out).not.toContain('GET /tasks.')
  })

  it('keeps the backend sections the backend owns', () => {
    const out = scopeToRole(body, 'backend')
    expect(headings(out)).toContain('Backend Requirements')
    expect(headings(out)).toContain('API Requirements')
    expect(headings(out)).toContain('Security Requirements')
    expect(out).not.toContain('Restrained palette.')
  })

  it('returns the whole brief for a role with no mapping', () => {
    expect(scopeToRole(body, 'orchestrator')).toBe(body)
  })

  it('returns the whole brief when it has no recognisable headings', () => {
    const flat = 'Build a task board with add, complete and delete.'
    expect(scopeToRole(flat, 'designer')).toBe(flat)
  })
})

describe('naming the deliverable', () => {
  // Run #22: Iris was told only to "deliver your part of the prompt" and produced
  // 147k characters across three sessions without ever finishing. A named file is
  // what lets a worker know it is done.
  it('gives every role that writes code somewhere specific to put it', () => {
    const missing = ROLE_TEMPLATES.filter((r) => r.writesCode && !DELIVERABLE_BY_ROLE[r.role])
    expect(missing.map((r) => r.role)).toEqual([])
  })

  it('names the design system for the designer', () => {
    expect(DELIVERABLE_BY_ROLE.designer).toBe('docs/design-system.md')
  })

  // Run #23: the designer was offered the artifact skills and shipped a 54k-character
  // HTML showcase instead of the doc. The skill that names the deliverable has to be
  // the one bound to the role.
  it('binds the designer to the design-system skill, not the artifact ones', () => {
    const skills = ROLE_TEMPLATES.find((r) => r.role === 'designer')!.skills
    expect(skills).toContain('design-system')
    expect(skills).not.toContain('canvas-design')
    expect(skills).not.toContain('banner-design')
    expect(skills).not.toContain('slides')
  })
})
