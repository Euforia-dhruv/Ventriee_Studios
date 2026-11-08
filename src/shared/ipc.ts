import type {
  Agent,
  AppSettings,
  AssignPromptInput,
  Assignment,
  Automation,
  ChatMessage,
  CreateAgentInput,
  EngineKind,
  MemoryDoc,
  Message,
  ModelOption,
  ModelPrefs,
  PreviewState,
  Project,
  PromptDoc,
  ProviderConfig,
  ProviderStatus,
  SkillRecord,
  SkillScanReport,
  Snapshot,
  StartRunInput,
  Task
} from './types'

export const IPC = {
  snapshot: 'state:snapshot',
  patch: 'state:patch',
  output: 'agent:output',
  chatChunk: 'chat:chunk',
  testEngine: 'engine:test',
  createProject: 'project:create',
  selectProject: 'project:select',
  openProjectWindow: 'project:openWindow',
  updateProject: 'project:update',
  deleteProject: 'project:delete',
  pickFolder: 'project:pickFolder',
  createAgent: 'agent:create',
  updateAgent: 'agent:update',
  deleteAgent: 'agent:delete',
  duplicateAgent: 'agent:duplicate',
  startRun: 'run:start',
  stopRun: 'run:stop',
  approveTask: 'task:approve',
  rejectTask: 'task:reject',
  retryTask: 'task:retry',
  stopAgent: 'agent:stop',
  pauseAgent: 'agent:pause',
  resumeAgent: 'agent:resume',
  instructAgent: 'agent:instruct',
  saveMemory: 'memory:save',
  deleteMemory: 'memory:delete',
  pinMemory: 'memory:pin',
  searchMemory: 'memory:search',
  importSkill: 'skill:import',
  toggleSkill: 'skill:toggle',
  refreshSkills: 'skill:refresh',
  saveSettings: 'settings:save',
  credentials: 'settings:credentials',
  saveCredential: 'settings:credential',
  clearCredential: 'settings:credentialClear',
  addAutomation: 'automation:add',
  toggleAutomation: 'automation:toggle',
  deleteAutomation: 'automation:delete',
  previewStart: 'preview:start',
  previewInstall: 'preview:install',
  previewStop: 'preview:stop',
  previewRefresh: 'preview:refresh',
  previewArtifact: 'preview:artifact',
  previewApiRequest: 'preview:apiRequest',
  openPath: 'shell:openPath',
  openExternal: 'shell:openExternal',
  revealFile: 'shell:reveal',
  chatSend: 'chat:send',
  promptCreate: 'prompt:create',
  promptEnhance: 'prompt:enhance',
  promptSave: 'prompt:save',
  assignPrompt: 'prompt:assign',
  chatAdvisor: 'chat:advisor',
  modelsDiscover: 'models:discover',
  modelPrefs: 'models:prefs',
  addProvider: 'provider:add',
  updateProvider: 'provider:update',
  deleteProvider: 'provider:delete',
  testProvider: 'provider:test'
} as const

export interface CredentialInfo {
  engine: EngineKind
  configured: boolean
  hint: string
}

export interface SkillImportResult {
  skill: SkillRecord | null
  report: SkillScanReport
  removed: boolean
}

