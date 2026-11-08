import { which } from './exec'
import { runCli } from './cli'
import type { Credentials } from './credentials'
import { ENGINE_LABELS, type EngineKind, type ProviderStatus, type ReasoningEffort } from '../shared/types'

export interface EngineRunInput {
  engine: EngineKind
  model: string
  endpoint: string
  system: string
  prompt: string
  cwd: string
  maxTokens: number
  timeoutMs: number
  /** How hard the model may think. 'auto' sends nothing. */
  reasoning?: ReasoningEffort
  /** Kill the session when it goes silent for this long. Defaults to a quarter of timeoutMs. */
  stallMs?: number
  signal?: AbortSignal
  onChunk?: (chunk: string) => void
}

export interface EngineRunOutput {
  ok: boolean
  text: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  externalId: string | null
  command: string
  error?: string
  /** A thinking model that stopped mid-plan: the text is its reasoning, not an answer. */
  reasoningOnly?: boolean
  /** The model hit max_tokens mid-answer, so its text is only part of a file. */
  truncated?: boolean
}

const CLI_ENGINES: EngineKind[] = ['cli-opencode', 'cli-claude', 'cli-codex', 'cli-gemini', 'cli-ollama', 'cli-custom']

/** Anthropic only takes a thinking budget in tokens, so the levels map to one. */
const THINKING_BUDGET: Partial<Record<ReasoningEffort, number>> = { low: 2048, medium: 8192, high: 16384 }

export function isCliEngine(engine: EngineKind) {
  return CLI_ENGINES.includes(engine)
}

const CLI_BIN: Partial<Record<EngineKind, string>> = {
  'cli-opencode': 'opencode',
  'cli-claude': 'claude',
  'cli-codex': 'codex',
  'cli-gemini': 'gemini',
  'cli-ollama': 'ollama',
  'cli-custom': ''
}

export async function detectProviders(creds: Credentials): Promise<ProviderStatus[]> {
  const engines = Object.keys(ENGINE_LABELS) as EngineKind[]
  const out: ProviderStatus[] = []
  for (const engine of engines) {
    const cli = isCliEngine(engine)
    if (cli) {
      const bin = CLI_BIN[engine]
      if (!bin) {
        out.push({ engine, label: ENGINE_LABELS[engine], kind: 'cli', available: false, detail: 'No executable configured', configured: false })
        continue
      }
      const path = await which(bin)
      out.push({
        engine,
        label: ENGINE_LABELS[engine],
        kind: 'cli',
        available: Boolean(path),
        detail: path ?? `${bin} not found on PATH`,
        // auth is per-CLI and cannot be probed without spending a call; presence on PATH is the only safe signal
        configured: Boolean(path)
      })
      continue
    }
    const keyed = !['api-ollama', 'api-lmstudio', 'api-vllm', 'api-custom'].includes(engine)
    const configured = keyed ? creds.configured(engine) : true
    out.push({
      engine,
      label: ENGINE_LABELS[engine],
      kind: 'api',
      available: configured,
      detail: keyed
        ? configured
          ? 'API key stored'
          : 'Add an API key in settings'
        : `Local endpoint: ${defaultEndpoint(engine)}`,
      configured
    })
  }
  return out
}

export function defaultEndpoint(engine: EngineKind): string {
  switch (engine) {
    case 'api-openai': return 'https://api.openai.com/v1'
    case 'api-anthropic': return 'https://api.anthropic.com/v1'
    case 'api-gemini': return 'https://generativelanguage.googleapis.com/v1beta'
    case 'api-openrouter': return 'https://openrouter.ai/api/v1'
    case 'api-deepseek': return 'https://api.deepseek.com/v1'
    case 'api-mistral': return 'https://api.mistral.ai/v1'
    case 'api-deploy': return 'https://api-sf1-cdn.deploy.com/api/v1'
    case 'api-inception': return 'https://api.inceptionlabs.ai/v1'
    case 'api-ollama': return 'http://127.0.0.1:11434/v1'
    case 'api-lmstudio': return 'http://127.0.0.1:1234/v1'
    case 'api-vllm': return 'http://127.0.0.1:8000/v1'
    default: return ''
  }
}

