/**
 * The development brief is a contract with the owner: these sections, in this order.
 * Small models do not always obey it, so the document is normalised rather than
 * trusted. Nothing is invented: a section the model skipped is marked as unanswered.
 */
export const SECTIONS = [
  'Objective',
  'Requirements',
  'Features',
  'UI/UX Direction',
  'Technical Architecture',
  'Technology Stack',
  'Backend Requirements',
  'Database Requirements',
  'API Requirements',
  'Security Requirements',
  'Implementation Instructions',
  'Testing and Acceptance Criteria'
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const BY_KEY = new Map(SECTIONS.map((s) => [norm(s), s]))

/**
 * Which sections of the brief a role actually needs. Handing every worker the
 * whole document made a designer answer questions about auth, billing and
 * analytics that belong to other workers, and burn its budget on them.
 * A role missing here gets the whole brief.
 */
const SECTIONS_BY_ROLE: Record<string, string[]> = {
  designer: ['Objective', 'Requirements', 'Features', 'UI/UX Direction', 'Technology Stack'],
  frontend: ['Objective', 'Requirements', 'Features', 'UI/UX Direction', 'Technology Stack', 'Implementation Instructions', 'Testing and Acceptance Criteria'],
  backend: [
    'Objective',
    'Requirements',
    'Technical Architecture',
    'Technology Stack',
    'Backend Requirements',
    'Database Requirements',
    'API Requirements',
    'Security Requirements',
    'Implementation Instructions',
    'Testing and Acceptance Criteria'
  ],
  integration: ['Objective', 'Technical Architecture', 'Backend Requirements', 'API Requirements', 'Security Requirements', 'Testing and Acceptance Criteria'],
  architect: ['Objective', 'Requirements', 'Features', 'Technical Architecture', 'Technology Stack', 'Backend Requirements', 'Database Requirements', 'API Requirements', 'Security Requirements'],
  qa: ['Objective', 'Requirements', 'Implementation Instructions', 'Testing and Acceptance Criteria'],
  monitoring: ['Objective', 'Technical Architecture', 'Technology Stack', 'Implementation Instructions', 'Testing and Acceptance Criteria'],
  deployment: ['Objective', 'Requirements', 'Technology Stack', 'Security Requirements', 'Implementation Instructions', 'Testing and Acceptance Criteria'],
  seo: ['Objective', 'Requirements', 'Features', 'UI/UX Direction'],
  aeo: ['Objective', 'Requirements', 'Features', 'UI/UX Direction']
}

/**
 * The one file a role's work is actually judged on. Without this the task said only
 * "deliver your part of the prompt", so a designer turned a product brief into a
 * 147k-character answer and never reached an end (run #22: 3 sessions, ~80k output
 * tokens, still unfinished). A named target is what makes "done" reachable.
 */
export const DELIVERABLE_BY_ROLE: Record<string, string> = {
  researcher: 'docs/research.md',
  architect: 'docs/architecture.md',
  designer: 'docs/design-system.md',
  frontend: 'the app entry point and the screens the brief names',
  integration: 'the wiring between client and API, plus docs/integration.md',
  backend: 'the server entry point, its routes and its tests',
  fixer: 'the smallest fix plus a regression test',
  qa: 'docs/qa-report.md',
  seo: 'the metadata, sitemap and robots files',
  aeo: 'the structured content and schema markup',
  deployment: 'the production build and its run instructions',
  monitoring: 'the health checks and their dashboard'
}

/**
 * Slice a brief down to the sections a role needs, keeping the heading structure.
 * Falls back to the whole body when the document has no recognisable headings:
 * a truncated brief is worse than a long one.
 */
export function scopeToRole(body: string, role: string): string {
  const keep = SECTIONS_BY_ROLE[role]
  if (!keep) return body
  const wanted = new Set(keep.map(norm))
  const parts: string[] = []
  let current: { name: string; lines: string[] } | null = null
  let sawHeading = false
  const flush = () => {
    if (current && wanted.has(norm(current.name))) parts.push([`## ${current.name}`, ...current.lines].join('\n').trimEnd())
  }
  for (const line of body.split('\n')) {
    const heading = /^##\s+(\S.*)$/.exec(line.trim())
    if (heading) {
      sawHeading = true
      flush()
      current = { name: heading[1].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  flush()
  return sawHeading && parts.length ? parts.join('\n\n') : body
}


/** `## **Objective**`, `**Objective**`, `# Objective` all mean the same section. */
function headingOf(line: string): string | null {
  const bare = line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*(.+?)\*\*:?$/, '$1')
    .replace(/:$/, '')
    .trim()
  return BY_KEY.get(norm(bare)) ?? null
}

export function ensureSections(body: string): string {
  const lines = body.split('\n')

  // Promote a known section to a real `##` heading, whatever markdown level it used.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/^\s*(#{1,6}\s+\S|\*\*\S)/.test(line)) continue
    const name = headingOf(line)
    if (name) lines[i] = `## ${name}`
  }

  const present = new Set<string>()
  for (const line of lines) {
    const name = /^##\s+\S/.test(line) ? headingOf(line) : null
    if (name) present.add(name)
  }

  const text = lines.join('\n').trimEnd()
  const missing = SECTIONS.filter((s) => !present.has(s))
  if (!missing.length) return text
  return `${text}\n\n${missing.map((s) => `## ${s}\n\nNot specified in the conversation yet.`).join('\n\n')}`
}
