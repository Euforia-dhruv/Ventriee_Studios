import { useMemo, useState } from 'react'
import { Modal } from '../shell'
import { guard, useStore } from '../store'
import { ENGINE_ENDPOINTS, ENGINE_LABELS, type EngineKind, type ProviderConfig } from '../../../shared/types'

/** Providers that accept a key and speak a documented HTTP dialect. */
const API_ENGINES: EngineKind[] = [
  'api-openai',
  'api-anthropic',
  'api-gemini',
  'api-openrouter',
  'api-deepseek',
  'api-mistral',
  'api-deploy',
  'api-inception',
  'api-ollama',
  'api-lmstudio',
  'api-vllm'
]

const KIND: Partial<Record<EngineKind, 'openai' | 'anthropic' | 'gemini'>> = {
  'api-anthropic': 'anthropic',
  'api-gemini': 'gemini'
}

const LOCAL: EngineKind[] = ['api-ollama', 'api-lmstudio', 'api-vllm']

export function AddProviderDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [tab, setTab] = useState<'builtin' | 'custom'>('builtin')
  const [picked, setPicked] = useState<EngineKind | null>(null)
  const [editing, setEditing] = useState<ProviderConfig | null>(null)

  return (
    <Modal
      title={editing ? `Edit ${editing.label}` : 'Add provider or model'}
      subtitle="Keys are stored in the OS keychain. Nothing is saved until the connection test passes."
      onClose={onClose}
      tabs={
        <div className="modal-tabs" role="tablist">
          <button className={`modal-tab${tab === 'builtin' ? ' on' : ''}`} onClick={() => { setTab('builtin'); setEditing(null) }} role="tab" aria-selected={tab === 'builtin'}>
            Configured engines
          </button>
          <button className={`modal-tab${tab === 'custom' ? ' on' : ''}`} onClick={() => { setTab('custom'); setPicked('api-openai'); setEditing(null) }} role="tab" aria-selected={tab === 'custom'}>
            Custom endpoint
          </button>
        </div>
      }
    >
      {tab === 'builtin' ? (
        <BuiltinList
          onPick={(engine) => setPicked(engine)}
          onEdit={(config) => { setEditing(config); setPicked(null) }}
        />
      ) : null}

      {picked ? (
        <ProviderForm
          engine={picked}
          existing={editing}
          onSaved={onClose}
          onCancel={() => { setPicked(null); setEditing(null) }}
        />
      ) : null}

      {!picked && tab === 'custom' ? (
        <p className="faint" style={{ fontSize: 12 }}>
          Pick any OpenAI-compatible base URL above to start. {snapshot.providerConfigs.length} custom
          provider{snapshot.providerConfigs.length === 1 ? '' : 's'} configured.
        </p>
      ) : null}
    </Modal>
  )
}

