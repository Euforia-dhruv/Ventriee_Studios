import { randomUUID } from 'node:crypto'
import { Db } from './db'
import type {
  Agent,
  AppSettings,
  Assignment,
  Automation,
  ChatMessage,
  Conversation,
  EngineKind,
  Job,
  MemoryDoc,
  Message,
  ModelOption,
  ModelPrefs,
  PreviewState,
  Project,
  PromptDoc,
  ProviderConfig,
  RunEvent,
  SessionRecord,
  SkillRecord,
  Snapshot,
  Task
} from '../shared/types'
import type { ProviderStatus } from '../shared/types'

const bolt = (v: unknown) => (v ? 1 : 0)
const unb = (v: unknown) => Boolean(v)

export const DEFAULT_SETTINGS: AppSettings = {
  defaultProjectId: null,
  orchestratorEngine: 'cli-opencode',
  orchestratorModel: '',
  maxConcurrentSessions: 4,
  sessionTimeoutMinutes: 30,
  autoExtractLessons: true,
  requireDeployApproval: true,
  reducedMotion: true,
  plannerFallback: true,
  routingMode: 'automatic',
  costPreference: 'balanced',
  plannerEngine: 'cli-opencode',
  plannerModel: '',
  plannerEndpoint: ''
}

export class Store {
  readonly db: Db
  constructor(file: string) {
    this.db = new Db(file)
  }

  // ---------- settings ----------
  settings(): AppSettings {
    const raw = this.db.kvGet('settings')
    if (!raw) return { ...DEFAULT_SETTINGS }
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  saveSettings(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.settings(), ...patch }
    this.db.kvSet('settings', JSON.stringify(next))
    return next
  }

  activeProjectId(): string | null {
    return this.db.kvGet('activeProject')
  }

  setActiveProject(id: string | null) {
    if (id) this.db.kvSet('activeProject', id)
    else this.db.kvDelete('activeProject')
  }

  // ---------- projects ----------
  projects(): Project[] {
    return this.db.all<Project>('SELECT * FROM projects ORDER BY updatedAt DESC')
  }

  project(id: string): Project | undefined {
    return this.db.get<Project>('SELECT * FROM projects WHERE id = ?', id)
  }

  createProject(input: { name: string; path: string; description: string }): Project {
    const now = Date.now()
    const project: Project = {
      id: `prj_${randomUUID().slice(0, 8)}`,
      name: input.name,
      path: input.path,
      description: input.description,
      createdAt: now,
      updatedAt: now
    }
    this.db.run(
      'INSERT INTO projects(id,name,path,description,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
      project.id, project.name, project.path, project.description, now, now
    )
    return project
  }

  updateProject(id: string, patch: Partial<Project>) {
    const cur = this.project(id)
    if (!cur) return
    this.db.run(
      'UPDATE projects SET name=?, path=?, description=?, updatedAt=? WHERE id=?',
      patch.name ?? cur.name, patch.path ?? cur.path, patch.description ?? cur.description, Date.now(), id
    )
  }

  deleteProject(id: string) {
    for (const t of ['agents', 'tasks', 'messages', 'events', 'sessions', 'memories', 'automations', 'jobs']) {
      this.db.run(`DELETE FROM ${t} WHERE projectId = ?`, id)
    }
    this.db.run('DELETE FROM projects WHERE id = ?', id)
    if (this.activeProjectId() === id) this.setActiveProject(null)
  }

  // ---------- agents ----------
  agents(projectId?: string): Agent[] {
    const rows = projectId
      ? this.db.all<Record<string, unknown>>('SELECT * FROM agents WHERE projectId = ? ORDER BY desk ASC', projectId)
      : this.db.all<Record<string, unknown>>('SELECT * FROM agents ORDER BY desk ASC')
    return rows.map((r) => ({
      ...(r as unknown as Agent),
      enabled: unb(r.enabled),
      concurrency: Number(r.concurrency ?? 1),
      budgetUsd: Number(r.budgetUsd ?? 0),
      desk: Number(r.desk ?? 0),
      reasoning: (r.reasoning as Agent['reasoning']) ?? 'auto',
      skills: safeJson<string[]>(r.skills as string, [])
    }))
  }

