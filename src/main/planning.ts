import { randomUUID } from 'node:crypto'
import type { Store } from './store'
import type { Credentials } from './credentials'
import type { MemoryService } from './memory'
import { runEngine, modelFor, defaultEndpoint, testEngine } from './engines'
import { ENGINE_LABELS } from '../shared/types'
import type {
  ChatMessage,
  EngineKind,
  ModelOption,
  Project,
  PromptDoc,
  ProviderConfig
} from '../shared/types'
import { redact } from './redact'
import { ensureSections } from './brief'

/**
 * Planner chat is deliberately separate from worker execution: nothing here
 * queues a task or starts a session. It only talks, then produces prompt text
 * the owner can edit, enhance, and hand to the orchestrator explicitly.
 */

const CHAT_SYSTEM = `You are the planning partner inside Ventriee Studios, a software studio.

The owner is describing something they want built. Your job in this conversation is to plan, not to build.

Rules:
- Never claim you have created files, run commands, or started work. You have not; this is conversation only.
- Ask the smallest set of high-value questions that would change the design. Do not interrogate.
- When the owner is vague, say what is missing in one line, then propose a concrete default so they can just agree.
- Be concrete about technology, data model, auth and deployment when the owner's idea already implies them.
- Keep replies short and dense. No filler, no restating their message back to them.
- Markdown is fine; use it sparingly (short lists, bold labels).`

const PROMPT_SYSTEM = `You are a senior technical planner writing a development brief for an engineering team.

Produce a single structured Markdown document with exactly these sections, in this order:
## Objective
## Requirements
## Features
## UI/UX Direction
## Technical Architecture
## Technology Stack
## Backend Requirements
## Database Requirements
## API Requirements
## Security Requirements
## Implementation Instructions
## Testing and Acceptance Criteria

Rules:
- Only state decisions the conversation supports. Where the owner left something open, choose a sensible default and mark it clearly as a default.
- Be specific: names, versions, endpoints, table columns, status codes. No hedging.
- No preamble, no closing remarks. Output the document only.`

const ENHANCE_SYSTEM = `You are reviewing a development brief before an engineering team starts work.

Rewrite the brief so it is unambiguous and complete. You must:
- Tighten vague instructions into testable ones.
- Add requirements that are obviously missing for this kind of product.
- Resolve contradictions and remove duplication.
- Add edge cases, security considerations and performance limits where relevant.
- Put implementation work in a sensible dependency order.
- Make every acceptance criterion checkable by someone who did not write it.
- Keep everything the original already got right; do not invent scope the owner never asked for.

Keep the same section headings. Output the improved document only, no commentary.`

export class PlanningService {
  constructor(
    private store: Store,
    private creds: Credentials,
    private memory: MemoryService,
    private notify: () => void,
    private emitChunk: (payload: { projectId: string; messageId: string; chunk: string }) => void
  ) {}

  private secrets(): string[] {
    return this.creds.secretValues()
  }

  private systemPrompt(project: Project, extra?: string): string {
    const docs = this.memory.retrieve(project.id, `${project.name} ${project.description}`, 4)
    const block = docs.length ? `\n\nKnown project context:\n${this.memory.promptBlock(docs)}` : ''
    return `${extra ?? CHAT_SYSTEM}\n\nProject: ${project.name}\nWorkspace: ${project.path}${block}`
  }

