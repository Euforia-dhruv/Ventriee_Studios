import type { Phase } from './roles'

export interface PlannedTask {
  key: string
  title: string
  description: string
  acceptance: string
  role: string
  phase: Phase
  dependsOnKeys: string[]
}

export interface Plan {
  summary: string
  tasks: PlannedTask[]
  source: 'model' | 'heuristic'
  skipped: string[]
}

export type ProjectCategory =
  | 'web'
  | 'saas'
  | 'desktop'
  | 'mobile'
  | 'game'
  | 'backend'
  | 'ai'
  | 'automation'
  | 'data'
  | 'design'
  | 'document'
  | 'research'
  | 'infra'
  | 'qa'
  | 'marketing'

export interface BriefProfile {
  category: ProjectCategory
  label: string
  /** Has a visual surface a browser preview can show. */
  visual: boolean
  api: boolean
  seo: boolean
  deploy: boolean
}

const CATEGORY_RULES: Array<{ category: ProjectCategory; label: string; visual: boolean; test: RegExp }> = [
  { category: 'game', label: 'game', visual: true, test: /\b(game|gaming|unity|godot|phaser|three\.?js|3d|shader|pygame)\b/i },
  { category: 'mobile', label: 'mobile app', visual: true, test: /\b(ios|android|mobile app|react native|flutter|expo|swiftui)\b/i },
  { category: 'desktop', label: 'desktop app', visual: true, test: /\b(electron|desktop app|tauri|windows app|macos app|native app)\b/i },
  { category: 'saas', label: 'SaaS product', visual: true, test: /\b(saas|subscription|multi-?tenant|billing|onboarding flow|user accounts)\b/i },
  // A site brief stays a site even when it also mentions SEO or marketing copy.
  { category: 'web', label: 'website', visual: true, test: /\b(website|web ?app|web page|landing page|portfolio|microsite|site|blog|storefront|shop)\b/i },
  { category: 'ai', label: 'AI application', visual: false, test: /\b(ai|llm|machine learning|ml model|rag|embedding|chatbot|agent|inference|fine-?tun)/i },
  { category: 'data', label: 'data project', visual: true, test: /\b(data pipeline|etl|analytics|dataset|warehouse|visuali[sz]ation|reporting|sql)\b/i },
  { category: 'automation', label: 'automation', visual: false, test: /\b(automation|automate|script|utility|converter|cron|workflow|scraper|bot|cli tool)\b/i },
  { category: 'infra', label: 'infrastructure', visual: false, test: /\b(infrastructure|devops|kubernetes|docker|terraform|ci\/cd|pipeline setup|server setup)\b/i },
  { category: 'document', label: 'document', visual: false, test: /\b(document|whitepaper|proposal|report|deck|presentation|slides|pdf|ebook|copywriting)\b/i },
  { category: 'research', label: 'research', visual: false, test: /\b(research|competitor|market study|audit report|feasibility|analysis)\b/i },
  { category: 'design', label: 'design', visual: true, test: /\b(ui kit|wireframe|prototype|design system|brand|logo|mockup)\b/i },
  { category: 'qa', label: 'testing engagement', visual: false, test: /\b(test suite|qa audit|quality assurance|regression|load test)\b/i },
  { category: 'marketing', label: 'marketing & SEO', visual: false, test: /\b(seo|aeo|geo|marketing|keyword|content strategy|growth)\b/i },
  { category: 'backend', label: 'backend service', visual: false, test: /\b(api|backend|service|database|auth|microservice|webhook|graphql)\b/i }
]

/** Classify the brief so a Python utility never gets a design system. */
export function classifyBrief(instruction: string): BriefProfile {
  const hit = CATEGORY_RULES.find((r) => r.test.test(instruction))
  const category = hit?.category ?? 'web'
  return {
    category,
    label: hit?.label ?? 'web project',
    visual: hit?.visual ?? true,
    api: /\b(api|backend|server|database|auth|login|payment|integration|persist)\b/i.test(instruction),
    seo: /\b(seo|search engine|aeo|geo|ranking|discover|marketing|content)\b/i.test(instruction),
    deploy: /\b(deploy|publish|launch|release|host|production|ship)\b/i.test(instruction)
  }
}

