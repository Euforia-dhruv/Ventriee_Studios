export type EngineKind =
  | 'cli-opencode'
  | 'cli-claude'
  | 'cli-codex'
  | 'cli-gemini'
  | 'cli-ollama'
  | 'cli-custom'
  | 'api-openai'
  | 'api-anthropic'
  | 'api-gemini'
  | 'api-openrouter'
  | 'api-deepseek'
  | 'api-mistral'
  | 'api-deploy'
  | 'api-inception'
  | 'api-ollama'
  | 'api-lmstudio'
  | 'api-vllm'
  | 'api-custom'

export const ENGINE_LABELS: Record<EngineKind, string> = {
  'cli-opencode': 'OpenCode CLI',
  'cli-claude': 'Claude Code CLI',
  'cli-codex': 'Codex CLI',
  'cli-gemini': 'Gemini CLI',
  'cli-ollama': 'Ollama CLI',
  'cli-custom': 'Custom CLI',
  'api-openai': 'OpenAI API',
  'api-anthropic': 'Anthropic API',
  'api-gemini': 'Google Gemini API',
  'api-openrouter': 'OpenRouter',
  'api-deepseek': 'DeepSeek API',
  'api-mistral': 'Mistral API',
  'api-deploy': 'Deploy (DeepSeek V4.1)',
  'api-inception': 'Inception (Mercury)',
  'api-ollama': 'Ollama HTTP',
  'api-lmstudio': 'LM Studio',
  'api-vllm': 'vLLM',
  'api-custom': 'Custom OpenAI-compatible'
}

/** Default base URL per provider. Shared so the renderer and the runner agree. */
export const ENGINE_ENDPOINTS: Partial<Record<EngineKind, string>> = {
  'api-openai': 'https://api.openai.com/v1',
  'api-anthropic': 'https://api.anthropic.com/v1',
  'api-gemini': 'https://generativelanguage.googleapis.com/v1beta',
  'api-openrouter': 'https://openrouter.ai/api/v1',
  'api-deepseek': 'https://api.deepseek.com/v1',
  'api-mistral': 'https://api.mistral.ai/v1',
  'api-deploy': 'https://api-sf1-cdn.deploy.com/api/v1',
  'api-inception': 'https://api.inceptionlabs.ai/v1',
  'api-ollama': 'http://127.0.0.1:11434/v1',
  'api-lmstudio': 'http://127.0.0.1:1234/v1',
  'api-vllm': 'http://127.0.0.1:8000/v1'
}

export type Autonomy = 'ask' | 'scoped' | 'autonomous'

/**
 * How much the model may think before it answers. 'auto' sends nothing and lets the model
 * decide; the rest map onto the provider's own knob (OpenAI `reasoning_effort`, Anthropic
 * thinking budget). CLI engines get it on the command line.
 */
export type ReasoningEffort = 'auto' | 'none' | 'low' | 'medium' | 'high'

/** Manual: every model is chosen. Automatic: the router picks. Hybrid: defaults, router may override. */
export type RoutingMode = 'manual' | 'automatic' | 'hybrid'

export type CostPreference = 'cheap' | 'balanced' | 'quality'

/** A planning conversation message. Separate from worker mail. */
export interface ChatMessage {
  id: string
  projectId: string
  conversationId: string
  role: 'owner' | 'assistant'
  content: string
  /** Model that produced an assistant turn, so the transcript stays honest. */
  model: string
  status: 'done' | 'streaming' | 'error'
  createdAt: number
}

export interface Conversation {
  id: string
  projectId: string
  createdAt: number
  updatedAt: number
}

export type PromptSource = 'generated' | 'enhanced' | 'edited' | 'restored'

/** Every prompt revision is a row. Nothing is overwritten in place. */
export interface PromptDoc {
  id: string
  projectId: string
  conversationId: string
  title: string
  body: string
  version: number
  source: PromptSource
  parentId: string | null
  createdAt: number
}

export interface ProviderConfig {
  id: string
  label: string
  kind: 'openai' | 'anthropic' | 'gemini'
  engine: EngineKind
  baseUrl: string
  models: string[]
  createdAt: number
}

export interface ModelOption {
  /** EngineKind for built-ins, provider id for configured ones. */
  provider: string
  providerLabel: string
  model: string
  /** null means the provider does not report pricing; never guessed. */
  free: boolean | null
  configured: boolean
  note?: string
}

export interface ModelPrefs {
  /** `${provider}::${model}` */
  favorites: string[]
  recents: string[]
}

export interface Assignment {
  id: string
  projectId: string
  promptId: string
  jobId: string
  mode: 'orchestrator' | 'manual'
  agents: Array<{ agentId: string; name: string; model: string }>
  createdAt: number
}

export interface AssignPromptInput {
  projectId: string
  promptId: string
  mode: 'orchestrator' | 'manual'
  /** Manual mode: one task per entry, in this order. */
  agents?: Array<{
    agentId: string
    model?: string
    providerId?: string | null
    /** Built-in engines have no provider id, so the engine travels with the pick. */
    engine?: EngineKind
    endpoint?: string
  }>
  /** Extra instruction appended to every task, e.g. a phase hint. */
  note?: string
}

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'paused' | 'error' | 'offline'

export type TaskStatus =
  | 'todo'
  | 'ready'
  | 'running'
  | 'review'
  | 'rework'
  | 'blocked'
  | 'approval'
  | 'done'
  | 'failed'

export interface Project {
  id: string
  name: string
  path: string
  description: string
  createdAt: number
  updatedAt: number
}