  /**
   * One planning turn. Streams into the stored assistant row so the transcript
   * survives a restart even if the stream was cut short.
   */
  async sendChat(
    project: Project,
    text: string,
    choice: { engine: EngineKind; model: string; endpoint: string }
  ): Promise<{ owner: ChatMessage; assistant: ChatMessage }> {
    const conversation = this.store.conversation(project.id)
    const owner = this.store.addChatMessage({
      projectId: project.id,
      conversationId: conversation.id,
      role: 'owner',
      content: text,
      model: '',
      status: 'done'
    })
    const assistant = this.store.addChatMessage({
      projectId: project.id,
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      model: choice.model || modelFor(choice.engine, choice.model),
      status: 'streaming'
    })
    this.store.touchConversation(conversation.id)
    this.notify()

    const history = this.store.chatMessages(project.id).slice(-14)
    const transcript = history
      .filter((m) => m.id !== assistant.id && m.content.trim())
      .map((m) => `${m.role === 'owner' ? 'Owner' : 'You'}: ${m.content}`)
      .join('\n\n')

    let text2 = ''
    const result = await runEngine(
      {
        engine: choice.engine,
        model: choice.model,
        endpoint: choice.endpoint || defaultEndpoint(choice.engine),
        system: this.systemPrompt(project),
        prompt: `${transcript}\n\nReply to the Owner's last message.`,
        cwd: project.path,
        maxTokens: 3000,
        timeoutMs: 6 * 60_000,
        stallMs: 120_000,
        onChunk: (chunk) => {
          text2 += chunk
          this.store.updateChatMessage(assistant.id, { content: redact(text2, this.secrets()) })
          this.emitChunk({ projectId: project.id, messageId: assistant.id, chunk })
        }
      },
      this.creds
    )

    const final = redact(result.ok ? result.text || text2 : `Conversation failed: ${result.error ?? 'unknown error'}`, this.secrets())
    this.store.updateChatMessage(assistant.id, {
      content: final,
      status: result.ok ? 'done' : 'error',
      model: modelFor(choice.engine, choice.model)
    })
    this.store.touchConversation(conversation.id)
    this.notify()
    return {
      owner,
      assistant: { ...assistant, content: final, status: result.ok ? 'done' : 'error' }
    }
  }

  /** Build the structured development prompt from the conversation so far. */
  async createPrompt(
    project: Project,
    choice: { engine: EngineKind; model: string; endpoint: string }
  ): Promise<PromptDoc> {
    const conversation = this.store.conversation(project.id)
    const transcript = this.store
      .chatMessages(project.id)
      .filter((m) => m.content.trim())
      .map((m) => `${m.role === 'owner' ? 'Owner' : 'Planner'}: ${m.content}`)
      .join('\n\n')
    if (!transcript.trim()) throw new Error('Talk through the idea first: the prompt is built from the conversation.')

    const result = await runEngine(
      {
        engine: choice.engine,
        model: choice.model,
        endpoint: choice.endpoint || defaultEndpoint(choice.engine),
        system: this.systemPrompt(project, PROMPT_SYSTEM),
        prompt: `Conversation so far:\n\n${transcript}\n\nWrite the development brief.`,
        cwd: project.path,
        maxTokens: 4000,
        timeoutMs: 8 * 60_000,
        stallMs: 150_000
      },
      this.creds
    )
    if (!result.ok || !result.text.trim()) {
      throw new Error(`Prompt generation failed: ${result.error ?? 'the model returned nothing'}`)
    }
    const doc = this.store.addPrompt({
      projectId: project.id,
      conversationId: conversation.id,
      title: project.name,
      body: ensureSections(redact(result.text, this.secrets())),
      source: 'generated',
      parentId: null
    })
    this.notify()
    return doc
  }

  /** A new revision that references the original. The original row is untouched. */
  async enhancePrompt(
    project: Project,
    promptId: string,
    choice: { engine: EngineKind; model: string; endpoint: string }
  ): Promise<PromptDoc> {
    const base = this.store.prompt(promptId)
    if (!base) throw new Error('Prompt not found')
    const conversation = this.store.conversation(project.id)
    const notes = this.store
      .chatMessages(project.id)
      .slice(-10)
      .map((m) => `${m.role === 'owner' ? 'Owner' : 'Planner'}: ${m.content}`)
      .join('\n\n')

    const result = await runEngine(
      {
        engine: choice.engine,
        model: choice.model,
        endpoint: choice.endpoint || defaultEndpoint(choice.engine),
        system: this.systemPrompt(project, ENHANCE_SYSTEM),
        prompt: `Brief to improve:\n\n${base.body}\n\nConversation context, for decisions the brief left loose:\n\n${notes}`,
        cwd: project.path,
        maxTokens: 4500,
        timeoutMs: 8 * 60_000,
        stallMs: 150_000
      },
      this.creds
    )
    if (!result.ok || !result.text.trim()) {
      throw new Error(`Enhancement failed: ${result.error ?? 'the model returned nothing'}`)
    }
    const doc = this.store.addPrompt({
      projectId: project.id,
      conversationId: conversation.id,
      title: base.title,
      body: ensureSections(redact(result.text, this.secrets())),
      source: 'enhanced',
      parentId: base.id
    })
    this.notify()
    return doc
  }