  agent(id: string): Agent | undefined {
    return this.agents().find((a) => a.id === id)
  }

  insertAgent(a: Agent) {
    this.db.run(
      `INSERT INTO agents(id,projectId,role,name,title,engine,model,endpoint,instructions,autonomy,
        reasoning,skills,concurrency,budgetUsd,color,desk,enabled,status,currentTaskId,lastError,createdAt)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      a.id, a.projectId, a.role, a.name, a.title, a.engine, a.model, a.endpoint, a.instructions,
      a.autonomy, a.reasoning ?? 'auto', JSON.stringify(a.skills ?? []), a.concurrency, a.budgetUsd,
      a.color, a.desk, bolt(a.enabled), a.status, a.currentTaskId, a.lastError, a.createdAt
    )
  }

  updateAgent(id: string, patch: Partial<Agent>) {
    const cur = this.agent(id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      `UPDATE agents SET role=?,name=?,title=?,engine=?,model=?,endpoint=?,instructions=?,autonomy=?,
        reasoning=?,skills=?,concurrency=?,budgetUsd=?,color=?,desk=?,enabled=?,status=?,currentTaskId=?,lastError=?
        WHERE id=?`,
      n.role, n.name, n.title, n.engine, n.model, n.endpoint, n.instructions, n.autonomy,
      n.reasoning ?? 'auto', JSON.stringify(n.skills ?? []), n.concurrency, n.budgetUsd, n.color, n.desk,
      bolt(n.enabled), n.status, n.currentTaskId, n.lastError, id
    )
  }

  deleteAgent(id: string) {
    this.db.run('DELETE FROM agents WHERE id = ?', id)
  }

  // ---------- tasks ----------
  tasks(projectId?: string): Task[] {
    const rows = projectId
      ? this.db.all<Record<string, unknown>>('SELECT * FROM tasks WHERE projectId = ? ORDER BY createdAt ASC', projectId)
      : this.db.all<Record<string, unknown>>('SELECT * FROM tasks ORDER BY createdAt ASC')
    return rows.map((r) => ({
      ...(r as unknown as Task),
      dependsOn: safeJson<string[]>(r.dependsOn as string, []),
      attempts: Number(r.attempts ?? 0),
      engine: (r.engine as Task['engine']) ?? null,
      model: (r.model as Task['model']) ?? null,
      endpoint: (r.endpoint as Task['endpoint']) ?? null,
      routedBy: (r.routedBy as Task['routedBy']) ?? null
    }))
  }

  task(id: string): Task | undefined {
    return this.tasks().find((t) => t.id === id)
  }

  insertTask(t: Task) {
    this.db.run(
      `INSERT INTO tasks(id,projectId,parentId,title,description,acceptance,role,agentId,status,
        dependsOn,output,review,attempts,phase,engine,model,endpoint,routedBy,createdAt,updatedAt)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      t.id, t.projectId, t.parentId, t.title, t.description, t.acceptance, t.role, t.agentId, t.status,
      JSON.stringify(t.dependsOn), t.output, t.review, t.attempts, t.phase,
      t.engine ?? null, t.model ?? null, t.endpoint ?? null, t.routedBy ?? null,
      t.createdAt, t.updatedAt
    )
  }

  updateTask(id: string, patch: Partial<Task>) {
    const cur = this.task(id)
    if (!cur) return
    const n = { ...cur, ...patch, updatedAt: Date.now() }
    this.db.run(
      `UPDATE tasks SET parentId=?,title=?,description=?,acceptance=?,role=?,agentId=?,status=?,dependsOn=?,
        output=?,review=?,attempts=?,phase=?,engine=?,model=?,endpoint=?,routedBy=?,updatedAt=? WHERE id=?`,
      n.parentId, n.title, n.description, n.acceptance, n.role, n.agentId, n.status,
      JSON.stringify(n.dependsOn), n.output, n.review, n.attempts, n.phase,
      n.engine ?? null, n.model ?? null, n.endpoint ?? null, n.routedBy ?? null, n.updatedAt, id
    )
  }

