import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync, renameSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { isInside } from './paths'
import type { Store } from './store'
import type { Agent, MemoryDoc, Project, Task } from '../shared/types'

/**
 * Memory is markdown-first: SQLite is the search index, the files under
 * <userData>/memory are the human-readable source of truth. Every write goes
 * to both, and files edited by hand are re-imported on boot.
 */
export class MemoryService {
  readonly root: string

  constructor(private store: Store, userData: string) {
    this.root = join(userData, 'memory')
    for (const dir of ['global', 'projects', 'agents', 'sessions', 'skills', 'index']) {
      mkdirSync(join(this.root, dir), { recursive: true })
    }
  }

  private write(path: string, doc: { title: string; body: string; scope: string; projectId?: string | null; tags?: string[] }) {
    const full = join(this.root, path)
    if (!isInside(this.root, full)) throw new Error(`Memory path escapes the memory folder: ${path}`)
    mkdirSync(dirname(full), { recursive: true })
    const header = [
      '---',
      `title: ${doc.title}`,
      `scope: ${doc.scope}`,
      doc.projectId ? `project: ${doc.projectId}` : null,
      `updated: ${new Date().toISOString()}`,
      doc.tags?.length ? `tags: [${doc.tags.join(', ')}]` : null,
      '---',
      ''
    ].filter(Boolean).join('\n')
    writeFileSync(full, `${header}${doc.body.trim()}\n`, 'utf8')
  }

  private read(path: string): { title: string; body: string; tags: string[] } | null {
    const full = join(this.root, path)
    if (!existsSync(full)) return null
    const raw = readFileSync(full, 'utf8')
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
    const meta = match?.[1] ?? ''
    const title = /title:\s*(.+)/.exec(meta)?.[1]?.trim() ?? path
    const tagsRaw = /tags:\s*\[(.+)\]/.exec(meta)?.[1]
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : []
    return { title, body: raw.slice(match?.[0].length ?? 0), tags }
  }

  save(input: Partial<MemoryDoc> & { path: string; title: string; body: string }): MemoryDoc {
    const doc = this.store.saveMemory(input)
    this.write(doc.path, doc)
    return doc
  }

  /** Create a doc only when it does not exist yet, so re-bootstrapping never clobbers edits. */
  ensure(path: string, doc: { title: string; body: string; scope: MemoryDoc['scope']; projectId?: string | null; agentId?: string | null; tags?: string[]; pinned?: boolean }) {
    const existing = this.store.memories().find((m) => m.path === path)
    if (existing) return existing
    return this.save({
      path,
      title: doc.title,
      body: doc.body,
      scope: doc.scope,
      projectId: doc.projectId ?? null,
      agentId: doc.agentId ?? null,
      tags: doc.tags ?? [],
      pinned: doc.pinned ?? false,
      source: 'bootstrap',
      confidence: 0.9
    })
  }

  bootstrap(project: Project | null) {
    this.ensure('global/owner.md', {
      title: 'Owner profile',
      scope: 'global',
      pinned: true,
      tags: ['owner'],
      body: `# Owner profile\n\n- Single owner, personal workstation. No multi-tenant concerns.\n- Wants real working software, not mockups or placeholder flows.\n- Prefers a single-screen workspace over multi-page dashboards.\n- Communicates directly and expects agents to make safe decisions independently.\n`
    })
    this.ensure('global/preferences.md', {
      title: 'Owner preferences',
      scope: 'global',
      pinned: true,
      tags: ['preferences'],
      body: `# Preferences\n\n- Dark, graphite UI with restrained accent color.\n- Dense but calm layouts; no decorative clutter.\n- Evidence over claims: a task is done when tests or artifacts prove it.\n`
    })
    this.ensure('global/conventions.md', {
      title: 'Development conventions',
      scope: 'global',
      tags: ['conventions'],
      body: `# Conventions\n\n- TypeScript strict everywhere.\n- Small focused modules; no premature abstraction.\n- Tests for non-trivial logic.\n- Never commit secrets; keys live in the OS keychain.\n`
    })
    if (!project) return
    const base = `projects/${project.id}`
    this.ensure(`${base}/overview.md`, {
      title: `${project.name} overview`,
      scope: 'project',
      projectId: project.id,
      pinned: true,
      tags: ['overview'],
      body: `# ${project.name}\n\n${project.description || 'No description yet.'}\n\nWorkspace: \`${project.path}\`\n`
    })
    for (const [file, title] of [
      ['architecture.md', 'Architecture'],
      ['decisions.md', 'Decision log'],
      ['design-system.md', 'Design system'],
      ['progress.md', 'Progress'],
      ['known-issues.md', 'Known issues']
    ] as const) {
      this.ensure(`${base}/${file}`, {
        title: `${project.name} ${title.toLowerCase()}`,
        scope: 'project',
        projectId: project.id,
        tags: [file.replace('.md', '')],
        body: `# ${title}\n\n_Empty. Updated as work proceeds._\n`
      })
    }
  }

  identityPath(agent: Agent) {
    return `agents/${agent.id}/identity.md`
  }