  /** Manual edit is its own revision, so nothing is ever lost. */
  savePromptEdit(
    project: Project,
    input: { id: string; body: string; source: 'edited' | 'restored' }
  ): PromptDoc {
    const base = this.store.prompt(input.id)
    if (!base) throw new Error('Prompt not found')
    const doc = this.store.addPrompt({
      projectId: project.id,
      conversationId: base.conversationId,
      title: base.title,
      body: input.body,
      source: input.source,
      parentId: base.id
    })
    this.notify()
    return doc
  }

  // ------------------------------------------------------------------ models
  /**
   * Ask each reachable provider what it actually serves. Nothing is invented:
   * a provider that cannot be listed contributes no options, and a configured
   * model that is not listed is shown as unverified rather than as available.
   */
  async discoverModels(projectRoot: string): Promise<ModelOption[]> {
    const out: ModelOption[] = []
    const configs = this.store.providers()

    for (const config of configs) {
      const options = await this.listProviderModels(config, projectRoot)
      out.push(...options)
    }

    // Built-in engines that are present on this machine.
    for (const engine of ['cli-opencode', 'cli-claude', 'cli-codex', 'cli-gemini', 'cli-ollama'] as EngineKind[]) {
      const listed = await this.cliModels(engine, projectRoot)
      out.push(...listed)
    }

    for (const engine of ['api-ollama', 'api-lmstudio', 'api-vllm'] as EngineKind[]) {
      const local = await this.httpModels(engine, engine, ENGINE_LABELS[engine], defaultEndpoint(engine), null)
      out.push(...local)
    }

    for (const engine of ['api-openai', 'api-anthropic', 'api-gemini', 'api-openrouter', 'api-deepseek', 'api-mistral', 'api-deploy', 'api-inception'] as EngineKind[]) {
      const key = this.creds.get(engine)
      // Some providers publish their catalogue without a key (Inception does).
      // Listing it without one shows a real model that only needs a key, rather
      // than pretending the provider does not exist until it is configured.
      const listed = await this.httpModels(engine, engine, ENGINE_LABELS[engine], defaultEndpoint(engine), key)
      out.push(...listed.map((m) => (key ? m : { ...m, configured: false, note: 'Add an API key to use this model' })))
    }

    return dedupeModels(out)
  }