/** Code categories get review + QA stages; documents and research get a single review. */
const CODE_CATEGORIES = new Set<ProjectCategory>(['web', 'saas', 'desktop', 'mobile', 'game', 'backend', 'ai', 'automation', 'data', 'infra', 'qa'])
const DESIGN_CATEGORIES = new Set<ProjectCategory>(['web', 'saas', 'desktop', 'mobile', 'game', 'design', 'data'])

/**
 * Deterministic fallback planner. Used when no model is reachable, so the
 * studio still produces a real, runnable plan instead of stalling.
 */
export function heuristicPlan(instruction: string): Plan {
  const p = classifyBrief(instruction)
  const tasks: PlannedTask[] = []
  const add = (t: Omit<PlannedTask, 'dependsOnKeys'> & { dependsOnKeys?: string[] }) => {
    tasks.push({ ...t, dependsOnKeys: t.dependsOnKeys ?? [] })
    return t.key
  }

  const research = add({
    key: 'research',
    title: 'Research the brief and capture requirements',
    description: `Research the domain, references and constraints for this ${p.label}: ${instruction}`,
    acceptance: 'docs/research.md exists with requirements, unknowns listed explicitly, no invented facts.',
    role: 'researcher',
    phase: 'research'
  })

  const arch = add({
    key: 'architecture',
    title: 'Define the architecture and delivery contract',
    description: 'Choose the stack, define the structure, interfaces and data model before implementation.',
    acceptance: 'docs/architecture.md exists and is concrete enough for parallel work.',
    role: 'architect',
    phase: 'architecture',
    dependsOnKeys: [research]
  })

  const deps: string[] = [arch]
  if (DESIGN_CATEGORIES.has(p.category)) {
    deps.push(add({
      key: 'design',
      title: 'Define the visual direction and component specs',
      description: 'Visual direction, tokens, layout and component specs written to docs/design-system.md.',
      acceptance: 'docs/design-system.md exists with tokens, layout rules and component specs.',
      role: 'designer',
      phase: 'design',
      dependsOnKeys: [arch]
    }))
  }

  const build: string[] = []
  if (p.category === 'web' || p.category === 'saas') {
    if (p.api || p.category === 'saas') {
      build.push(add({
        key: 'backend',
        title: 'Implement backend, API and persistence',
        description: 'Implement the server side of the agreed contract with validation and tests.',
        acceptance: 'API runs, tests pass, every input validated at the boundary.',
        role: 'backend',
        phase: 'build',
        dependsOnKeys: deps
      }))
    }
    build.push(add({
      key: 'frontend',
      title: 'Implement the user interface against the contract',
      description: 'Build the client UI, interactions and responsive layout.',
      acceptance: 'App builds, typecheck passes, key journeys work in a browser.',
      role: 'frontend',
      phase: 'build',
      dependsOnKeys: deps
    }))
    build.push(add({
      key: 'integration',
      title: 'Integrate client, API and middleware',
      description: 'Wire auth, validation and service calls between the layers.',
      acceptance: 'Client talks to the real API; failures surface as real error states.',
      role: 'integration',
      phase: 'integration',
      dependsOnKeys: build.slice()
    }))
  } else if (p.category === 'desktop' || p.category === 'mobile' || p.category === 'game') {
    build.push(add({
      key: 'application',
      title: `Build the ${p.label}`,
      description: `Implement the application shell, screens, state and core interactions for this ${p.label}.`,
      acceptance: 'App builds and launches; the core journey works end to end.',
      role: 'frontend',
      phase: 'build',
      dependsOnKeys: deps
    }))
    build.push(add({
      key: 'integration',
      title: 'Wire platform services and packaging',
      description: 'Connect persistence, native/process APIs and the production build pipeline.',
      acceptance: 'Packaged build runs and reads/writes real data.',
      role: 'integration',
      phase: 'integration',
      dependsOnKeys: build.slice()
    }))
  } else if (p.category === 'backend' || p.category === 'infra') {
    build.push(add({
      key: 'backend',
      title: 'Implement the service and its interfaces',
      description: 'Implement business logic, endpoints, persistence, validation and configuration.',
      acceptance: 'Service runs, endpoints answer real requests, inputs validated at the boundary.',
      role: 'backend',
      phase: 'build',
      dependsOnKeys: deps
    }))
  } else if (p.category === 'ai') {
    build.push(add({
      key: 'model',
      title: 'Implement the model layer and data flow',
      description: 'Wire the model/provider, prompts, retrieval and the application flow around it.',
      acceptance: 'A real call returns a real result; failures and limits handled.',
      role: 'backend',
      phase: 'build',
      dependsOnKeys: deps
    }))
  } else if (p.category === 'automation') {
    build.push(add({
      key: 'automation',
      title: 'Implement the utility and its entry point',
      description: `Build the runnable utility for: ${instruction}. Working code, not a description.`,
      acceptance: 'The command runs from a clean shell and produces the documented output.',
      role: 'backend',
      phase: 'build',
      dependsOnKeys: deps
    }))
  } else if (p.category === 'data') {
    build.push(add({
      key: 'pipeline',
      title: 'Implement the data pipeline',
      description: 'Ingest, transform and validate the data with reproducible run commands.',
      acceptance: 'Pipeline runs on the real dataset and produces the expected output.',
      role: 'backend',
      phase: 'build',
      dependsOnKeys: deps
    }))
    build.push(add({
      key: 'visualisation',
      title: 'Build the data views',
      description: 'Present the results: tables, charts or a report backed by real data.',
      acceptance: 'Views render real values, not placeholders.',
      role: 'frontend',
      phase: 'build',
      dependsOnKeys: deps
    }))
  } else if (p.category === 'design') {
    build.push(add({
      key: 'design-build',
      title: 'Produce the design and an interactive prototype',
      description: 'Deliver the visual design, tokens and a working prototype of the key screens.',
      acceptance: 'Prototype opens in a browser and covers the agreed screens.',
      role: 'designer',
      phase: 'build',
      dependsOnKeys: deps
    }))
  } else if (p.category === 'document' || p.category === 'research') {
    build.push(add({
      key: 'document',
      title: 'Write the deliverable',
      description: `Produce the actual ${p.label} as a file in the workspace, structured and complete.`,
      acceptance: 'Deliverable file exists, is readable and covers the brief with no invented facts.',
      role: 'researcher',
      phase: 'build',
      dependsOnKeys: deps
    }))
  } else if (p.category === 'marketing') {
    build.push(add({
      key: 'marketing',
      title: 'Deliver the marketing work',
      description: 'Produce the audit, metadata, content structure and machine-readable improvements requested.',
      acceptance: 'Deliverable exists and every claim is backed by the real site or content.',
      role: 'seo',
      phase: 'seo',
      dependsOnKeys: deps
    }))
  } else if (p.category === 'qa') {
    build.push(add({
      key: 'tests',
      title: 'Build the test suite',
      description: 'Write the automated tests, run them, and report real results.',
      acceptance: 'Tests run in the workspace and the output is recorded.',
      role: 'qa',
      phase: 'qa',
      dependsOnKeys: deps
    }))
  }

  const reviewDeps = build.length ? build : [arch]
  const review = add({
    key: 'review',
    title: 'Review the delivered work',
    description: 'Check the deliverable against the requirements, conventions and the brief.',
    acceptance: 'Verdict recorded with concrete findings; blockers listed if rejected.',
    role: 'reviewer',
    phase: 'review',
    dependsOnKeys: reviewDeps
  })

  let tail = review
  if (CODE_CATEGORIES.has(p.category) || p.category === 'document') {
    const qa = add({
      key: 'qa',
      title: p.visual ? 'Test the integrated build' : 'Verify the deliverable end to end',
      description: p.visual
        ? 'Exercise the critical journeys, error paths and responsiveness on the real build.'
        : 'Run the deliverable the way a user would and record real output.',
      acceptance: 'Test evidence recorded; defects reported with reproduction steps.',
      role: 'qa',
      phase: 'qa',
      dependsOnKeys: [review]
    })
    tail = add({
      key: 'fix',
      title: 'Fix defects found in review and testing',
      description: 'Resolve every blocking defect, smallest correct fix, regression test where practical.',
      acceptance: 'Blocking defects closed and re-verified.',
      role: 'fixer',
      phase: 'fix',
      dependsOnKeys: [qa]
    })
  }

  const skipped: string[] = []
  if (p.seo) {
    tail = add({
      key: 'seo',
      title: 'Apply technical SEO and answer-engine optimisations',
      description: 'Metadata, sitemap, robots, structured data and machine-readable content.',
      acceptance: 'Metadata and structured data verified in real output.',
      role: 'seo',
      phase: 'seo',
      dependsOnKeys: [tail]
    })
    tail = add({
      key: 'aeo',
      title: 'Improve AEO and GEO discoverability',
      description: 'Entity consistency, factual structure and crawlable answer content.',
      acceptance: 'Content structure verified; no fabricated claims.',
      role: 'aeo',
      phase: 'seo',
      dependsOnKeys: [tail]
    })
  } else if (p.visual) {
    skipped.push('SEO/AEO (not requested)')
  }
  if (p.deploy) {
    tail = add({
      key: 'deploy',
      title: 'Prepare and run the production deployment',
      description: 'Preflight checks, production build, deployment and live verification.',
      acceptance: 'Live URL verified with real requests; owner approved the deploy.',
      role: 'deployment',
      phase: 'deploy',
      dependsOnKeys: [tail]
    })
  } else {
    skipped.push('deployment (no deployment implied)')
  }

  return {
    summary: `${p.label}: ${instruction}`,
    tasks,
    source: 'heuristic',
    skipped
  }
}