const DEFAULT_MODEL: Partial<Record<EngineKind, string>> = {
  'api-openai': 'gpt-5-mini',
  'api-anthropic': 'claude-sonnet-4-5',
  'api-gemini': 'gemini-2.5-flash',
  'api-openrouter': 'anthropic/claude-sonnet-4.5',
  'api-deepseek': 'deepseek-chat',
  'api-mistral': 'mistral-large-latest',
  'api-deploy': 'deepseek-ai/deepseek-v4.1-flash-1017',
  'api-inception': 'mercury-3',
  'api-ollama': 'llama3.1',
  'api-lmstudio': 'local-model',
  'api-vllm': 'local-model',
  'cli-ollama': 'llama3.1'
}

export function modelFor(engine: EngineKind, model: string) {
  return model?.trim() || DEFAULT_MODEL[engine] || ''
}

/**
 * CLI adapters differ per tool: each has its own non-interactive entrypoint and flags.
 * The prompt always goes over stdin. Passing a multi-line brief as an argument means
 * cmd.exe parses it on Windows (the npm .cmd shims), and a stray quote in the brief
 * leaves the session waiting on stdin forever.
 */
function buildCliInvocation(input: EngineRunInput): { bin: string; args: string[]; stdin?: string } {
  const model = input.model.trim()
  switch (input.engine) {
    case 'cli-opencode': {
      const args = ['run', '--format', 'default']
      if (model) args.push('--model', model)
      return { bin: 'opencode', args, stdin: input.prompt }
    }
    case 'cli-claude': {
      const args = ['-p', '--output-format', 'json']
      if (model) args.push('--model', model)
      return { bin: 'claude', args, stdin: input.prompt }
    }
    case 'cli-codex': {
      const args = ['exec', '--json', '--skip-git-repo-check']
      // Codex takes its thinking budget as a config override, not a flag.
      // 'none' is OpenAI's own "do not think" value; the flag is the same, so no special case.
      const effort = input.reasoning && input.reasoning !== 'auto' ? input.reasoning : ''
      if (effort) args.push('--config', `model_reasoning_effort="${effort}"`)
      if (model) args.push('--model', model)
      return { bin: 'codex', args, stdin: input.prompt }
    }
    case 'cli-gemini': {
      const args: string[] = []
      if (model) args.push('--model', model)
      return { bin: 'gemini', args, stdin: input.prompt }
    }
    case 'cli-ollama': {
      return { bin: 'ollama', args: ['run', model || 'llama3.1'], stdin: input.prompt }
    }
    default: {
      const template = input.endpoint.trim() || '{prompt}'
      // A custom template that asks for the prompt in its arguments gets it there;
      // otherwise the prompt is piped, which is safe for any length.
      const wantsArg = template.includes('{prompt}')
      const parts = splitArgs(template).map((p) => p.replaceAll('{prompt}', input.prompt))
      return wantsArg ? { bin: 'custom-agent', args: parts } : { bin: 'custom-agent', args: parts, stdin: input.prompt }
    }
  }
}

