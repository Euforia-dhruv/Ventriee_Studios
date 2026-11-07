export interface RoleTemplate {
  role: string
  name: string
  title: string
  color: string
  instructions: string
  /** Tasks in this role mutate the project tree, so the scheduler serializes them per project. */
  writesCode: boolean
  /** Skill ids offered to this role by default. The owner can override them per worker. */
  skills: string[]
}

/**
 * Which bundled skills each role is offered by default. Ids must exist in
 * resources/skills; one that is not installed is simply skipped at prompt time.
 * evidence-first-delivery goes to every role that reports work as done.
 * ponytail is mandatory for every worker and is force-injected at prompt time,
 * so it appears here too to keep the defaults honest.
 */
const SKILLS_BY_ROLE: Record<string, string[]> = {
  orchestrator: [
    'evidence-first-delivery', 'ponytail',
    'wayfinder', 'to-spec', 'to-tickets', 'to-questionnaire', 'triage', 'implement-spec',
    'find-skills', 'skill-creator', 'karpathy-guidelines', 'wait-what', 'discernment-nudge'
  ],
  researcher: [
    'evidence-first-delivery', 'ponytail',
    'research', 'web-research-scrapling', 'technical-seo-audit', 'webapp-testing',
    'to-questionnaire', 'ask-matt', 'grill-me', 'grilling', 'grill-with-docs',
    'pdf', 'docx', 'xlsx', 'writing-for-agents', 'writing-fragments', 'writing-shape', 'writing-beats',
    'humanizer', 'lumenfall', 'teach', 'academy-guide'
  ],
  architect: [
    'evidence-first-delivery', 'ponytail',
    'domain-modeling', 'codebase-design', 'improve-codebase-architecture', 'implement',
    'to-spec', 'to-tickets', 'scaffold-exercises', 'karpathy-guidelines',
    'vercel-react-best-practices', 'mcp-builder', 'claude-api',
    'doc-coauthoring', 'pdf', 'slides', 'theme-factory'
  ],
  // design-system is the one skill that names docs/design-system.md, the designer's
  // deliverable. The artifact skills (design, slides, banner-design, canvas-design)
  // were offered too and pulled the worker into shipping an HTML showcase page
  // instead: run #23 wrote 54k characters of docs/design/evidence.html and no doc.
  designer: [
    'evidence-first-delivery', 'ponytail',
    'design-system', 'design', 'design-taste-frontend', 'frontend-design', 'frontend-design-principles',
    'ui-ux-pro-max', 'impeccable', 'hallmark', 'brand', 'brand-guidelines', 'theme-factory',
    'modern-web-design', 'retro', 'cinematic-motion-ui',
    'glassmorphism', 'accessible-animation', 'micro-interaction', 'page-transition-animation',
    'improve-animations', '60fps-animation', 'svg-animation', 'ascii-animation',
    'lightweight-3d-effects', 'web3d-integration-patterns', 'spline-interactive', 'rive-interactive',
    'blender-web-pipeline', 'substance-3d-texturing', 'algorithmic-art',
    'antislop', 'antislop-ui', 'antislop-human', 'antislop-layoutmobile', 'antislop-copywriting', 'antislop-code',
    'ui-styling', 'lottie-animation', 'lottie-animations', 'gsap-web', 'gsap-core'
  ],
  frontend: [
    'evidence-first-delivery', 'ponytail',
    'frontend-design', 'frontend-design-principles', 'design-taste-frontend', 'ui-ux-pro-max',
    'vercel-react-best-practices', 'ui-styling', 'web-artifacts-builder', 'prototype',
    '60fps-animation', 'gsap-web', 'gsap-core', 'gsap-react', 'gsap-frameworks', 'gsap-plugins',
    'gsap-scrolltrigger', 'gsap-timeline', 'gsap-utils', 'gsap-performance',
    'svg-animation', 'lottie-animation', 'lottie-animations', 'ascii-animation',
    'accessible-animation', 'micro-interaction', 'page-transition-animation', 'improve-animations',
    'animated-component-libraries', 'motion-framer', 'react-spring-physics', 'scroll-reveal-libraries',
    'barba-js', 'locomotive-scroll', 'animejs', 'cinematic-motion-ui', 'modern-web-design',
    'threejs-webgl', 'react-three-fiber', 'playcanvas-engine', 'babylonjs-engine', 'pixijs-2d',
    'spline-interactive', 'rive-interactive', 'aframe-webxr', 'web3d-integration-patterns',
    'lightweight-3d-effects', 'algorithmic-art', 'theme-factory', 'retro',
    'antislop', 'antislop-ui', 'antislop-human', 'antislop-layoutmobile', 'antislop-code',
    'evidence-first-delivery'
  ],
  integration: [
    'evidence-first-delivery', 'ponytail',
    'vercel-react-best-practices', 'netlify-functions', 'netlify-caching', 'netlify-access-control',
    'mcp-builder', 'claude-api', 'setup-ts-deep-modules', 'migrate-to-shoehorn', 'implement',
    'codebase-design', 'domain-modeling', 'improve-codebase-architecture'
  ],
  backend: [
    'evidence-first-delivery', 'ponytail',
    'claude-api', 'mcp-builder', 'setup-ts-deep-modules', 'migrate-to-shoehorn',
    'domain-modeling', 'codebase-design', 'implement', 'scaffold-exercises',
    'netlify-functions', 'netlify-access-control', 'netlify-caching', 'pdf', 'docx', 'xlsx',
    'karpathy-guidelines', 'setup-pre-commit', 'wizard'
  ],
  reviewer: [
    'evidence-first-delivery', 'ponytail',
    'code-review', 'karpathy-guidelines', 'improve', 'improve-codebase-architecture', 'triage',
    'handoff', 'claude-handoff', 'pr', 'git-guardrails-claude-code', 'cordis-styling-nitpicking',
    'tdd'
  ],
  fixer: [
    'evidence-first-delivery', 'ponytail',
    'diagnosing-bugs', 'fix', 'tdd', 'implement', 'code-review', 'karpathy-guidelines',
    'improve', 'wait-what'
  ],
  qa: [
    'evidence-first-delivery', 'ponytail',
    'webapp-testing', 'tdd', 'record-browser-gif', 'diagnosing-bugs', 'evidence-first-delivery',
    'antislop-human', 'antislop-layoutmobile', 'web-artifacts-builder'
  ],
  seo: [
    'evidence-first-delivery', 'ponytail',
    'web-research-scrapling', 'technical-seo-audit', 'writing-for-agents',
    'writing-beats', 'writing-fragments', 'writing-shape', 'doc-coauthoring',
    'humanizer', 'lumenfall', 'seedance-prompt-en', 'seedance-prompt-zh',
    'antislop-copywriting', 'pdf', 'xlsx', 'to-questionnaire'
  ],
  aeo: [
    'evidence-first-delivery', 'ponytail',
    'web-research-scrapling', 'technical-seo-audit', 'writing-for-agents',
    'writing-beats', 'writing-fragments', 'writing-shape', 'doc-coauthoring',
    'humanizer', 'lumenfall', 'seedance-prompt-en', 'seedance-prompt-zh',
    'antislop-copywriting', 'to-questionnaire'
  ],
  deployment: [
    'evidence-first-delivery', 'ponytail',
    'netlify-functions', 'netlify-caching', 'netlify-access-control',
    'vercel-react-best-practices', 'setup-pre-commit', 'git-guardrails-claude-code',
    'wizard', 'mcp-builder', 'evidence-first-delivery'
  ],
  monitoring: [
    'evidence-first-delivery', 'ponytail',
    'webapp-testing', 'record-browser-gif', 'technical-seo-audit', 'improve',
    'slack-gif-creator', 'evidence-first-delivery'
  ]
}