  /**
   * Probe a provider before saving it. Returns the models it actually listed,
   * so the UI can show a real catalogue instead of an invented one.
   */
  async testProviderConfig(input: {
    engine: EngineKind
    baseUrl: string
    apiKey?: string
    kind?: 'openai' | 'anthropic' | 'gemini'
  }): Promise<{ ok: boolean; detail: string; models: string[] }> {
    const key = input.apiKey?.trim() || (input.engine ? this.creds.get(input.engine) : null)
    const base = (input.baseUrl || defaultEndpoint(input.engine)).replace(/\/$/, '')
    if (!base) return { ok: false, detail: 'Enter a base URL', models: [] }

    const generic = await this.httpModels(
      'probe',
      input.engine,
      'probe',
      base,
      key,
      input.kind
        ? ({ engine: input.engine, kind: input.kind } as ProviderConfig)
        : undefined
    )
    if (generic.length) {
      return { ok: true, detail: `${generic.length} models served at ${base}`, models: generic.map((m) => m.model) }
    }

    // Listing can be closed while chat still works; prove reachability another way.
    try {
      if (input.kind === 'anthropic' || input.engine === 'api-anthropic') {
        if (!key) return { ok: false, detail: 'No API key provided', models: [] }
        const res = await fetch(`${base}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(12_000)
        })
        return res.ok
          ? { ok: true, detail: 'Anthropic reachable, key accepted', models: [] }
          : { ok: false, detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`, models: [] }
      }
      const res = await fetch(`${base}/models`, {
        headers: key ? { authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(12_000)
      })
      if (res.ok) return { ok: true, detail: `${base} reachable, no model list published`, models: [] }
      return { ok: false, detail: `HTTP ${res.status} from ${base}/models`, models: [] }
    } catch (error) {
      return { ok: false, detail: (error as Error).message, models: [] }
    }
  }

  private async listProviderModels(config: ProviderConfig, cwd: string): Promise<ModelOption[]> {
    const key = this.providerKey(config.id)
    return this.httpModels(config.id, config.engine, config.label, config.baseUrl, key, config)
  }

  private providerKey(providerId: string): string | null {
    return this.creds.getKey(`cred:provider:${providerId}`)
  }

  private async httpModels(
    providerId: string,
    engine: EngineKind,
    label: string,
    baseUrl: string,
    key: string | null,
    config?: ProviderConfig
  ): Promise<ModelOption[]> {
    const base = (baseUrl || defaultEndpoint(engine)).replace(/\/$/, '')
    if (!base) return []
    try {
      if (engine === 'api-gemini' || config?.kind === 'gemini') {
        const url = key ? `${base}/models?key=${key}` : `${base}/models`
        const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
        if (!res.ok) return []
        const body = (await res.json()) as { models?: Array<{ name?: string; displayName?: string }> }
        return (body.models ?? [])
          .map((m) => (m.name ?? '').replace(/^models\//, ''))
          .filter(Boolean)
          .map((model) => ({
            provider: providerId,
            providerLabel: label,
            model,
            free: null,
            configured: true
          }))
      }
      if (engine === 'api-anthropic' || config?.kind === 'anthropic') {
        if (!key) return []
        const res = await fetch(`${base}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(12_000)
        })
        if (!res.ok) return []
        const body = (await res.json()) as { data?: Array<{ id?: string }> }
        return (body.data ?? []).map((m) => m.id ?? '').filter(Boolean).map((model) => ({
          provider: providerId,
          providerLabel: label,
          model,
          free: null,
          configured: true
        }))
      }
      const res = await fetch(`${base}/models`, {
        headers: key ? { authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(12_000)
      })
      if (!res.ok) return []
      const body = (await res.json()) as {
        data?: Array<{ id?: string; pricing?: { prompt?: string | number; completion?: string | number } }>
        models?: Array<{ name?: string }>
      }
      const listed: string[] = body.data
        ? body.data.map((m) => m.id ?? '')
        : (body.models ?? []).map((m) => (m.name ?? '').replace(/^models\//, ''))
      return listed
        .filter(Boolean)
        .map((model) => ({
          provider: providerId,
          providerLabel: label,
          model,
          free: freeHint(model, config),
          configured: true
        }))
    } catch {
      return []
    }
  }

  private async cliModels(engine: EngineKind, cwd: string): Promise<ModelOption[]> {
    const label = ENGINE_LABELS[engine]
    if (engine === 'cli-opencode') {
      const result = await runEngine(
        {
          engine: 'cli-custom',
          model: '',
          endpoint: 'opencode models',
          system: '',
          prompt: '',
          cwd,
          maxTokens: 8,
          timeoutMs: 30_000
        },
        this.creds
      )
      // cli-custom pipes the prompt unless the template names {prompt}; this call
      // exists only to shell out, so ignore its exit text and parse lines instead.
      return parseModelLines(result.text, engine, label)
    }
    if (engine === 'cli-ollama') {
      const result = await runEngine(
        {
          engine: 'cli-custom',
          model: '',
          endpoint: 'ollama list',
          system: '',
          prompt: '',
          cwd,
          maxTokens: 8,
          timeoutMs: 20_000
        },
        this.creds
      )
      const names = result.text
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim().split(/\s+/)[0] ?? '')
        .filter(Boolean)
      return names.map((model) => ({
        provider: engine,
        providerLabel: label,
        model,
        free: true,
        configured: true
      }))
    }
    // Presence on PATH without a listing command: offer the adapter, not fake models.
    const probe = await testEngine(engine, '', '', this.creds)
    if (!probe.ok) return []
    return [
      {
        provider: engine,
        providerLabel: label,
        model: '',
        free: null,
        configured: true,
        note: 'CLI default model'
      }
    ]
  }
}

function parseModelLines(raw: string, engine: EngineKind, label: string): ModelOption[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && /^[\w.-]+\/[\w./-]+$/.test(line))
    .map((model) => ({
      provider: engine,
      providerLabel: label,
      model,
      free: /free|:free/i.test(model) ? true : null,
      configured: true
    }))
}

function freeHint(model: string, config?: ProviderConfig): boolean | null {
  if (/free/i.test(model)) return true
  // OpenRouter publishes a :free suffix; anything else is unknown, not "paid".
  if (config?.engine === 'api-openrouter') return model.endsWith(':free') ? true : false
  return null
}

function dedupeModels(list: ModelOption[]): ModelOption[] {
  const seen = new Set<string>()
  const out: ModelOption[] = []
  for (const item of list) {
    const key = `${item.provider}::${item.model}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out.sort((a, b) => a.providerLabel.localeCompare(b.providerLabel) || a.model.localeCompare(b.model))
}