function splitArgs(template: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of template) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === ' ') {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/** Claude's JSON envelope carries the real answer plus usage/cost. */
function parseClaudeJson(raw: string) {
  try {
    const parsed = JSON.parse(raw.trim()) as {
      result?: string
      total_cost_usd?: number
      usage?: { input_tokens?: number; output_tokens?: number }
      session_id?: string
    }
    if (parsed && typeof parsed === 'object') {
      return {
        text: parsed.result ?? raw,
        cost: Number(parsed.total_cost_usd ?? 0),
        inTok: Number(parsed.usage?.input_tokens ?? 0),
        outTok: Number(parsed.usage?.output_tokens ?? 0),
        externalId: parsed.session_id ?? null
      }
    }
  } catch {
    /* not JSON, fall through */
  }
  return null
}

function parseCodexJson(raw: string) {
  const lines = raw.split(/\r?\n/).filter(Boolean)
  let text = ''
  let inTok = 0
  let outTok = 0
  let externalId: string | null = null
  for (const line of lines) {
    try {
      const ev = JSON.parse(line) as Record<string, unknown>
      const type = String(ev.type ?? '')
      if (type === 'thread.started') externalId = String(ev.thread_id ?? '') || null
      if (type === 'item.completed') {
        const item = ev.item as { type?: string; text?: string } | undefined
        if (item?.type === 'agent_message' && item.text) text += item.text
      }
      const usage = ev.usage as { input_tokens?: number; output_tokens?: number } | undefined
      if (usage) {
        inTok = Number(usage.input_tokens ?? inTok)
        outTok = Number(usage.output_tokens ?? outTok)
      }
    } catch {
      /* plain log line */
    }
  }
  return { text: text || raw, inTok, outTok, externalId }
}

export async function runEngine(input: EngineRunInput, creds: Credentials): Promise<EngineRunOutput> {
  const model = modelFor(input.engine, input.model)
  if (isCliEngine(input.engine)) {
    const { bin, args, stdin } = buildCliInvocation({ ...input, model })
    const command = `${bin} ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    const result = await runCli({
      executable: bin,
      args,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      // A silent CLI is wedged, not thinking: fail it in a quarter of the budget
      // instead of burning the whole session window.
      stallMs: input.stallMs ?? Math.max(60_000, Math.round(input.timeoutMs / 4)),
      signal: input.signal,
      onChunk: input.onChunk,
      input: stdin
    })
    let text = result.output
    let inTok = 0
    let outTok = 0
    let cost = 0
    let externalId: string | null = null

    if (input.engine === 'cli-claude') {
      const parsed = parseClaudeJson(result.output)
      if (parsed) {
        text = parsed.text
        cost = parsed.cost
        inTok = parsed.inTok
        outTok = parsed.outTok
        externalId = parsed.externalId
      }
    } else if (input.engine === 'cli-codex') {
      const parsed = parseCodexJson(result.output)
      text = parsed.text
      inTok = parsed.inTok
      outTok = parsed.outTok
      externalId = parsed.externalId
    }

    return {
      ok: result.ok,
      text: text.trim(),
      inputTokens: inTok,
      outputTokens: outTok || Math.round(text.length / 4),
      costUsd: cost,
      externalId,
      command,
      error: result.error ?? (result.ok ? undefined : `Exit code ${result.code}`)
    }
  }

  return runApiEngine({ ...input, model }, creds)
}

async function runApiEngine(input: EngineRunInput & { model: string }, creds: Credentials): Promise<EngineRunOutput> {
  const endpoint = input.endpoint.trim() || defaultEndpoint(input.engine)
  if (input.engine === 'api-anthropic') return anthropic(input, creds, endpoint)
  if (input.engine === 'api-gemini') return gemini(input, creds, endpoint)
  return openaiCompatible(input, creds, endpoint)
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (payload: string) => void
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data:')) onEvent(line.slice(5).trim())
      }
    }
  }
}

/**
 * One streamed OpenAI-style chunk, reduced to what the studio cares about.
 * Thinking models (qwen3, deepseek-r1) stream their plan on `reasoning` or
 * `reasoning_content` instead of `content`; dropping those keys makes a session
 * that really ran look like an empty result.
 */
export function parseChatChunk(payload: string): {
  text: string
  reasoning: string
  inTok: number | null
  outTok: number | null
  finish: string | null
} | null {
  try {
    const chunk = JSON.parse(payload) as {
      choices?: Array<{
        delta?: { content?: string; reasoning?: string; reasoning_content?: string }
        finish_reason?: string | null
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const choice = chunk.choices?.[0]
    return {
      text: choice?.delta?.content ?? '',
      reasoning: choice?.delta?.reasoning ?? choice?.delta?.reasoning_content ?? '',
      inTok: chunk.usage?.prompt_tokens ?? null,
      outTok: chunk.usage?.completion_tokens ?? null,
      finish: choice?.finish_reason ?? null
    }
  } catch {
    return null // keepalive fragment, not a chunk
  }
}

async function openaiCompatible(
  input: EngineRunInput & { model: string },
  creds: Credentials,
  endpoint: string
): Promise<EngineRunOutput> {
  const key = creds.get(input.engine)
  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (key) headers.authorization = `Bearer ${key}`
  if (input.engine === 'api-openrouter') {
    headers['HTTP-Referer'] = 'https://ventriee.local'
    headers['X-Title'] = 'Ventriee Studios'
  }
  let text = ''
  let reasoning = ''
  let inTok = 0
  let outTok = 0
  let finish: string | null = null
  try {
    // Extended-thinking providers burn their whole output budget on reasoning and
    // return no answer. When the owner set reasoning Off, send the provider's own
    // "thinking disabled" field instead of omitting the parameter (which leaves
    // the provider default, usually thinking on).
    const thinkingOff = input.reasoning === 'none'
    const thinkingDisable = thinkingOff
      ? input.engine === 'api-deepseek' || input.engine === 'api-deploy'
        ? { thinking: { type: 'disabled' } }
        : {}
      : {}
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: input.signal,
      body: JSON.stringify({
        model: input.model,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: input.maxTokens,
        ...thinkingDisable,
        // Only sent when the owner picked a level; 'auto' leaves the model's own default.
        ...(input.reasoning && input.reasoning !== 'auto' && input.reasoning !== 'none' ? { reasoning_effort: input.reasoning } : {}),
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.prompt }
        ]
      })
    })
    if (!res.ok || !res.body) {
      return fail(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`, `${input.engine} ${input.model}`)
    }
    await readSse(res.body, (payload) => {
      if (payload === '[DONE]') return
      const delta = parseChatChunk(payload)
      if (!delta) return
      if (delta.text) {
        text += delta.text
        input.onChunk?.(delta.text)
      }
      reasoning += delta.reasoning
      if (delta.inTok !== null) inTok = delta.inTok
      if (delta.outTok !== null) outTok = delta.outTok
      if (delta.finish) finish = delta.finish
    })
    // A model that ran out of budget mid-thought has no answer, only a plan. Say so plainly
    // rather than handing the reviewer an empty string.
    if (!text.trim() && reasoning.trim()) {
      return {
        ok: true,
        text: reasoning.trim(),
        reasoningOnly: true,
        inputTokens: inTok,
        outputTokens: outTok || Math.round(reasoning.length / 4),
        costUsd: 0,
        externalId: null,
        command: `POST ${url} (reasoning only)`
      }
    }
    return {
      ok: true,
      text: text.trim(),
      // A file written from a reply that stopped at max_tokens is only half a
      // file. finish_reason is the clean signal, but not every provider sends it:
      // Deploy answered three times with no finish_reason, exactly max_tokens
      // reported, and a tsconfig cut off mid-object was accepted as done. So a
      // reply that spent its whole budget without saying it stopped is cut off.
      truncated: finish === 'length' || (finish !== 'stop' && outTok >= input.maxTokens),
      inputTokens: inTok,
      outputTokens: outTok || Math.round(text.length / 4),
      costUsd: 0,
      externalId: null,
      command: `POST ${url}`
    }
  } catch (error) {
    return fail((error as Error).message, `POST ${url}`)
  }
}