  deleteTask(id: string) {
    this.db.run('DELETE FROM tasks WHERE id = ?', id)
  }

  // ---------- messages ----------
  messages(projectId?: string): Message[] {
    const rows = projectId
      ? this.db.all<Message>('SELECT * FROM messages WHERE projectId = ? ORDER BY createdAt ASC', projectId)
      : this.db.all<Message>('SELECT * FROM messages ORDER BY createdAt ASC')
    return rows
  }

  addMessage(input: Omit<Message, 'id' | 'createdAt'>): Message {
    const msg: Message = { ...input, id: `msg_${randomUUID().slice(0, 10)}`, createdAt: Date.now() }
    this.db.run(
      'INSERT INTO messages(id,projectId,taskId,sender,recipient,type,content,status,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',
      msg.id, msg.projectId, msg.taskId, msg.sender, msg.recipient, msg.type, msg.content, msg.status, msg.createdAt
    )
    return msg
  }

  // ---------- events ----------
  events(projectId?: string, limit = 400): RunEvent[] {
    const rows = projectId
      ? this.db.all<RunEvent>('SELECT * FROM events WHERE projectId = ? ORDER BY createdAt DESC LIMIT ?', projectId, limit)
      : this.db.all<RunEvent>('SELECT * FROM events ORDER BY createdAt DESC LIMIT ?', limit)
    return rows.reverse()
  }

  addEvent(e: Omit<RunEvent, 'id' | 'createdAt'>): RunEvent {
    const ev: RunEvent = { ...e, id: `evt_${randomUUID().slice(0, 10)}`, createdAt: Date.now() }
    this.db.run(
      'INSERT INTO events(id,projectId,agentId,taskId,type,message,createdAt) VALUES(?,?,?,?,?,?,?)',
      ev.id, ev.projectId, ev.agentId, ev.taskId, ev.type, ev.message, ev.createdAt
    )
    return ev
  }

  // ---------- sessions ----------
  sessions(projectId?: string, limit = 120): SessionRecord[] {
    const rows = projectId
      ? this.db.all<SessionRecord>('SELECT * FROM sessions WHERE projectId = ? ORDER BY startedAt DESC LIMIT ?', projectId, limit)
      : this.db.all<SessionRecord>('SELECT * FROM sessions ORDER BY startedAt DESC LIMIT ?', limit)
    return rows.map((r) => ({
      ...r,
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      costUsd: Number(r.costUsd ?? 0)
    }))
  }

  /** Reported spend for one worker. Engines that do not report cost stay at 0. */
  agentSpend(agentId: string): number {
    const row = this.db.get<{ total: number | null }>(
      'SELECT SUM(costUsd) AS total FROM sessions WHERE agentId = ?',
      agentId
    )
    return Number(row?.total ?? 0)
  }