const ROLE_ALIASES: Record<string, string> = {
  pm: 'orchestrator',
  manager: 'orchestrator',
  orchestration: 'orchestrator',
  research: 'researcher',
  'ux': 'designer',
  'ui': 'designer',
  'ui/ux': 'designer',
  'ui-ux': 'designer',
  'design': 'designer',
  'dev': 'frontend',
  'developer': 'frontend',
  'coder': 'frontend',
  'engineer': 'frontend',
  'software engineer': 'frontend',
  'full stack': 'frontend',
  'fullstack': 'frontend',
  'front-end': 'frontend',
  'front end': 'frontend',
  'back-end': 'backend',
  'back end': 'backend',
  'middleware': 'integration',
  'integrations': 'integration',
  'code review': 'reviewer',
  'reviewer': 'reviewer',
  'bug fixer': 'fixer',
  'bug-fixer': 'fixer',
  'debugger': 'fixer',
  'tester': 'qa',
  'testing': 'qa',
  'seo/aeo': 'seo',
  modes: 'seo',
  'aeo/geo': 'aeo',
  'geo': 'aeo',
  'deploy': 'deployment',
  'devops': 'deployment',
  'ops': 'deployment',
  'monitor': 'monitoring',
  'sre': 'monitoring'
}

/** Resolve a model's role label to a real roster role. Never silently becomes the orchestrator. */
export function normalizeRole(raw: string, valid: string[]): string {
  const key = raw.trim().toLowerCase()
  if (valid.includes(key)) return key
  const alias = ROLE_ALIASES[key]
  if (alias && valid.includes(alias)) return alias
  // substring guesses: "senior backend engineer" -> backend, "frontend dev" -> frontend
  const guess = ['frontend', 'backend', 'designer', 'qa', 'reviewer', 'researcher', 'fixer', 'integration', 'seo', 'aeo', 'deployment', 'monitoring', 'architect']
  const bySubstring = guess.find((role) => valid.includes(role) && key.includes(role))
  if (bySubstring) return bySubstring
  return valid.includes('frontend') ? 'frontend' : valid[0]
}