async function anthropic(
  input: EngineRunInput & { model: string },
  creds: Credentials,
  endpoint: string
): Promise<EngineRunOutput> {
  const key = creds.get('api-anthropic')
  if (!key) return fail('Anthropic API key not configured', 'anthropic')
  const url = `${endpoint.replace(/\/$/, '')}/messages`
  const thinking = THINKING_BUDGET[input.reasoning ?? 'auto'] ?? 0
  let text = ''
  let inTok = 0
  let outTok = 0
  let truncated = false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      signal: input.signal,
      body: JSON.stringify({
        model: input.model,
        // Extended thinking needs a budget, and max_tokens has to exceed it.
        max_tokens: thinking ? Math.max(input.maxTokens, thinking + 2048) : input.maxTokens,
        system: input.system,
        stream: true,
        ...(thinking ? { thinking: { type: 'enabled', budget_tokens: thinking } } : {}),
        messages: [{ role: 'user', content: input.prompt }]
      })
    })
    if (!res.ok || !res.body) return fail(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`, 'anthropic')
    await readSse(res.body, (payload) => {
      try {
        const ev = JSON.parse(payload) as {
          type?: string
          delta?: { text?: string; stop_reason?: string }
          message?: { usage?: { input_tokens?: number } }
          usage?: { output_tokens?: number }
        }
        if (ev.type === 'content_block_delta' && ev.delta?.text) {
          text += ev.delta.text
          input.onChunk?.(ev.delta.text)
        }
        if (ev.type === 'message_start') inTok = ev.message?.usage?.input_tokens ?? inTok
        if (ev.type === 'message_delta') {
          outTok = ev.usage?.output_tokens ?? outTok
          if (ev.delta?.stop_reason === 'max_tokens') truncated = true
        }
      } catch {
        /* ignore */
      }
    })
    return {
      ok: true,
      text: text.trim(),
      truncated,
      inputTokens: inTok,
      outputTokens: outTok || Math.round(text.length / 4),
      costUsd: 0,
      externalId: null,
      command: `POST ${url}`
    }
  } catch (error) {
    return fail((error as Error).message, 'anthropic')
  }
}

async function gemini(
  input: EngineRunInput & { model: string },
  creds: Credentials,
  endpoint: string
): Promise<EngineRunOutput> {
  const key = creds.get('api-gemini')
  if (!key) return fail('Gemini API key not configured', 'gemini')
  const url = `${endpoint.replace(/\/$/, '')}/models/${input.model}:streamGenerateContent?alt=sse`
  let text = ''
  let outTok = 0
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      signal: input.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig: { maxOutputTokens: input.maxTokens }
      })
    })
    if (!res.ok || !res.body) return fail(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`, 'gemini')
    await readSse(res.body, (payload) => {
      try {
        const ev = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
        }
        const delta = ev.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
        if (delta) {
          text += delta
          input.onChunk?.(delta)
        }
        outTok = ev.usageMetadata?.candidatesTokenCount ?? outTok
      } catch {
        /* ignore */
      }
    })
    return {
      ok: true,
      text: text.trim(),
      inputTokens: 0,
      outputTokens: outTok || Math.round(text.length / 4),
      costUsd: 0,
      externalId: null,
      command: `POST ${url.replace(key, '***')}`
    }
  } catch (error) {
    return fail((error as Error).message, 'gemini')
  }
}