export interface VentrieeApi {
  snapshot(): Promise<Snapshot>
  onPatch(cb: (patch: Snapshot) => void): () => void
  onOutput(cb: (payload: { sessionId: string; agentId: string; taskId: string | null; chunk: string }) => void): () => void
  testEngine(engine: EngineKind, model: string, endpoint: string): Promise<{ ok: boolean; detail: string }>
  createProject(input: { name: string; path: string; description: string }): Promise<Project>
  pickFolder(): Promise<string | null>
  selectProject(id: string): Promise<void>
  openProjectWindow(projectId: string): Promise<void>
  updateProject(id: string, patch: Partial<Project>): Promise<void>
  deleteProject(id: string): Promise<void>
  createAgent(input: CreateAgentInput): Promise<Agent>
  updateAgent(id: string, patch: Partial<Agent>): Promise<Agent>
  deleteAgent(id: string): Promise<void>
  duplicateAgent(id: string): Promise<Agent>
  startRun(input: StartRunInput): Promise<{ jobId: string }>
  stopRun(projectId: string): Promise<void>
  approveTask(taskId: string): Promise<void>
  rejectTask(taskId: string, reason: string): Promise<void>
  retryTask(taskId: string): Promise<void>
  stopAgent(agentId: string): Promise<void>
  pauseAgent(agentId: string): Promise<void>
  resumeAgent(agentId: string): Promise<void>
  instructAgent(agentId: string, text: string): Promise<void>
  saveMemory(input: Partial<MemoryDoc> & { path: string; title: string; body: string }): Promise<MemoryDoc>
  deleteMemory(id: string): Promise<void>
  pinMemory(id: string): Promise<void>
  searchMemory(query: string): Promise<MemoryDoc[]>
  importSkill(): Promise<SkillImportResult | null>
  toggleSkill(id: string): Promise<void>
  refreshSkills(): Promise<SkillRecord[]>
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  saveCredential(engine: EngineKind, value: string): Promise<void>
  clearCredential(engine: EngineKind): Promise<void>
  credentials(): Promise<CredentialInfo[]>
  addAutomation(input: { projectId: string; name: string; instruction: string; intervalMinutes: number }): Promise<Automation>
  toggleAutomation(id: string): Promise<void>
  deleteAutomation(id: string): Promise<void>
  previewStart(projectId: string): Promise<PreviewState>
  previewInstall(projectId: string): Promise<PreviewState>
  previewStop(projectId: string): Promise<PreviewState>
  previewRefresh(projectId: string): Promise<PreviewState>
  previewArtifact(projectId: string, path: string): Promise<{ ok: boolean; data?: string; mime?: string; error?: string }>
  /** Fire a request from the main process (no CORS) against a preview service. */
  previewApiRequest(input: { baseUrl: string; method: string; path: string; body?: string; timeoutMs?: number }): Promise<{
    ok: boolean
    status?: number
    statusText?: string
    contentType?: string
    body?: string
    error?: string
  }>
  openPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  revealFile(path: string): Promise<void>
  chatSend(input: { projectId: string; text: string; engine: EngineKind; model: string; endpoint: string }): Promise<ChatMessage>
  onChatChunk(cb: (payload: { projectId: string; messageId: string; chunk: string }) => void): () => void
  promptCreate(input: { projectId: string; engine: EngineKind; model: string; endpoint: string }): Promise<PromptDoc>
  promptEnhance(input: { projectId: string; promptId: string; engine: EngineKind; model: string; endpoint: string }): Promise<PromptDoc>
  promptSave(input: { projectId: string; promptId: string; body: string; source: 'edited' | 'restored' }): Promise<PromptDoc>
  assignPrompt(input: AssignPromptInput): Promise<{ jobId: string; taskCount: number }>
  /** Advisor side-chat: talk with a model that sees the current project state. */
  chatAdvisor(input: { projectId: string; text: string }): Promise<{ reply: string; model: string }>
  modelsDiscover(projectId: string | null): Promise<ModelOption[]>
  saveModelPrefs(patch: Partial<ModelPrefs>): Promise<ModelPrefs>
  addProvider(input: {
    label: string
    kind: 'openai' | 'anthropic' | 'gemini'
    engine: EngineKind
    baseUrl: string
    apiKey: string
    models: string[]
  }): Promise<ProviderConfig>
  updateProvider(id: string, patch: Partial<ProviderConfig> & { apiKey?: string }): Promise<ProviderConfig>
  deleteProvider(id: string): Promise<void>
  testProvider(input: {
    id?: string
    engine: EngineKind
    baseUrl: string
    apiKey?: string
    model: string
  }): Promise<{ ok: boolean; detail: string; models: string[] }>
}

export type TaskPatch = Partial<Task>
export type MessageInput = Omit<Message, 'id' | 'createdAt'>
