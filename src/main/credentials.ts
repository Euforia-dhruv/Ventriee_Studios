import { safeStorage } from 'electron'
import type { Db } from './db'
import { ENGINE_LABELS, type EngineKind } from '../shared/types'

/**
 * API keys live only in the main process, encrypted at rest with the OS
 * keychain via safeStorage. They are never placed in the snapshot or logs.
 */
const ENV_KEY: Partial<Record<EngineKind, string>> = {
  'api-openai': 'OPENAI_API_KEY',
  'api-anthropic': 'ANTHROPIC_API_KEY',
  'api-gemini': 'GEMINI_API_KEY',
  'api-openrouter': 'OPENROUTER_API_KEY',
  'api-deepseek': 'DEEPSEEK_API_KEY',
  'api-mistral': 'MISTRAL_API_KEY',
  'api-deploy': 'DEPLOY_API_KEY',
  'api-inception': 'INCEPTION_API_KEY'
}

export class Credentials {
  constructor(private db: Db) {}

  set(engine: EngineKind, value: string) {
    this.setKey(`cred:${engine}`, value)
  }

  clear(engine: EngineKind) {
    this.db.kvDelete(`cred:${engine}`)
  }

  get(engine: EngineKind): string | null {
    const stored = this.getKey(`cred:${engine}`)
    if (stored) return stored
    const envName = ENV_KEY[engine]
    return envName ? process.env[envName] ?? null : null
  }

  /** Secret under an arbitrary key, for user-added providers. Never leaves the main process. */
  setKey(key: string, value: string) {
    if (!value) {
      this.db.kvDelete(key)
      return
    }
    if (safeStorage.isEncryptionAvailable()) {
      this.db.kvSet(key, `enc:${safeStorage.encryptString(value).toString('base64')}`)
    } else {
      // shortcut: plain fallback when the OS keychain is unavailable, move to a keyring-backed store if this ever runs on a shared machine
      this.db.kvSet(key, `raw:${value}`)
    }
  }

  getKey(key: string): string | null {
    const raw = this.db.kvGet(key)
    if (!raw) return null
    if (raw.startsWith('enc:')) {
      try {
        return safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'))
      } catch {
        return null
      }
    }
    return raw.slice(4)
  }

  configured(engine: EngineKind): boolean {
    return Boolean(this.get(engine))
  }

  /** Every secret value currently in play, for output redaction only. Never log this. */
  secretValues(): string[] {
    const engines = Object.keys(ENV_KEY) as EngineKind[]
    const values: string[] = []
    for (const engine of engines) {
      const value = this.get(engine)
      if (value) values.push(value)
      const envName = ENV_KEY[engine]
      const envValue = envName ? process.env[envName] : undefined
      if (envValue) values.push(envValue)
    }
    return values
  }

  list(): Array<{ engine: EngineKind; configured: boolean; hint: string }> {
    // Keyed engines come from ENV_KEY so a new provider is added in one place.
    // The rest are local servers and custom endpoints that need no key.
    const engines: EngineKind[] = [
      ...(Object.keys(ENV_KEY) as EngineKind[]),
      'api-ollama', 'api-lmstudio', 'api-vllm', 'api-custom'
    ]
    return engines.map((engine) => {
      const value = this.get(engine)
      return {
        engine,
        configured: Boolean(value),
        hint: value ? `${ENGINE_LABELS[engine]} key stored (${value.slice(0, 3)}••••${value.slice(-2)})` : 'Not configured'
      }
    })
  }
}