function fail(message: string, command: string): EngineRunOutput {
  return {
    ok: false,
    text: '',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    externalId: null,
    command,
    error: message
  }
}

/** Cheap connectivity check that never fabricates success. */
export async function testEngine(
  engine: EngineKind,
  model: string,
  endpoint: string,
  creds: Credentials
): Promise<{ ok: boolean; detail: string }> {
  if (isCliEngine(engine)) {
    const bin = CLI_BIN[engine]
    if (!bin) return { ok: false, detail: 'Configure the executable command for this custom CLI' }
    const path = await which(bin)
    if (!path) return { ok: false, detail: `${bin} is not installed or not on PATH` }
    const result = await runCli({ executable: bin, args: ['--version'], cwd: process.cwd(), timeoutMs: 20000 })
    return {
      ok: true,
      detail: `${path} · ${(result.output.split(/\r?\n/)[0] ?? 'installed').slice(0, 120)}`
    }
  }
  const key = creds.get(engine)
  const base = (endpoint || defaultEndpoint(engine)).replace(/\/$/, '')
  try {
    if (engine === 'api-anthropic') {
      if (!key) return { ok: false, detail: 'No API key stored' }
      const res = await fetch(`${base}/models`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } })
      return res.ok ? { ok: true, detail: 'Anthropic reachable, key accepted' } : { ok: false, detail: `HTTP ${res.status}` }
    }
    if (engine === 'api-gemini') {
      if (!key) return { ok: false, detail: 'No API key stored' }
      const res = await fetch(`${base}/models`, { headers: { 'x-goog-api-key': key } })
      return res.ok ? { ok: true, detail: 'Gemini reachable, key accepted' } : { ok: false, detail: `HTTP ${res.status}` }
    }
    const res = await fetch(`${base}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {} })
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} from ${base}/models` }
    const body = (await res.json()) as { data?: Array<{ id?: string }> }
    const count = body.data?.length ?? 0
    const hit = model && body.data?.some((m) => m.id === model)
    return { ok: true, detail: `${count} models${hit ? `, ${model} present` : ''} at ${base}` }
  } catch (error) {
    return { ok: false, detail: (error as Error).message }
  }
}
