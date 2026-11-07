import { useState } from 'react'
import { guard, useStore } from '../store'
import { Modal } from '../shell'
import { IconExternal, IconTrash } from '../icons'

export function ProjectPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')

  if (!project) return null

  const sessions = snapshot.sessions
  const tokens = sessions.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0)
  const cost = sessions.reduce((sum, s) => sum + s.costUsd, 0)
  const done = snapshot.tasks.filter((t) => t.status === 'done').length

  return (
    <Modal
      title={project.name}
      subtitle={project.path}
      onClose={onClose}
      narrow
      actions={
        <button className="btn" onClick={() => void guard(() => window.ventriee.openPath(project.path), 'Workspace opened')}>
          <IconExternal /> Open folder
        </button>
      }
    >
      <div className="metrics" style={{ marginBottom: 14 }}>
        <div className="metric"><div className="metric-value">{snapshot.agents.length}</div><div className="metric-label">Workers</div></div>
        <div className="metric"><div className="metric-value">{done}/{snapshot.tasks.length}</div><div className="metric-label">Tasks</div></div>
        <div className="metric"><div className="metric-value">{tokens ? `${(tokens / 1000).toFixed(1)}k` : '—'}</div><div className="metric-label">Tokens</div></div>
        <div className="metric"><div className="metric-value">{cost ? `$${cost.toFixed(3)}` : '—'}</div><div className="metric-label">Spend</div></div>
      </div>

      <div className="field">
        <label className="field-label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label">Brief</label>
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex gap-8">
        <button
          className="btn primary"
          onClick={async () => {
            await guard(() => window.ventriee.updateProject(project.id, { name: name.trim(), description }), 'Project saved')
            onClose()
          }}
        >
          Save project
        </button>
        <button
          className="btn danger"
          style={{ marginLeft: 'auto' }}
          onClick={async () => {
            if (!window.confirm(`Delete "${project.name}" from the studio? The workspace folder and files are not touched; memory is archived.`)) return
            const ok = await guard(() => window.ventriee.deleteProject(project.id), 'Project removed from studio')
            if (ok === undefined) return
            onClose()
          }}
        >
          <IconTrash /> Remove project
        </button>
      </div>

      <div className="section-label" style={{ marginTop: 18 }}>Recent sessions</div>
      {sessions.slice(0, 8).map((s) => (
        <div key={s.id} className="kv-row">
          <div className="kv-row-main">
            <div className="kv-row-title">
              {snapshot.agents.find((a) => a.id === s.agentId)?.name ?? s.agentId.slice(0, 6)}
              <span className={`badge ${s.status === 'done' ? 'ok' : s.status === 'failed' ? 'err' : ''}`}>{s.status}</span>
            </div>
            <div className="kv-row-sub mono" style={{ fontSize: 9.5 }}>
              {s.engine} · {s.model || 'default'} · {new Date(s.startedAt).toLocaleTimeString()}
              {s.outputTokens ? ` · ${s.outputTokens.toLocaleString()} out` : ''}
            </div>
          </div>
        </div>
      ))}
      {!sessions.length ? <p className="faint" style={{ fontSize: 12 }}>No sessions yet.</p> : null}
    </Modal>
  )
}