export interface Agent {
  id: string
  projectId: string
  role: string
  name: string
  title: string
  engine: EngineKind
  model: string
  endpoint: string
  instructions: string
  autonomy: Autonomy
  /** How much the model may think per turn. Recorded on the session so a run can be explained. */
  reasoning: ReasoningEffort
  /** Skill ids offered to this worker. Empty means the skills of its role template. */
  skills: string[]
  concurrency: number
  budgetUsd: number
  color: string
  desk: number
  enabled: boolean
  status: AgentStatus
  currentTaskId: string | null
  lastError: string | null
  createdAt: number
}

export interface Task {
  id: string
  projectId: string
  parentId: string | null
  title: string
  description: string
  acceptance: string
  role: string
  agentId: string | null
  status: TaskStatus
  dependsOn: string[]
  output: string
  review: string
  attempts: number
  phase: string
  /** Per-task routing override. Null means use the worker's own configuration. */
  engine: EngineKind | null
  model: string | null
  endpoint: string | null
  routedBy: RoutingMode | null
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  projectId: string
  taskId: string | null
  sender: string
  recipient: string
  type: 'note' | 'request' | 'blocker' | 'handover' | 'review' | 'owner'
  content: string
  status: 'unread' | 'read' | 'done'
  createdAt: number
}

export interface RunEvent {
  id: string
  projectId: string
  agentId: string | null
  taskId: string | null
  type: string
  message: string
  createdAt: number
}

export interface SessionRecord {
  id: string
  projectId: string
  agentId: string
  taskId: string | null
  engine: EngineKind
  model: string
  cwd: string
  /** Thinking budget the session actually ran with, so the record matches reality. */
  reasoning: ReasoningEffort
  status: 'running' | 'done' | 'failed' | 'stopped'
  exitCode: number | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  externalId: string | null
  command: string
  startedAt: number
  endedAt: number | null
}

export interface MemoryDoc {
  id: string
  scope: 'global' | 'project' | 'agent' | 'session' | 'skill'
  projectId: string | null
  agentId: string | null
  path: string
  title: string
  body: string
  tags: string[]
  pinned: boolean
  confidence: number
  source: string
  evidence: string
  updatedAt: number
}

export interface SkillScanReport {
  score: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  recommendation: 'SAFE' | 'CAUTION' | 'DO NOT INSTALL'
  executable: boolean
  findings: Array<{ id: string; severity: string; title: string; location: string; detail: string }>
}

export interface SkillRecord {
  id: string
  name: string
  description: string
  path: string
  enabled: boolean
  version: string
  uses: number
  successes: number
  source: string
  updatedAt: number
  /** SkillSpector-style scan result, present after the registry has scanned this skill. */
  scan?: SkillScanReport | null
}

export interface Automation {
  id: string
  projectId: string
  name: string
  instruction: string
  intervalMinutes: number
  enabled: boolean
  lastRunAt: number | null
  nextRunAt: number | null
}

export interface ProviderStatus {
  engine: EngineKind
  label: string
  kind: 'cli' | 'api'
  available: boolean
  detail: string
  configured: boolean
}

export interface AppSettings {
  defaultProjectId: string | null
  orchestratorEngine: EngineKind
  orchestratorModel: string
  maxConcurrentSessions: number
  sessionTimeoutMinutes: number
  autoExtractLessons: boolean
  requireDeployApproval: boolean
  reducedMotion: boolean
  plannerFallback: boolean
  /** Who picks models: the owner, the orchestrator, or both. */
  routingMode: RoutingMode
  costPreference: CostPreference
  /** Engine used for planning chat, prompt generation and enhancement. */
  plannerEngine: EngineKind
  plannerModel: string
  plannerEndpoint: string
}

export type ArtifactKind =
  | 'web'
  | 'static'
  | 'node'
  | 'python'
  | 'image'
  | 'document'
  | 'data'
  | 'unknown'

export interface PreviewState {
  projectId: string | null
  kind: ArtifactKind
  label: string
  status: 'off' | 'starting' | 'ready' | 'error' | 'external' | 'manual'
  url: string | null
  command: string
  detail: string
  artifactPath: string | null
  artifactUrl: string | null
  /** Declared packages are missing from disk; start would fail without an install. */
  needsInstall: boolean
  /** The exact install command, shown before it runs. */
  installCommand: string | null
  logs: string[]
  revision: number
  startedAt: number | null
}

export interface Job {
  id: string
  projectId: string
  instruction: string
  status: 'running' | 'done' | 'failed' | 'stopped' | 'paused'
  planSource: 'model' | 'heuristic'
  createdAt: number
  updatedAt: number
  error: string | null
}

export interface Snapshot {
  projects: Project[]
  activeProjectId: string | null
  agents: Agent[]
  tasks: Task[]
  messages: Message[]
  events: RunEvent[]
  sessions: SessionRecord[]
  memories: MemoryDoc[]
  skills: SkillRecord[]
  automations: Automation[]
  providers: ProviderStatus[]
  settings: AppSettings
  jobs: Job[]
  preview: PreviewState
  running: boolean
  /** Planning state for the active project. */
  conversation: Conversation | null
  chat: ChatMessage[]
  prompts: PromptDoc[]
  providerConfigs: ProviderConfig[]
  assignments: Assignment[]
  modelPrefs: ModelPrefs
  /** Model options discovered from real providers; never a hardcoded catalogue. */
  models: ModelOption[]
}

export interface StartRunInput {
  projectId: string
  instruction: string
}

export interface CreateAgentInput {
  projectId: string
  role: string
  name: string
  title: string
  engine: EngineKind
  model: string
  endpoint: string
  instructions: string
  autonomy: Autonomy
  reasoning: ReasoningEffort
  skills?: string[]
  color: string
  budgetUsd: number
}

export interface ChatRequest {
  engine: EngineKind
  model: string
  endpoint: string
  system: string
  prompt: string
  maxTokens?: number
  signal?: AbortSignal
  onDelta?: (text: string) => void
}
