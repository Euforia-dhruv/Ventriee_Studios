import { useMemo, useState } from 'react'
import { Modal } from '../shell'
import { guard, useStore } from '../store'
import { ModelPicker, resolveModel, type ResolvedModel } from './ModelPicker'
import { AddProviderDialog } from './AddProviderDialog'
import type { Assignment, PromptDoc } from '../../../shared/types'

export function AssignDialog({
  prompt,
  onClose,
  onAssigned
}: {
  prompt: PromptDoc
  onClose: () => void
  onAssigned: (result: { jobId: string; taskCount: number }) => void
}) {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId)
  const agents = useMemo(() => snapshot.agents.filter((a) => a.enabled), [snapshot.agents])
  const orchestrator = agents.find((a) => a.role === 'orchestrator') ?? null

  // The orchestrator itself never codes; it plans and dispatches.
  const workers = agents.filter((a) => a.role !== 'orchestrator')

  const [selected, setSelected] = useState<string[]>([])
  const [picks, setPicks] = useState<Record<string, ResolvedModel>>({})
  const [mode, setMode] = useState<'orchestrator' | 'manual'>('orchestrator')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const move = (id: string, delta: number) => {
    setSelected((prev) => {
      const i = prev.indexOf(id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const go = async () => {
    if (!project || !selected.length) return
    setBusy(true)
    const result = await guard(() =>
      window.ventriee.assignPrompt({
        projectId: project.id,
        promptId: prompt.id,
        mode,
        agents: selected.map((agentId) => {
          const pick = picks[agentId]
          return pick
            ? { agentId, model: pick.model, providerId: pick.providerId, engine: pick.engine, endpoint: pick.endpoint }
            : { agentId }
        }),
        note: note.trim() || undefined
      })
    )
    setBusy(false)
    if (result) onAssigned(result)
  }

  return (
    <>
      <Modal
        title="Assign the approved prompt"
        subtitle={`${prompt.title || 'Prompt'} · version ${prompt.version}. Selected workers receive this text plus the project conversation.`}
        onClose={onClose}
        actions={
          <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={go} disabled={busy || !selected.length}>
              {busy ? 'Starting…' : mode === 'manual' ? `Assign in order (${selected.length})` : `Assign to ${selected.length || 'no'} worker${selected.length === 1 ? '' : 's'}`}
            </button>
          </>
        }
      >
        <div className="assign-modes" role="radiogroup" aria-label="Assignment mode">
          <button
            className={`assign-mode${mode === 'orchestrator' ? ' on' : ''}`}
            onClick={() => setMode('orchestrator')}
            role="radio"
            aria-checked={mode === 'orchestrator'}
          >
            <span className="assign-mode-title">Orchestrator breaks it down</span>
            <span className="assign-mode-sub">
              {orchestrator ? `${orchestrator.name} plans the subtasks, then dispatches only the workers you pick.` : 'No enabled orchestrator; the deterministic planner is used.'}
            </span>
          </button>
          <button
            className={`assign-mode${mode === 'manual' ? ' on' : ''}`}
            onClick={() => setMode('manual')}
            role="radio"
            aria-checked={mode === 'manual'}
          >
            <span className="assign-mode-title">One task per worker, in order</span>
            <span className="assign-mode-sub">No planning step. Each selected worker gets the prompt directly, chained top to bottom.</span>
          </button>
        </div>

        <div className="assign-head">
          <span className="section-label" style={{ margin: 0 }}>Team</span>
          <div className="flex gap-4">
            <button className="ghost-link" onClick={() => setSelected(workers.map((a) => a.id))}>Select all</button>
            <button className="ghost-link" onClick={() => setSelected([])}>Clear</button>
          </div>
        </div>

        <div className="assign-list">
          {workers.map((agent) => {
            const on = selected.includes(agent.id)
            const hasOverride = Boolean(picks[agent.id])
            return (
              <div key={agent.id} className={`assign-row${on ? ' on' : ''}`}>
                <button className="assign-check" onClick={() => toggle(agent.id)} aria-pressed={on} aria-label={`${on ? 'Deselect' : 'Select'} ${agent.name}`}>
                  <span className={`check-box${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
                </button>
                <span className="avatar tiny" style={{ background: agent.color }}>{agent.name.slice(0, 1)}</span>
                <button className="assign-who" onClick={() => toggle(agent.id)}>
                  <span className="assign-name">{agent.name}</span>
                  <span className="assign-title">{agent.title}</span>
                </button>
                <span className="assign-order">
                  {on && mode === 'manual' ? (
                    <>
                      <button className="ord-btn" onClick={() => move(agent.id, -1)} disabled={selected.indexOf(agent.id) === 0} aria-label="Move up">↑</button>
                      <span className="ord-n">{selected.indexOf(agent.id) + 1}</span>
                      <button className="ord-btn" onClick={() => move(agent.id, 1)} disabled={selected.indexOf(agent.id) === selected.length - 1} aria-label="Move down">↓</button>
                    </>
                  ) : null}
                </span>
                <span className="assign-model">
                  <ModelPicker
                    compact
                    disabled={!on}
                    value={picks[agent.id] ?? null}
                    onPick={(option) => setPicks({ ...picks, [agent.id]: resolveModel(option, snapshot.providerConfigs) })}
                    onAddProvider={() => setAdding(true)}
                  />
                  {hasOverride ? (
                    <button className="ghost-link" onClick={() => { const next = { ...picks }; delete next[agent.id]; setPicks(next) }} title="Use this worker's saved model">
                      reset
                    </button>
                  ) : (
                    <span className="assign-current" title={`Current: ${agent.engine} ${agent.model || 'engine default'}`}>
                      {agent.model || agent.engine}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label className="field-label" htmlFor="asg-note">Note for every worker (optional)</label>
          <input
            id="asg-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Start with the data model, do not touch the marketing page yet."
          />
        </div>

        <p className="hint">
          The choice is saved to each worker, so it runs on that model for this task and every task after it.
          Every session records the model it actually used.
        </p>
      </Modal>

      {adding ? <AddProviderDialog onClose={() => setAdding(false)} /> : null}
    </>
  )
}

export function RecentAssignments({ assignments }: { assignments: Assignment[] }) {
  if (!assignments.length) return null
  return (
    <div className="assign-history">
      <div className="section-label">Assignment history</div>
      {[...assignments].reverse().slice(0, 6).map((a) => (
        <div key={a.id} className="kv-row">
          <span className="kv-row-main">
            <span className="kv-row-title">
              {a.mode === 'manual' ? 'Manual order' : 'Orchestrator plan'}
              <span className="badge">{a.agents.length} worker{a.agents.length === 1 ? '' : 's'}</span>
            </span>
            <span className="kv-row-sub">{a.agents.map((x) => x.name).join(', ')}</span>
          </span>
          <span className="faint" style={{ fontSize: 11 }}>{new Date(a.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