  insertSession(s: SessionRecord) {
    this.db.run(
      `INSERT INTO sessions(id,projectId,agentId,taskId,engine,model,cwd,reasoning,status,exitCode,inputTokens,
        outputTokens,costUsd,externalId,command,startedAt,endedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      s.id, s.projectId, s.agentId, s.taskId, s.engine, s.model, s.cwd, s.reasoning ?? 'auto', s.status, s.exitCode,
      s.inputTokens, s.outputTokens, s.costUsd, s.externalId, s.command, s.startedAt, s.endedAt
    )
  }

  updateSession(id: string, patch: Partial<SessionRecord>) {
    const cur = this.db.get<SessionRecord>('SELECT * FROM sessions WHERE id = ?', id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      `UPDATE sessions SET status=?, exitCode=?, inputTokens=?, outputTokens=?, costUsd=?, externalId=?,
        endedAt=?, command=? WHERE id=?`,
      n.status, n.exitCode, n.inputTokens, n.outputTokens, n.costUsd, n.externalId, n.endedAt, n.command, id
    )
  }

  // ---------- jobs ----------
  jobs(projectId?: string): Job[] {
    const rows = projectId
      ? this.db.all<Job>('SELECT * FROM jobs WHERE projectId = ? ORDER BY createdAt DESC LIMIT 20', projectId)
      : this.db.all<Job>('SELECT * FROM jobs ORDER BY createdAt DESC LIMIT 20')
    return rows
  }

  insertJob(j: Job) {
    this.db.run(
      'INSERT INTO jobs(id,projectId,instruction,status,planSource,createdAt,updatedAt,error) VALUES(?,?,?,?,?,?,?,?)',
      j.id, j.projectId, j.instruction, j.status, j.planSource, j.createdAt, j.updatedAt, j.error
    )
  }

  updateJob(id: string, patch: Partial<Job>) {
    const cur = this.db.get<Job>('SELECT * FROM jobs WHERE id = ?', id)
    if (!cur) return
    const n = { ...cur, ...patch, updatedAt: Date.now() }
    this.db.run('UPDATE jobs SET status=?,planSource=?,updatedAt=?,error=? WHERE id=?', n.status, n.planSource, n.updatedAt, n.error, id)
  }

  runningJob(projectId: string): Job | undefined {
    return this.db.get<Job>("SELECT * FROM jobs WHERE projectId = ? AND status = 'running' LIMIT 1", projectId)
  }

  // ---------- memories ----------
  memories(projectId?: string | null): MemoryDoc[] {
    const rows = projectId
      ? this.db.all<Record<string, unknown>>(
        "SELECT * FROM memories WHERE projectId = ? OR projectId IS NULL ORDER BY pinned DESC, updatedAt DESC",
        projectId
      )
      : this.db.all<Record<string, unknown>>('SELECT * FROM memories ORDER BY pinned DESC, updatedAt DESC')
    return rows.map(mapMemory)
  }

  memory(id: string): MemoryDoc | undefined {
    const row = this.db.get<Record<string, unknown>>('SELECT * FROM memories WHERE id = ?', id)
    return row ? mapMemory(row) : undefined
  }

  saveMemory(input: Partial<MemoryDoc> & { path: string; title: string; body: string }): MemoryDoc {
    const existing = input.id
      ? this.memory(input.id)
      : this.db.get<Record<string, unknown>>('SELECT * FROM memories WHERE path = ?', input.path)
        ? mapMemory(this.db.get<Record<string, unknown>>('SELECT * FROM memories WHERE path = ?', input.path)!)
        : undefined
    const now = Date.now()
    const doc: MemoryDoc = {
      id: existing?.id ?? `mem_${randomUUID().slice(0, 10)}`,
      scope: input.scope ?? existing?.scope ?? 'project',
      projectId: input.projectId ?? existing?.projectId ?? null,
      agentId: input.agentId ?? existing?.agentId ?? null,
      path: input.path,
      title: input.title,
      body: input.body,
      tags: input.tags ?? existing?.tags ?? [],
      pinned: input.pinned ?? existing?.pinned ?? false,
      confidence: input.confidence ?? existing?.confidence ?? 0.7,
      source: input.source ?? existing?.source ?? 'owner',
      evidence: input.evidence ?? existing?.evidence ?? '',
      updatedAt: now
    }
    this.db.run(
      `INSERT INTO memories(id,scope,projectId,agentId,path,title,body,tags,pinned,confidence,source,evidence,updatedAt)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET scope=excluded.scope, projectId=excluded.projectId, agentId=excluded.agentId,
         path=excluded.path, title=excluded.title, body=excluded.body, tags=excluded.tags, pinned=excluded.pinned,
         confidence=excluded.confidence, source=excluded.source, evidence=excluded.evidence, updatedAt=excluded.updatedAt`,
      doc.id, doc.scope, doc.projectId, doc.agentId, doc.path, doc.title, doc.body,
      JSON.stringify(doc.tags), bolt(doc.pinned), doc.confidence, doc.source, doc.evidence, doc.updatedAt
    )
    return doc
  }

  deleteMemory(id: string) {
    this.db.run('DELETE FROM memories WHERE id = ?', id)
  }

  searchMemory(query: string, projectId?: string | null): MemoryDoc[] {
    const q = `%${query.toLowerCase()}%`
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT * FROM memories WHERE (lower(title) LIKE ? OR lower(body) LIKE ? OR lower(tags) LIKE ?)
       ORDER BY pinned DESC, updatedAt DESC LIMIT 40`,
      q, q, q
    )
    const mapped = rows.map(mapMemory)
    return projectId ? mapped.filter((m) => !m.projectId || m.projectId === projectId) : mapped
  }