/**
 * Skills forced onto every worker regardless of role defaults. The orchestrator
 * unions these into the worker's wanted set at prompt time, so a worker whose
 * skill list is empty or custom still gets them.
 */
export const MANDATORY_SKILLS = ['ponytail'] as const

const R = (t: Omit<RoleTemplate, 'skills'>): RoleTemplate => ({
  ...t,
  skills: [...new Set([...(SKILLS_BY_ROLE[t.role] ?? []), ...MANDATORY_SKILLS])]
})

export const ROLE_TEMPLATES: RoleTemplate[] = [
  R({
    role: 'orchestrator',
    name: 'Ada',
    title: 'Orchestrator',
    color: '#7dd3fc',
    writesCode: false,
    instructions: `You are the studio orchestrator. Convert the owner's brief into a minimal, dependency-ordered plan. Pick the smallest useful team: never schedule a role that adds nothing. Frontend and backend may run in parallel once the API contract is written down. QA tests the integrated app, not assumptions. Every task needs testable acceptance criteria. Escalate scope changes and money decisions to the owner.`
  }),
  R({
    role: 'researcher',
    name: 'Noor',
    title: 'Researcher',
    color: '#a5b4fc',
    writesCode: false,
    instructions: `Research the industry, competitors and references for the project. Produce concise, sourced notes and a requirements brief. Write findings to docs/research.md inside the project. Never invent facts; mark unknowns explicitly.`
  }),
  R({
    role: 'architect',
    name: 'Soren',
    title: 'Product Architect',
    color: '#c4b5fd',
    writesCode: true,
    instructions: `Own system architecture. Choose technologies, define the schema, write API contracts to docs/architecture.md and docs/api.md before implementation starts. Keep the design as simple as the requirements allow. Justify decisions briefly in docs/decisions.md.`
  }),
  R({
    role: 'designer',
    name: 'Iris',
    title: 'UI/UX Designer',
    color: '#f9a8d4',
    writesCode: true,
    instructions: `Define the visual direction, tokens and component specifications. Write them to docs/design-system.md. Implement styling and layout when asked. Respect accessibility, responsive behaviour and reduced-motion preferences. Avoid generic templated layouts.`
  }),
  R({
    role: 'frontend',
    name: 'Kai',
    title: 'Frontend Developer',
    color: '#5eead4',
    writesCode: true,
    instructions: `Build the client exactly against the agreed API contract and design system. Ship working interactions, real state handling, error states and responsive layouts. Run the typecheck and build before claiming completion.`
  }),
  R({
    role: 'integration',
    name: 'Mira',
    title: 'Integration Developer',
    color: '#67e8f9',
    writesCode: true,
    instructions: `Wire the layers together: auth, request validation, service-to-service calls, error mapping, middleware. Verify the contract from both sides and document it.`
  }),
  R({
    role: 'backend',
    name: 'Dario',
    title: 'Backend Developer',
    color: '#86efac',
    writesCode: true,
    instructions: `Implement business logic, APIs, persistence, security and permissions. Validate every input at the trust boundary, never log secrets, and add tests for non-trivial logic. Run migrations and tests before claiming completion.`
  }),
  R({
    role: 'reviewer',
    name: 'Vera',
    title: 'Code Reviewer',
    color: '#fca5a5',
    writesCode: false,
    instructions: `Review code against the requirements and the repository's conventions. Look for security holes, data loss, broken edge cases and maintainability problems. Verify claims by reading the code and running the project's checks. Return a strict JSON verdict.`
  }),
  R({
    role: 'fixer',
    name: 'Rook',
    title: 'Bug Fixer',
    color: '#fdba74',
    writesCode: true,
    instructions: `Reproduce the failure first, find the root cause, then make the smallest fix that fully solves it. Add a regression test. Never paper over an error with a wider catch.`
  }),
  R({
    role: 'qa',
    name: 'Juno',
    title: 'QA Engineer',
    color: '#fde68a',
    writesCode: true,
    instructions: `Test the integrated application against the acceptance criteria. Cover critical journeys, error paths, responsiveness and accessibility. Record exact reproduction steps and evidence. Report defects with severity, do not fix silently.`
  }),
  R({
    role: 'seo',
    name: 'Lena',
    title: 'SEO Specialist',
    color: '#a3e635',
    writesCode: true,
    instructions: `Handle technical SEO: metadata, canonical URLs, sitemap, robots.txt, structured data, internal linking and Core Web Vitals. Verify with real output, not assumptions.`
  }),
  R({
    role: 'aeo',
    name: 'Oren',
    title: 'AEO/GEO Specialist',
    color: '#bef264',
    writesCode: true,
    instructions: `Make the site legible to answer engines and generative search: entity consistency, factual page structure, FAQ and schema alignment, crawlable content. Never fabricate claims or statistics.`
  }),
  R({
    role: 'deployment',
    name: 'Sable',
    title: 'Deployment Engineer',
    color: '#f0abfc',
    writesCode: true,
    instructions: `Prepare production builds, run preflight checks, configure hosting and deploy. Verify the live deployment with real requests. Production deployment, spending money and destructive commands require owner approval.`
  }),
  R({
    role: 'monitoring',
    name: 'Tess',
    title: 'Monitoring Engineer',
    color: '#94a3b8',
    writesCode: true,
    instructions: `Check uptime, errors and performance of deployed work. Write your findings as a real file in the workspace (docs/monitoring.md: what you checked, results with timestamps, thresholds, and the next actions) and reference any runbook or scrape config you add. Report concrete findings with timestamps and propose upgrades. Do not run background checks without owner permission.`
  })
]

export const roleByName = (role: string) => ROLE_TEMPLATES.find((r) => r.role === role)

export const PIPELINE = [
  'research',
  'requirements',
  'architecture',
  'design',
  'build',
  'integration',
  'review',
  'qa',
  'fix',
  'seo',
  'deploy',
  'monitor'
] as const

export type Phase = (typeof PIPELINE)[number]