/** Parse a model's JSON plan defensively: models wrap it in prose or fences. */
export function parsePlanAnswer(raw: string, validRoles: string[]): Plan | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const candidate = fenced?.[1] ?? raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
      summary?: string
      tasks?: Array<{
        title?: string
        description?: string
        acceptance?: string
        role?: string
        phase?: string
        dependsOn?: string[] | string
        dependsOnKeys?: string[] | string
      }>
    }
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null
    const tasks: PlannedTask[] = []
    /** Model-provided key/title -> our generated key, so dependencies survive renaming. */
    const aliases = new Map<string, string>()
    parsed.tasks.slice(0, 24).forEach((t, index) => {
      const title = String(t.title ?? '').trim()
      if (!title) return
      const key = `t${index + 1}`
      // models emit either spelling; accept both
      const rawDeps = t.dependsOn ?? t.dependsOnKeys
      const dependsRaw = Array.isArray(rawDeps) ? rawDeps : rawDeps ? [rawDeps] : []
      const rawKey = String((t as { key?: unknown }).key ?? '').trim()
      if (rawKey) aliases.set(rawKey.toLowerCase(), key)
      aliases.set(title.toLowerCase(), key)
      tasks.push({
        key,
        title: title.slice(0, 160),
        description: String(t.description ?? title).slice(0, 2000),
        acceptance: String(t.acceptance ?? 'Deliverable exists and is verifiable.').slice(0, 600),
        role: normalizeRole(String(t.role ?? 'frontend'), validRoles),
        phase: (String(t.phase ?? 'build').toLowerCase() as Phase) ?? 'build',
        dependsOnKeys: dependsRaw.map((d) => String(d))
      })
    })
    if (!tasks.length) return null
    // remap dependsOn values (model may emit keys, titles or indices)
    const byKey = new Map(tasks.map((t) => [t.key, t]))
    for (const task of tasks) {
      task.dependsOnKeys = task.dependsOnKeys
        .map((d) => {
          const ref = d.trim().toLowerCase()
          if (byKey.has(ref)) return ref
          const aliased = aliases.get(ref)
          if (aliased) return aliased
          const n = /^t(\d+)$/.exec(ref)
          if (n && byKey.has(`t${n[1]}`)) return `t${n[1]}`
          const match = tasks.find((c) => ref.length > 3 && c.title.toLowerCase().includes(ref))
          return match?.key ?? null
        })
        .filter((v): v is string => Boolean(v) && v !== task.key)
    }
    return {
      summary: String(parsed.summary ?? 'Planned by orchestrator').slice(0, 600),
      tasks,
      source: 'model',
      skipped: []
    }
  } catch {
    return null
  }
}

/** Topological order with a stable tie-break so the UI never flickers. */
export function orderTasks<T extends { key: string; dependsOnKeys: string[] }>(tasks: T[]): T[] {
  const remaining = [...tasks]
  const done = new Set<string>()
  const out: T[] = []
  let guard = 0
  while (remaining.length && guard < 500) {
    guard += 1
    let progressed = false
    for (let i = 0; i < remaining.length; i += 1) {
      const task = remaining[i]
      if (task.dependsOnKeys.every((d) => done.has(d))) {
        out.push(task)
        done.add(task.key)
        remaining.splice(i, 1)
        progressed = true
        break
      }
    }
    if (!progressed) {
      // cycle or dangling dependency: keep the rest in declaration order
      out.push(...remaining)
      break
    }
  }
  return out
}