  // ---------- skills ----------
  skills(): SkillRecord[] {
    return this.db.all<Record<string, unknown>>('SELECT * FROM skills ORDER BY name ASC').map((r) => {
      const id = String(r.id)
      const scanRaw = this.db.kvGet(`skillsec:${id}`)
      let scan: SkillRecord['scan'] = null
      if (scanRaw) {
        try {
          scan = JSON.parse(scanRaw) as SkillRecord['scan']
        } catch {
          scan = null
        }
      }
      return {
        ...(r as unknown as SkillRecord),
        enabled: unb(r.enabled),
        uses: Number(r.uses ?? 0),
        successes: Number(r.successes ?? 0),
        scan
      }
    })
  }

  upsertSkill(s: SkillRecord) {
    this.db.run(
      `INSERT INTO skills(id,name,description,path,enabled,version,uses,successes,source,updatedAt)
       VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, path=excluded.path,
         version=excluded.version, source=excluded.source, updatedAt=excluded.updatedAt`,
      s.id, s.name, s.description, s.path, bolt(s.enabled), s.version, s.uses, s.successes, s.source, s.updatedAt
    )
  }

  setSkillEnabled(id: string, enabled: boolean) {
    this.db.run('UPDATE skills SET enabled = ? WHERE id = ?', bolt(enabled), id)
  }

  recordSkillUse(id: string, success: boolean) {
    this.db.run('UPDATE skills SET uses = uses + 1, successes = successes + ? WHERE id = ?', success ? 1 : 0, id)
  }

  // ---------- automations ----------
  automations(projectId?: string): Automation[] {
    const rows = projectId
      ? this.db.all<Record<string, unknown>>('SELECT * FROM automations WHERE projectId = ?', projectId)
      : this.db.all<Record<string, unknown>>('SELECT * FROM automations')
    return rows.map((r) => ({ ...(r as unknown as Automation), enabled: unb(r.enabled) }))
  }

  addAutomation(a: Automation) {
    this.db.run(
      'INSERT INTO automations(id,projectId,name,instruction,intervalMinutes,enabled,lastRunAt,nextRunAt) VALUES(?,?,?,?,?,?,?,?)',
      a.id, a.projectId, a.name, a.instruction, a.intervalMinutes, bolt(a.enabled), a.lastRunAt, a.nextRunAt
    )
  }

  updateAutomation(id: string, patch: Partial<Automation>) {
    const cur = this.db.get<Automation>('SELECT * FROM automations WHERE id = ?', id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      'UPDATE automations SET enabled=?, lastRunAt=?, nextRunAt=? WHERE id=?',
      bolt(n.enabled), n.lastRunAt, n.nextRunAt, id
    )
  }

  deleteAutomation(id: string) {
    this.db.run('DELETE FROM automations WHERE id = ?', id)
  }