function BuiltinList({
  onPick,
  onEdit
}: {
  onPick: (engine: EngineKind) => void
  onEdit: (config: ProviderConfig) => void
}) {
  const snapshot = useStore((s) => s.snapshot)!
  const builtin = useMemo(
    () => API_ENGINES.map((engine) => ({
      engine,
      status: snapshot.providers.find((p) => p.engine === engine) ?? null
    })),
    [snapshot.providers]
  )

  return (
    <>
      <div className="section-label">Built-in providers</div>
      {builtin.map(({ engine, status }) => (
        <button key={engine} className="kv-row prov-pick" onClick={() => onPick(engine)}>
          <span className="kv-row-main">
            <span className="kv-row-title">
              {ENGINE_LABELS[engine]}
              {status?.available ? <span className="badge ok">ready</span> : status?.configured ? <span className="badge warn">key only</span> : <span className="badge">not set</span>}
            </span>
            <span className="kv-row-sub">{ENGINE_ENDPOINTS[engine] ?? 'local server'}</span>
          </span>
          <span className="ghost-link">Configure</span>
        </button>
      ))}

      {snapshot.providerConfigs.length ? (
        <>
          <div className="section-label" style={{ marginTop: 16 }}>Your providers</div>
          {snapshot.providerConfigs.map((config) => (
            <div key={config.id} className="kv-row">
              <span className="kv-row-main">
                <span className="kv-row-title">{config.label}<span className="badge accent">{config.kind}</span></span>
                <span className="kv-row-sub">{config.baseUrl} · {config.models.length} model{config.models.length === 1 ? '' : 's'}</span>
              </span>
              <div className="flex gap-4">
                <button className="btn tiny" onClick={() => onEdit(config)}>Edit</button>
                <button
                  className="btn tiny danger"
                  onClick={() => void guard(() => window.ventriee.deleteProvider(config.id), `${config.label} removed`)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </>
  )
}

function ProviderForm({
  engine,
  existing,
  onSaved,
  onCancel
}: {
  engine: EngineKind
  existing: ProviderConfig | null
  onSaved: () => void
  onCancel: () => void
}) {
  const snapshot = useStore((s) => s.snapshot)!
  const isCustom = Boolean(existing)
  const [label, setLabel] = useState(existing?.label ?? ENGINE_LABELS[engine])
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? ENGINE_ENDPOINTS[engine] ?? '')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<string[]>(existing?.models ?? [])
  const [manual, setManual] = useState('')
  const [found, setFound] = useState<string[] | null>(null)
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const [busy, setBusy] = useState<'test' | 'discover' | 'save' | null>(null)

  const kind = KIND[engine] ?? 'openai'
  const needsKey = !LOCAL.includes(engine)

  const test = async () => {
    setBusy('test')
    const res = await guard(() =>
      window.ventriee.testProvider({ id: existing?.id, engine, baseUrl, apiKey: apiKey || undefined, model: models[0] ?? '' })
    )
    setBusy(null)
    if (res) {
      setResult({ ok: res.ok, detail: res.detail })
      if (res.models.length) {
        setFound(res.models)
        setModels((prev) => (prev.length ? prev : res.models.slice(0, 12)))
      }
    }
  }

  const save = async () => {
    setBusy('save')
    const saved = existing
      ? await guard(() => window.ventriee.updateProvider(existing.id, { label, baseUrl, models, apiKey: apiKey || undefined }), 'Provider updated')
      : await guard(() => window.ventriee.addProvider({ label, kind, engine, baseUrl, apiKey, models }), 'Provider saved')
    setBusy(null)
    if (saved) {
      await guard(() => window.ventriee.modelsDiscover(snapshot.activeProjectId))
      onSaved()
    }
  }

  const addManual = () => {
    const name = manual.trim()
    if (!name || models.includes(name)) return
    setModels([...models, name])
    setManual('')
  }

  return (
    <div className="prov-form">
      <div className="row">
        <div className="field">
          <label className="field-label" htmlFor="pv-label">Name</label>
          <input id="pv-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pv-url">Base URL</label>
          <input id="pv-url" className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
        </div>
      </div>

      {needsKey ? (
        <div className="field">
          <label className="field-label" htmlFor="pv-key">
            API key {existing ? '(leave blank to keep the stored key)' : ''}
          </label>
          <input
            id="pv-key"
            className="input mono"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={existing ? 'Stored key unchanged' : 'sk-…'}
            autoComplete="off"
          />
          <div className="hint">Encrypted with the OS keychain. Never shown in the UI, logs or project files.</div>
        </div>
      ) : (
        <div className="hint" style={{ marginBottom: 12 }}>
          A local server needs no key. Start it, then test the connection.
        </div>
      )}

      <div className="flex gap-8" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={test} disabled={busy !== null || (!baseUrl && !LOCAL.includes(engine))}>
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button className="btn" onClick={() => setFound(found === null ? [] : null)} disabled={!found?.length}>
          {found?.length ? `${found.length} models found` : 'Discover models'}
        </button>
      </div>

      {result ? (
        <div className={`hint${result.ok ? '' : ' error-text'}`} style={{ marginBottom: 10 }}>
          {result.ok ? '✓ ' : '✕ '}{result.detail}
        </div>
      ) : null}

      {found?.length ? (
        <div className="field">
          <div className="field-label">Serve this list</div>
          <div className="model-chips">
            {found.slice(0, 40).map((m) => (
              <button
                key={m}
                className={`chip${models.includes(m) ? ' on' : ''}`}
                onClick={() => setModels(models.includes(m) ? models.filter((x) => x !== m) : [...models, m])}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="field">
        <label className="field-label" htmlFor="pv-manual">Add a model manually</label>
        <div className="row">
          <input
            id="pv-manual"
            className="input mono"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }}
            placeholder="model-id"
          />
          <button className="btn" style={{ flex: 'none' }} onClick={addManual} disabled={!manual.trim()}>Add</button>
        </div>
        {models.length ? (
          <div className="model-chips" style={{ marginTop: 8 }}>
            {models.map((m) => (
              <button key={m} className="chip on" onClick={() => setModels(models.filter((x) => x !== m))} title="Remove">
                {m} ×
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex gap-8" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy !== null || !label.trim() || !baseUrl.trim()}>
          {busy === 'save' ? 'Saving…' : existing ? 'Save changes' : 'Save provider'}
        </button>
      </div>
    </div>
  )
}
