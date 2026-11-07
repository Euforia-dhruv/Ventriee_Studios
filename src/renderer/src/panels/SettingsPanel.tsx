import { useEffect, useMemo, useState } from 'react'
import { guard, useStore } from '../store'
import { Modal, Switch } from '../shell'
import { ENGINE_LABELS, type Agent, type EngineKind } from '../../../shared/types'
import { IconCheck, IconPlus, IconRefresh, IconTrash } from '../icons'
import { ModelPicker, resolveModel } from '../components/ModelPicker'
import { AddProviderDialog } from '../components/AddProviderDialog'
import type { CredentialInfo } from '../../../shared/ipc'

type Tab = 'engines' | 'workers' | 'run' | 'data'

const ENGINE_ORDER: EngineKind[] = [
  'cli-opencode', 'cli-claude', 'cli-codex', 'cli-gemini', 'cli-custom', 'cli-ollama',
  'api-openai', 'api-anthropic', 'api-gemini', 'api-openrouter', 'api-deepseek', 'api-mistral',
  'api-deploy', 'api-inception',
  'api-ollama', 'api-lmstudio', 'api-vllm', 'api-custom'
]

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('engines')
  return (
    <Modal
      title="Studio settings"
      subtitle="Engines, workers and run policy. Keys are stored in the OS keychain."
      onClose={onClose}
      tabs={
        <div className="modal-tabs" role="tablist">
          {([['engines', 'Engines'], ['workers', 'Workers'], ['run', 'Run policy'], ['data', 'Data']] as Array<[Tab, string]>).map(
            ([id, label]) => (
              <button key={id} className={`modal-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}>
                {label}
              </button>
            )
          )}
        </div>
      }
    >
      {tab === 'engines' ? <Engines /> : null}
      {tab === 'workers' ? <Workers /> : null}
      {tab === 'run' ? <RunPolicy /> : null}
      {tab === 'data' ? <DataTab /> : null}
    </Modal>
  )
}

function Engines() {
  const snapshot = useStore((s) => s.snapshot)!
  const [creds, setCreds] = useState<CredentialInfo[]>([])
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string }>>({})

  useEffect(() => {
    void window.ventriee.credentials().then(setCreds)
  }, [snapshot.providers])

  const configured = useMemo(
    () => new Map(creds.map((c) => [c.engine, c.configured])),
    [creds]
  )

  return (
    <>
      <p className="hint" style={{ marginBottom: 12 }}>
        CLI adapters run real local processes. API adapters call the provider directly. Nothing here is
        faked: unavailable engines stay marked unavailable until they actually respond.
      </p>
      {ENGINE_ORDER.map((engine) => {
        const provider = snapshot.providers.find((p) => p.engine === engine)
        const isCli = provider?.kind === 'cli'
        const status = results[engine]
        const keyed = !['api-ollama', 'api-lmstudio', 'api-vllm', 'api-custom'].includes(engine)
        return (
          <div key={engine} className="provider-line">
            <span className="prov-name">{ENGINE_LABELS[engine]}</span>
            <span className={`badge ${provider?.available ? 'ok' : 'err'}`}>
              {isCli ? (provider?.available ? 'on PATH' : 'missing') : configured.get(engine) || !keyed ? 'ready' : 'no key'}
            </span>
            <span className="prov-detail" title={status?.detail ?? provider?.detail}>
              {status ? `${status.ok ? '✓' : '✕'} ${status.detail}` : provider?.detail}
            </span>
            {!isCli && keyed ? (
              <input
                className="input mono key-input"
                type="password"
                placeholder="API key"
                value={draftKeys[engine] ?? ''}
                onChange={(e) => setDraftKeys((d) => ({ ...d, [engine]: e.target.value }))}
              />
            ) : null}
            {!isCli && keyed && draftKeys[engine] ? (
              <button
                className="btn tiny primary"
                onClick={async () => {
                  await guard(() => window.ventriee.saveCredential(engine, draftKeys[engine] ?? ''), 'Key stored in OS keychain')
                  setDraftKeys((d) => ({ ...d, [engine]: '' }))
                }}
              >
                Save
              </button>
            ) : null}
            {!isCli && keyed && configured.get(engine) && !draftKeys[engine] ? (
              <button
                className="btn tiny"
                onClick={async () => {
                  await guard(() => window.ventriee.clearCredential(engine), 'Key removed')
                }}
              >
                Clear
              </button>
            ) : null}
            <button
              className="btn tiny"
              disabled={testing === engine}
              onClick={async () => {
                setTesting(engine)
                const result = await guard(() =>
                  window.ventriee.testEngine(engine, '', '')
                )
                setTesting(null)
                if (result) setResults((r) => ({ ...r, [engine]: result }))
              }}
            >
              {testing === engine ? 'Testing…' : 'Test'}
            </button>
          </div>
        )
      })}
      <div className="hint" style={{ marginTop: 12 }}>
        Env vars are also honoured (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY,
        DEEPSEEK_API_KEY, MISTRAL_API_KEY). A key set here overrides the environment.
      </div>
    </>
  )
}

function Workers() {
  const snapshot = useStore((s) => s.snapshot)!
  const [selected, setSelected] = useState<string | null>(snapshot.agents[0]?.id ?? null)
  const agent = snapshot.agents.find((a) => a.id === selected) ?? null
  const [creaing, setCreating] = useState(false)

  return (
    <div className="agents-editor">
      <div className="agents-list">
        {snapshot.agents.map((a) => (
          <button key={a.id} className={`agent-pick${a.id === selected ? ' on' : ''}`} onClick={() => setSelected(a.id)}>
            <span className="avatar" style={{ ['--who' as string]: a.color }}>{a.name.slice(0, 2).toUpperCase()}</span>
            <span className="agent-pick-name">{a.name}</span>
            <span className="badge" style={{ marginLeft: 'auto' }}>{a.role.slice(0, 4)}</span>
          </button>
        ))}
        <button
          className="agent-pick"
          style={{ color: 'var(--accent)', marginTop: 6 }}
          onClick={() => {
            setCreating(true)
            setSelected(null)
          }}
        >
          <IconPlus width={12} height={12} /> New worker
        </button>
      </div>
      <div style={{ minWidth: 0 }}>
        {creaing ? (
          <NewWorker
            engineDefault={snapshot.settings.orchestratorEngine}
            onDone={(id) => {
              setCreating(false)
              setSelected(id)
            }}
          />
        ) : agent ? (
          <AgentForm agent={agent} key={agent.id} />
        ) : (
          <p className="faint" style={{ fontSize: 12 }}>Select a worker.</p>
        )}
      </div>
    </div>
  )
}

function AgentForm({ agent }: { agent: Agent }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [draft, setDraft] = useState(agent)
  const [addingProvider, setAddingProvider] = useState(false)
  useEffect(() => setDraft(agent), [agent])

  const save = async () => {
    await guard(
      () =>
        window.ventriee.updateAgent(agent.id, {
          name: draft.name,
          title: draft.title,
          role: draft.role,
          engine: draft.engine,
          model: draft.model,
          endpoint: draft.endpoint,
          instructions: draft.instructions,
          autonomy: draft.autonomy,
          reasoning: draft.reasoning,
          skills: draft.skills,
          budgetUsd: draft.budgetUsd,
          enabled: draft.enabled
        }),
      'Worker saved'
    )
  }

  return (
    <>
      <div className="row">
        <div className="field">
          <label className="field-label">Name</label>
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">Title</label>
          <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label className="field-label">Role</label>
          <select className="select" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            {['orchestrator', 'researcher', 'architect', 'designer', 'frontend', 'integration', 'backend', 'reviewer', 'fixer', 'qa', 'seo', 'aeo', 'deployment', 'monitoring'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Engine</label>
          <select
            className="select"
            value={draft.engine}
            onChange={(e) => setDraft({ ...draft, engine: e.target.value as EngineKind })}
          >
            {ENGINE_ORDER.map((e) => (
              <option key={e} value={e}>{ENGINE_LABELS[e]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label className="field-label">Model</label>
          <div className="flex gap-8">
            <ModelPicker
              value={draft.model ? { engine: draft.engine, model: draft.model, endpoint: draft.endpoint, providerId: null } : null}
              onPick={(option) => {
                const pick = resolveModel(option, snapshot.providerConfigs)
                setDraft({ ...draft, engine: pick.engine, model: pick.model, endpoint: pick.endpoint })
              }}
              onAddProvider={() => setAddingProvider(true)}
            />
            {draft.model ? (
              <button className="ghost-link" onClick={() => setDraft({ ...draft, model: '' })}>clear</button>
            ) : null}
          </div>
          <div className="hint">Picked from providers that actually answered. Clear it to use the engine default.</div>
        </div>
        <div className="field">
          <label className="field-label">Autonomy</label>
          <select className="select" value={draft.autonomy} onChange={(e) => setDraft({ ...draft, autonomy: e.target.value as Agent['autonomy'] })}>
            <option value="ask">Ask before acting</option>
            <option value="scoped">Scoped (recommended)</option>
            <option value="autonomous">Autonomous in workspace</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Reasoning effort</label>
          <select
            className="select"
            value={draft.reasoning}
            onChange={(e) => setDraft({ ...draft, reasoning: e.target.value as Agent['reasoning'] })}
          >
            <option value="auto">Model default</option>
            <option value="none">Off (answer straight away)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <div className="hint">Only sent when you pick a level. A provider that does not know the setting may reject the run.</div>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Endpoint / CLI arguments</label>
        <input
          className="input mono"
          value={draft.endpoint}
          placeholder="Leave empty for the provider default"
          onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
        />
        <div className="hint">For a custom CLI, use {'{prompt}'} where the prompt belongs, e.g. <span className="mono">my-agent --yes {'{prompt}'}</span></div>
      </div>
      <div className="field">
        <label className="field-label">Role instructions</label>
        <textarea
          className="textarea mono"
          style={{ minHeight: 120 }}
          value={draft.instructions}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field-label">Skills</label>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          {snapshot.skills.filter((s) => s.enabled).map((skill) => {
            const on = draft.skills.includes(skill.id)
            return (
              <button
                key={skill.id}
                className={`btn tiny ${on ? 'primary' : ''}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    skills: on ? draft.skills.filter((id) => id !== skill.id) : [...draft.skills, skill.id]
                  })
                }
              >
                {skill.name}
              </button>
            )
          })}
        </div>
        <div className="hint">
          {draft.skills.length
            ? 'This worker is offered exactly these skills, and told to read each SKILL.md before relying on it.'
            : 'No skills picked, so this worker uses the defaults for its role.'}
        </div>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ maxWidth: 140 }}>
          <label className="field-label">Budget (USD)</label>
          <input
            className="input"
            type="number"
            min={0}
            step={1}
            value={draft.budgetUsd}
            onChange={(e) => setDraft({ ...draft, budgetUsd: Number(e.target.value) })}
          />
        </div>
        <div className="field" style={{ flex: 'none' }}>
          <label className="field-label">Enabled</label>
          <Switch on={draft.enabled} onClick={() => setDraft({ ...draft, enabled: !draft.enabled })} label="Worker enabled" />
        </div>
        <div style={{ flex: 1 }} />
      </div>
      <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={save}><IconCheck /> Save worker</button>
        <button className="btn" onClick={() => void guard(() => window.ventriee.duplicateAgent(agent.id), 'Worker duplicated')}>
          Duplicate
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            if (!window.confirm(`Remove ${agent.name}? Their memory files are archived.`)) return
            await guard(() => window.ventriee.deleteAgent(agent.id), 'Worker removed')
          }}
        >
          <IconTrash /> Remove
        </button>
        <span className="faint" style={{ fontSize: 10.5, marginLeft: 'auto', alignSelf: 'center' }}>
          {snapshot.settings.requireDeployApproval ? 'Deploys require your approval' : 'Deploys run without approval'}
        </span>
      </div>
    </>
  )
}