  // ---------- planning: conversations ----------
  conversation(projectId: string): Conversation {
    const existing = this.db.get<Conversation>(
      'SELECT * FROM conversations WHERE projectId = ? ORDER BY createdAt ASC LIMIT 1',
      projectId
    )
    if (existing) return existing
    const now = Date.now()
    const row: Conversation = { id: newId('cnv'), projectId, createdAt: now, updatedAt: now }
    this.db.run(
      'INSERT INTO conversations(id,projectId,createdAt,updatedAt) VALUES(?,?,?,?)',
      row.id, row.projectId, row.createdAt, row.updatedAt
    )
    return row
  }

  touchConversation(id: string) {
    this.db.run('UPDATE conversations SET updatedAt = ? WHERE id = ?', Date.now(), id)
  }

  chatMessages(projectId: string, limit = 400): ChatMessage[] {
    const rows = this.db.all<ChatMessage>(
      'SELECT * FROM chat_messages WHERE projectId = ? ORDER BY createdAt ASC LIMIT ?',
      projectId, limit
    )
    return rows
  }

  addChatMessage(input: Omit<ChatMessage, 'id' | 'createdAt'> & { createdAt?: number }): ChatMessage {
    const msg: ChatMessage = {
      ...input,
      id: newId('cht'),
      createdAt: input.createdAt ?? Date.now()
    }
    this.db.run(
      'INSERT INTO chat_messages(id,projectId,conversationId,role,content,model,status,createdAt) VALUES(?,?,?,?,?,?,?,?)',
      msg.id, msg.projectId, msg.conversationId, msg.role, msg.content, msg.model, msg.status, msg.createdAt
    )
    return msg
  }

  updateChatMessage(id: string, patch: Partial<ChatMessage>) {
    const cur = this.db.get<ChatMessage>('SELECT * FROM chat_messages WHERE id = ?', id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      'UPDATE chat_messages SET content=?, status=?, model=? WHERE id=?',
      n.content, n.status, n.model, id
    )
  }

  deleteChatMessage(id: string) {
    this.db.run('DELETE FROM chat_messages WHERE id = ?', id)
  }

  // ---------- planning: prompts ----------
  prompts(projectId: string): PromptDoc[] {
    return this.db.all<PromptDoc>(
      'SELECT * FROM prompts WHERE projectId = ? ORDER BY version ASC',
      projectId
    )
  }

  prompt(id: string): PromptDoc | undefined {
    return this.db.get<PromptDoc>('SELECT * FROM prompts WHERE id = ?', id)
  }