  bootstrapAgent(agent: Agent, project: Project | null) {
    this.ensure(this.identityPath(agent), {
      title: `${agent.name} identity`,
      scope: 'agent',
      projectId: project?.id ?? null,
      agentId: agent.id,
      tags: ['identity', agent.role],
      body: `# ${agent.name} — ${agent.title}\n\nRole: **${agent.role}**\nEngine: \`${agent.engine}\` · model \`${agent.model || 'default'}\`\n\n## Standing instructions\n\n${agent.instructions}\n`
    })
    this.ensure(`agents/${agent.id}/lessons.md`, {
      title: `${agent.name} lessons`,
      scope: 'agent',
      projectId: project?.id ?? null,
      agentId: agent.id,
      tags: ['lessons'],
      body: `# Lessons\n\nDurable, evidence-backed techniques only. Each entry: what happened, what to reuse or avoid, evidence.\n`
    })
    this.ensure(`agents/${agent.id}/working-memory.md`, {
      title: `${agent.name} working memory`,
      scope: 'agent',
      projectId: project?.id ?? null,
      agentId: agent.id,
      tags: ['working'],
      body: `# Working memory\n\nCurrent handover state for this worker. Rewritten each task.\n`
    })
  }

  /** Retrieve memory relevant to a task, ranked by keyword overlap, pinned status and recency. */
  retrieve(projectId: string, query: string, limit = 6): MemoryDoc[] {
    const words = new Set(
      query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)
    )
    const docs = this.store.memories(projectId)
    const scored = docs.map((doc) => {
      const hay = `${doc.title} ${doc.body} ${doc.tags.join(' ')}`.toLowerCase()
      let score = 0
      for (const w of words) if (hay.includes(w)) score += 2
      if (doc.pinned) score += 3
      if (doc.scope === 'global') score += 1
      if (doc.projectId === projectId) score += 1
      score += Math.max(0, 2 - (Date.now() - doc.updatedAt) / (1000 * 60 * 60 * 24 * 30))
      return { doc, score }
    })
    return scored
      .filter((s) => s.score > 1.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.doc)
  }

  promptBlock(docs: MemoryDoc[]): string {
    if (!docs.length) return '(no stored memory relevant to this task)'
    return docs.map((d) => `<memory path="${d.path}" confidence="${d.confidence.toFixed(2)}">\n${d.body.trim()}\n</memory>`).join('\n\n')
  }

  /** Notes that agents append after a task. Owner corrections always win over agent inference. */
  appendProgress(projectId: string, line: string) {
    const path = `projects/${projectId}/progress.md`
    const current = this.store.memories(projectId).find((m) => m.path === path)
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    this.save({
      path,
      title: current?.title ?? 'Progress',
      body: `${current?.body.trim() ?? '# Progress'}\n\n- ${stamp} — ${line}`,
      scope: 'project',
      projectId,
      tags: ['progress']
    })
  }

  appendLesson(agent: Agent, line: string, projectId: string | null) {
    const path = `agents/${agent.id}/lessons.md`
    const current = this.store.memories().find((m) => m.path === path)
    const stamp = new Date().toISOString().slice(0, 10)
    this.save({
      path,
      title: current?.title ?? `${agent.name} lessons`,
      body: `${current?.body.trim() ?? '# Lessons'}\n\n- ${stamp} — ${line}`,
      scope: 'agent',
      projectId,
      agentId: agent.id,
      tags: ['lessons'],
      source: `agent:${agent.id}`
    })
  }

  recordTaskOutcome(task: Task, agent: Agent | null, project: Project, accepted: boolean, evidence: string) {
    const line = `Task "${task.title}" ${accepted ? 'accepted' : 'returned for rework'}${evidence ? ` (evidence: ${evidence.slice(0, 160)})` : ''}`
    this.appendProgress(project.id, line)
    if (agent && accepted) {
      this.appendLesson(agent, `Reusable approach for "${task.title}": ${task.acceptance.slice(0, 200)} — verified by ${evidence || 'review'}`.replace(/\s+/g, ' '), project.id)
    }
  }

  /** Re-import markdown files edited outside the app. */
  reindex() {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry.endsWith('.md')) files.push(full)
      }
    }
    walk(this.root)
    for (const full of files) {
      const rel = relative(this.root, full).replaceAll('\\', '/')
      const parsed = this.read(rel)
      if (!parsed) continue
      const existing = this.store.memories().find((m) => m.path === rel)
      const scope: MemoryDoc['scope'] = rel.startsWith('projects/')
        ? 'project'
        : rel.startsWith('agents/')
          ? 'agent'
          : rel.startsWith('sessions/')
            ? 'session'
            : rel.startsWith('skills/')
              ? 'skill'
              : 'global'
      const projectId = rel.startsWith('projects/') ? rel.split('/')[1] ?? null : existing?.projectId ?? null
      this.store.saveMemory({
        id: existing?.id,
        path: rel,
        title: parsed.title,
        body: parsed.body,
        scope,
        projectId,
        tags: parsed.tags,
        pinned: existing?.pinned ?? false,
        confidence: existing?.confidence ?? 0.7,
        source: 'file',
        evidence: existing?.evidence ?? 'edited on disk'
      })
    }
  }

  exportProject(projectId: string) {
    const docs = this.store.memories(projectId).filter((m) => m.projectId === projectId)
    for (const doc of docs) this.write(doc.path, doc)
  }

  deleteFilesFor(scopePath: string) {
    const full = join(this.root, scopePath)
    if (!isInside(this.root, full)) return
    if (existsSync(full)) rmSync(full, { recursive: true, force: true })
  }

  archive(projectId: string) {
    const dir = join(this.root, 'projects', projectId)
    if (!existsSync(dir)) return
    const target = join(this.root, 'index', `archived-${projectId}-${Date.now()}`)
    mkdirSync(dirname(target), { recursive: true })
    try {
      renameSync(dir, target)
    } catch {
      /* cross-device move is not worth handling for a local archive */
    }
  }
}
