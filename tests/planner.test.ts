import { describe, expect, it } from 'vitest'
import { classifyBrief, heuristicPlan, orderTasks, parsePlanAnswer } from '../src/main/planner'

const roles = (plan: ReturnType<typeof heuristicPlan>) => plan.tasks.map((t) => t.role)

describe('classifyBrief', () => {
  it('recognises a portfolio website', () => {
    const p = classifyBrief('Build a beautiful interactive portfolio website with a responsive layout')
    expect(p.category).toBe('web')
    expect(p.visual).toBe(true)
  })

  it('recognises a python utility instead of forcing web work', () => {
    const p = classifyBrief('Write a standalone Python utility that converts CSV to JSON')
    expect(p.category).toBe('automation')
    expect(p.api).toBe(false)
  })

  it('recognises documents, research and games', () => {
    expect(classifyBrief('Write a whitepaper as a PDF').category).toBe('document')
    expect(classifyBrief('Research the competitor market for a study').category).toBe('research')
    expect(classifyBrief('Make a 3d browser game with shaders').category).toBe('game')
  })

  it('flags deployment and SEO only when asked', () => {
    const plain = classifyBrief('Build a landing page')
    expect(plain.deploy).toBe(false)
    expect(plain.seo).toBe(false)
    const full = classifyBrief('Build a site, add SEO and deploy to production')
    expect(full.deploy).toBe(true)
    expect(full.seo).toBe(true)
  })
})

describe('heuristicPlan', () => {
  it('gives a website the full build spine', () => {
    const plan = heuristicPlan('Build a marketing website with a contact form and SEO')
    expect(plan.source).toBe('heuristic')
    expect(roles(plan)).toEqual(
      expect.arrayContaining(['researcher', 'architect', 'designer', 'frontend', 'reviewer', 'qa'])
    )
    expect(plan.tasks.every((t) => t.acceptance.length > 10)).toBe(true)
  })

  it('never assigns a design system to a python utility', () => {
    const plan = heuristicPlan('Write a small python script that renames files')
    const r = roles(plan)
    expect(r).not.toContain('designer')
    expect(r).not.toContain('frontend')
    expect(r).toContain('reviewer')
  })

  it('skips deployment and SEO when the brief does not ask', () => {
    const plan = heuristicPlan('Build a website')
    expect(roles(plan)).not.toContain('deployment')
    expect(roles(plan)).not.toContain('seo')
    expect(plan.skipped.length).toBeGreaterThan(0)
  })

  it('keeps every dependency pointing at a real task', () => {
    const plan = heuristicPlan('Build a SaaS app with auth, billing and a deploy')
    const keys = new Set(plan.tasks.map((t) => t.key))
    for (const task of plan.tasks) {
      for (const dep of task.dependsOnKeys) expect(keys.has(dep)).toBe(true)
    }
    expect(new Set(plan.tasks.map((t) => t.key)).size).toBe(plan.tasks.length)
  })

  it('orders tasks so dependencies come first', () => {
    const plan = heuristicPlan('Build a website with an API and deploy it')
    const byKey = new Map(plan.tasks.map((t) => [t.key, t]))
    const ordered = orderTasks(plan.tasks)
    expect(ordered).toHaveLength(plan.tasks.length)
    const seen = new Set<string>()
    for (const task of ordered) {
      for (const dep of task.dependsOnKeys) expect(seen.has(dep)).toBe(true)
      seen.add(task.key)
      expect(byKey.has(task.key)).toBe(true)
    }
  })
})

describe('parsePlanAnswer', () => {
  it('reads a fenced JSON plan from a model answer', () => {
    const answer = `Here is the plan.
\`\`\`json
{ "summary": "Ship a portfolio", "tasks": [
  { "key": "a", "title": "Research", "description": "d", "acceptance": "a", "role": "researcher", "phase": "research", "dependsOnKeys": [] },
  { "key": "b", "title": "Build", "description": "d", "acceptance": "a", "role": "dev", "phase": "build", "dependsOnKeys": ["a"] }
] }
\`\`\``
    const plan = parsePlanAnswer(answer, ['researcher', 'frontend'])
    expect(plan?.tasks).toHaveLength(2)
    expect(plan?.tasks[1].role).toBe('frontend')
    // model keys are renumbered to t1..tN; dependencies must follow the rename
    expect(plan?.tasks[1].dependsOnKeys).toEqual([plan?.tasks[0].key])
  })

  it('returns null for prose with no plan', () => {
    expect(parsePlanAnswer('I would start by reading the brief.', ['frontend'])).toBeNull()
  })

  it('drops dependencies on tasks that do not exist', () => {
    const answer = JSON.stringify({
      summary: 's',
      tasks: [{ key: 'a', title: 't', description: 'd', acceptance: 'x', role: 'frontend', phase: 'build', dependsOnKeys: ['ghost'] }]
    })
    const plan = parsePlanAnswer(answer, ['frontend'])
    expect(plan?.tasks[0].dependsOnKeys).toEqual([])
  })
})