function NewWorker({ engineDefault, onDone }: { engineDefault: EngineKind; onDone: (id: string) => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [form, setForm] = useState({
    name: '',
    title: '',
    role: 'frontend',
    engine: engineDefault,
    model: '',
    instructions: '',
    autonomy: 'scoped' as Agent['autonomy'],
    color: '#9aa4b2',
    budgetUsd: 5
  })

  return (
    <>
      <div className="row">
        <div className="field">
          <label className="field-label">Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="field">
          <label className="field-label">Title</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label className="field-label">Role</label>
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {['researcher', 'architect', 'designer', 'frontend', 'integration', 'backend', 'reviewer', 'fixer', 'qa', 'seo', 'aeo', 'deployment', 'monitoring', 'orchestrator'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Engine</label>
          <select className="select" value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value as EngineKind })}>
            {ENGINE_ORDER.map((e) => (
              <option key={e} value={e}>{ENGINE_LABELS[e]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Model</label>
        <input className="input mono" value={form.model} placeholder="engine default" onChange={(e) => setForm({ ...form, model: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">Instructions</label>
        <textarea className="textarea mono" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
      </div>
      <button
        className="btn primary"
        disabled={!form.name.trim() || !snapshot.activeProjectId}
        onClick={async () => {
          const created = await guard(
            () =>
              window.ventriee.createAgent({
                projectId: snapshot.activeProjectId!,
                name: form.name.trim(),
                title: form.title.trim() || form.role,
                role: form.role,
                engine: form.engine,
                model: form.model,
                endpoint: '',
                instructions: form.instructions || `You are a ${form.role} at Ventriee Studios.`,
                autonomy: form.autonomy,
                reasoning: 'auto',
                color: form.color,
                budgetUsd: form.budgetUsd
              }),
            'Worker hired'
          )
          if (created) onDone(created.id)
        }}
      >
        <IconPlus /> Hire worker
      </button>
    </>
  )
}

function RunPolicy() {
  const snapshot = useStore((s) => s.snapshot)!
  const settings = snapshot.settings
  const [busy, setBusy] = useState(false)

  const update = async (patch: Parameters<typeof window.ventriee.saveSettings>[0]) => {
    setBusy(true)
    await guard(() => window.ventriee.saveSettings(patch))
    setBusy(false)
  }

  return (
    <div style={{ opacity: busy ? 0.6 : 1 }}>
      <div className="section-label">Model routing</div>
      <div className="assign-modes">
        {([
          ['manual', 'Manual', 'Every worker runs the model you chose. Nothing is overridden.'],
          ['automatic', 'Automatic', 'The orchestrator picks a model per task from what is available.'],
          ['hybrid', 'Hybrid', 'Your per-worker choice wins; the orchestrator may override when no model is set.']
        ] as Array<[typeof settings.routingMode, string, string]>).map(([mode, title, sub]) => (
          <button
            key={mode}
            className={`assign-mode${settings.routingMode === mode ? ' on' : ''}`}
            onClick={() => void update({ routingMode: mode })}
            role="radio"
            aria-checked={settings.routingMode === mode}
          >
            <span className="assign-mode-title">{title}</span>
            <span className="assign-mode-sub">{sub}</span>
          </button>
        ))}
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">When routing automatically</div>
          <div className="kv-row-sub">What the orchestrator optimises for. Ignored in manual mode.</div>
        </div>
        <select
          className="select"
          style={{ width: 130 }}
          value={settings.costPreference}
          onChange={(e) => void update({ costPreference: e.target.value as typeof settings.costPreference })}
        >
          <option value="cheap">Cheapest</option>
          <option value="balanced">Balanced</option>
          <option value="quality">Best quality</option>
        </select>
      </div>

      <div className="section-label" style={{ marginTop: 14 }}>Run</div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Parallel sessions</div>
          <div className="kv-row-sub">Maximum workers executing at the same time. Code-writing roles are serialized per project.</div>
        </div>
        <input
          className="input"
          style={{ width: 70 }}
          type="number"
          min={1}
          max={8}
          value={settings.maxConcurrentSessions}
          onChange={(e) => void update({ maxConcurrentSessions: Math.max(1, Number(e.target.value)) })}
        />
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Session timeout</div>
          <div className="kv-row-sub">Minutes before a hung worker process is killed.</div>
        </div>
        <input
          className="input"
          style={{ width: 70 }}
          type="number"
          min={2}
          max={240}
          value={settings.sessionTimeoutMinutes}
          onChange={(e) => void update({ sessionTimeoutMinutes: Math.max(2, Number(e.target.value)) })}
        />
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Require approval before deploy</div>
          <div className="kv-row-sub">Deployment tasks pause in the approval queue until you accept them.</div>
        </div>
        <Switch on={settings.requireDeployApproval} onClick={() => void update({ requireDeployApproval: !settings.requireDeployApproval })} label="Deploy approval" />
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Extract verified lessons after a run</div>
          <div className="kv-row-sub">Only accepted tasks become lessons and reusable workflow skills.</div>
        </div>
        <Switch on={settings.autoExtractLessons} onClick={() => void update({ autoExtractLessons: !settings.autoExtractLessons })} label="Auto lessons" />
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">Fallback planner</div>
          <div className="kv-row-sub">Use the deterministic planner when no model is reachable, instead of stalling.</div>
        </div>
        <Switch on={settings.plannerFallback} onClick={() => void update({ plannerFallback: !settings.plannerFallback })} label="Fallback planner" />
      </div>
    </div>
  )
}

function DataTab() {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId)
  return (
    <>
      <div className="section-label">Current project</div>
      <dl>
        <div className="kv"><dt>Name</dt><dd>{project?.name ?? '—'}</dd></div>
        <div className="kv"><dt>Workspace</dt><dd className="mono">{project?.path ?? '—'}</dd></div>
        <div className="kv"><dt>Workers</dt><dd>{snapshot.agents.length}</dd></div>
        <div className="kv"><dt>Tasks</dt><dd>{snapshot.tasks.length}</dd></div>
        <div className="kv"><dt>Sessions</dt><dd>{snapshot.sessions.length}</dd></div>
        <div className="kv"><dt>Memory docs</dt><dd>{snapshot.memories.length}</dd></div>
        <div className="kv"><dt>Skills</dt><dd>{snapshot.skills.length}</dd></div>
      </dl>
      <div className="section-label" style={{ marginTop: 14 }}>Local storage</div>
      <p className="hint" style={{ lineHeight: 1.65 }}>
        Everything lives on this machine: SQLite at <span className="mono">%APPDATA%/ventriee-studios/ventriee.db</span>,
        human-readable memory under <span className="mono">%APPDATA%/ventriee-studios/memory</span>, and skills under
        <span className="mono"> %APPDATA%/ventriee-studios/skills</span>. Nothing is uploaded.
      </p>
      <div className="flex gap-8" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => void guard(() => window.ventriee.refreshSkills(), 'Skill registry rescanned')}>
          <IconRefresh /> Rescan skills
        </button>
        {project ? (
          <button className="btn" onClick={() => void guard(() => window.ventriee.openPath(project.path), 'Workspace opened')}>
            Open workspace folder
          </button>
        ) : null}
      </div>
    </>
  )
}