  /** Always a new row: a prompt is never overwritten in place. */
  addPrompt(input: Omit<PromptDoc, 'id' | 'createdAt' | 'version'> ): PromptDoc {
    const last = this.db.get<{ v: number | null }>(
      'SELECT MAX(version) AS v FROM prompts WHERE projectId = ?',
      input.projectId
    )
    const doc: PromptDoc = {
      ...input,
      id: newId('prm'),
      version: Number(last?.v ?? 0) + 1,
      createdAt: Date.now()
    }
    this.db.run(
      `INSERT INTO prompts(id,projectId,conversationId,title,body,version,source,parentId,createdAt)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      doc.id, doc.projectId, doc.conversationId, doc.title, doc.body, doc.version,
      doc.source, doc.parentId, doc.createdAt
    )
    return doc
  }

  // ---------- providers ----------
  providers(): ProviderConfig[] {
    return this.db.all<Record<string, unknown>>(
      'SELECT * FROM providers ORDER BY createdAt ASC'
    ).map((r) => ({
      ...(r as unknown as ProviderConfig),
      models: safeJson<string[]>(r.models as string, [])
    }))
  }

  addProvider(p: ProviderConfig) {
    this.db.run(
      'INSERT INTO providers(id,label,kind,engine,baseUrl,models,createdAt) VALUES(?,?,?,?,?,?,?)',
      p.id, p.label, p.kind, p.engine, p.baseUrl, JSON.stringify(p.models), p.createdAt
    )
  }

  updateProvider(id: string, patch: Partial<ProviderConfig>) {
    const cur = this.providers().find((p) => p.id === id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      'UPDATE providers SET label=?, kind=?, engine=?, baseUrl=?, models=? WHERE id=?',
      n.label, n.kind, n.engine, n.baseUrl, JSON.stringify(n.models), id
    )
  }

  deleteProvider(id: string) {
    this.db.run('DELETE FROM providers WHERE id = ?', id)
    this.db.kvDelete(`cred:provider:${id}`)
  }

  // ---------- assignments ----------
  assignments(projectId: string): Assignment[] {
    return this.db.all<Record<string, unknown>>(
      'SELECT * FROM assignments WHERE projectId = ? ORDER BY createdAt DESC',
      projectId
    ).map((r) => ({
      ...(r as unknown as Assignment),
      agents: safeJson<Assignment['agents']>(r.agents as string, [])
    }))
  }

  addAssignment(a: Assignment) {
    this.db.run(
      'INSERT INTO assignments(id,projectId,promptId,jobId,mode,agents,createdAt) VALUES(?,?,?,?,?,?,?)',
      a.id, a.projectId, a.promptId, a.jobId, a.mode, JSON.stringify(a.agents), a.createdAt
    )
  }

  // ---------- model preferences ----------
  modelPrefs(): ModelPrefs {
    const raw = this.db.kvGet('modelPrefs')
    if (!raw) return { favorites: [], recents: [] }
    try {
      const parsed = JSON.parse(raw) as Partial<ModelPrefs>
      return { favorites: parsed.favorites ?? [], recents: parsed.recents ?? [] }
    } catch {
      return { favorites: [], recents: [] }
    }
  }

  saveModelPrefs(patch: Partial<ModelPrefs>): ModelPrefs {
    const next = { ...this.modelPrefs(), ...patch }
    this.db.kvSet('modelPrefs', JSON.stringify(next))
    return next
  }

  snapshot(
    providers: ProviderStatus[],
    preview?: PreviewState,
    models: ModelOption[] = [],
    requested?: string | null
  ): Snapshot {
    // Each window passes its own project. Without one, fall back to the last used.
    const active = requested !== undefined ? requested : this.activeProjectId()
    const projectId = active && this.project(active) ? active : this.projects()[0]?.id ?? null
    return {
      projects: this.projects(),
      activeProjectId: projectId,
      agents: projectId ? this.agents(projectId) : [],
      tasks: projectId ? this.tasks(projectId) : [],
      messages: projectId ? this.messages(projectId).slice(-120) : [],
      events: projectId ? this.events(projectId) : [],
      sessions: projectId ? this.sessions(projectId) : [],
      memories: this.memories(projectId),
      skills: this.skills(),
      automations: projectId ? this.automations(projectId) : [],
      providers,
      settings: this.settings(),
      jobs: projectId ? this.jobs(projectId) : [],
      preview: preview ?? {
        projectId,
        kind: 'unknown',
        label: 'No artifact yet',
        status: 'off',
        url: null,
        command: '',
        detail: '',
        artifactPath: null,
        artifactUrl: null,
        needsInstall: false,
        installCommand: null,
        logs: [],
        revision: 0,
        startedAt: null
      },
      running: Boolean(projectId && this.runningJob(projectId)),
      conversation: projectId ? this.conversation(projectId) : null,
      chat: projectId ? this.chatMessages(projectId) : [],
      prompts: projectId ? this.prompts(projectId) : [],
      providerConfigs: this.providers(),
      assignments: projectId ? this.assignments(projectId) : [],
      modelPrefs: this.modelPrefs(),
      models
    }
  }
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function mapMemory(r: Record<string, unknown>): MemoryDoc {
  return {
    ...(r as unknown as MemoryDoc),
    tags: safeJson<string[]>(r.tags as string, []),
    pinned: unb(r.pinned),
    confidence: Number(r.confidence ?? 0.6)
  }
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}
