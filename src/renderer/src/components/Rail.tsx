import { useMemo, useState } from 'react'
import { guard, useStore } from '../store'
import { IconCheck, IconInbox, IconPulse } from '../icons'
import type { Agent, Task } from '../../../shared/types'

export function Rail() {
  const snapshot = useStore((s) => s.snapshot)!
  const railTab = useStore((s) => s.railTab)
  const setRailTab = useStore((s) => s.setRailTab)
  const select = useStore((s) => s.select)

  const tasks = snapshot.tasks
  const pending = tasks.filter((t) => t.status === 'approval').length
  const unread = snapshot.messages.filter((m) => m.status === 'unread' && m.type !== 'handover').length

  return (
    <aside className="rail">
      <div className="rail-tabs" role="tablist" aria-label="Run details">
        <button className={`rail-tab${railTab === 'plan' ? ' on' : ''}`} onClick={() => setRailTab('plan')} role="tab" aria-selected={railTab === 'plan'}>
          Plan
          {tasks.length ? <span className="count">{tasks.length}</span> : null}
        </button>
        <button className={`rail-tab${railTab === 'activity' ? ' on' : ''}`} onClick={() => setRailTab('activity')} role="tab" aria-selected={railTab === 'activity'}>
          <IconPulse width={11} height={11} /> Activity
        </button>
        <button className={`rail-tab${railTab === 'mail' ? ' on' : ''}`} onClick={() => setRailTab('mail')} role="tab" aria-selected={railTab === 'mail'}>
          <IconInbox width={11} height={11} /> Mail
          {unread + pending ? <span className="count">{unread + pending}</span> : null}
        </button>
      </div>
      <div className="rail-body">
        {railTab === 'plan' ? <Plan tasks={tasks} agents={snapshot.agents} onSelect={select} /> : null}
        {railTab === 'activity' ? <Activity snapshot={snapshot} onSelect={select} /> : null}
        {railTab === 'mail' ? <Mail /> : null}
      </div>
    </aside>
  )
}

function Plan({ tasks, agents, onSelect }: { tasks: Task[]; agents: Agent[]; onSelect: (id: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sorted = useMemo(() => {
    const rank: Record<string, number> = { running: 0, approval: 1, review: 2, rework: 3, ready: 4, blocked: 5, failed: 6, done: 7, todo: 8 }
    return [...tasks].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.createdAt - b.createdAt)
  }, [tasks])

  if (!tasks.length) {
    return (
      <div className="empty-mini">
        <p className="faint" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          No plan yet. Describe what you want to build in the command bar and the orchestrator will
          break it into tasks.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="section-label">
        <span>Tasks</span>
        <span>{tasks.filter((t) => t.status === 'done').length}/{tasks.length}</span>
      </div>
      {sorted.map((task) => {
        const agent = task.agentId ? agents.find((a) => a.id === task.agentId) ?? null : null
        const open = expanded === task.id
        return (
          <div
            key={task.id}
            className={`task-card${task.status === 'running' ? ' active' : ''}${task.status === 'approval' ? ' approval' : ''}`}
            onClick={() => setExpanded(open ? null : task.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setExpanded(open ? null : task.id)}
          >
            <div className="task-top">
              <div className="task-title">{task.title}</div>
            </div>
            <div className="task-meta">
              <span className="task-phase">{task.phase}</span>
              {agent ? (
                <button
                  className="ghost-link"
                  style={{ fontSize: 9.5 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(agent.id)
                  }}
                >
                  {agent.name}
                </button>
              ) : <span>unassigned</span>}
              <span className={`task-status ${task.status}`}>{task.status}</span>
            </div>
            {open ? (
              <>
                <div className="task-evidence" style={{ WebkitLineClamp: 8, marginTop: 7 }}>
                  {task.description}
                </div>
                <div className="task-evidence" style={{ WebkitLineClamp: 6 }}>
                  <strong style={{ color: 'var(--muted)' }}>Acceptance:</strong> {task.acceptance}
                </div>
                {task.review ? (
                  <div className="task-evidence" style={{ WebkitLineClamp: 6 }}>
                    <strong style={{ color: 'var(--muted)' }}>Review:</strong> {task.review}
                  </div>
                ) : null}
                <div className="task-actions" onClick={(e) => e.stopPropagation()}>
                  {task.status === 'approval' ? (
                    <>
                      <button className="btn tiny primary" onClick={() => void guard(() => window.ventriee.approveTask(task.id), 'Approved')}>
                        <IconCheck /> Approve
                      </button>
                      <button
                        className="btn tiny"
                        onClick={() => {
                          const reason = window.prompt('Why is this rejected?') ?? ''
                          if (reason.trim()) void guard(() => window.ventriee.rejectTask(task.id, reason.trim()), 'Sent back for rework')
                        }}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {task.status === 'failed' || task.status === 'rework' ? (
                    <button className="btn tiny" onClick={() => void guard(() => window.ventriee.retryTask(task.id), 'Task queued for retry')}>
                      Retry
                    </button>
                  ) : null}
                  {task.output ? (
                    <button
                      className="btn tiny"
                      onClick={() =>
                        void guard(() =>
                          window.ventriee.openPath(
                            useStore.getState().snapshot?.projects.find((p) => p.id === task.projectId)?.path ?? ''
                          )
                        )
                      }
                    >
                      Open workspace
                    </button>
                  ) : null}
                </div>
              </>
            ) : task.review && task.status === 'done' ? (
              <div className="task-evidence">{task.review}</div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

function useStoreForAgent(id: string) {
  const snapshot = useStore((s) => s.snapshot)
  return snapshot?.agents.find((a) => a.id === id) ?? null
}

function Activity({ snapshot, onSelect }: { snapshot: NonNullable<ReturnType<typeof useStore.getState>['snapshot']>; onSelect: (id: string) => void }) {  const events = [...snapshot.events].reverse().slice(0, 160)
  if (!events.length) {
    return <p className="faint" style={{ fontSize: 11.5, padding: 4 }}>No activity yet.</p>
  }
  return (
    <div className="log">
      {events.map((event) => {
        const agent = event.agentId ? snapshot.agents.find((a) => a.id === event.agentId) : null
        return (
          <div key={event.id} className={`log-row ${event.type}`}>
            <span className="log-time">{time(event.createdAt)}</span>
            <span className="log-msg">
              {agent ? (
                <button
                  className="ghost-link"
                  style={{ fontSize: 10.5, color: 'var(--text-dim)', fontWeight: 550 }}
                  onClick={() => onSelect(agent.id)}
                >
                  {agent.name}
                </button>
              ) : null}
              {agent ? ' ' : ''}
              {event.message}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Mail() {
  const snapshot = useStore((s) => s.snapshot)!
  const select = useStore((s) => s.select)
  const messages = [...snapshot.messages].reverse().slice(0, 90)
  const approvals = snapshot.tasks.filter((t) => t.status === 'approval')

  const name = (id: string) => {
    if (id === 'owner') return 'You'
    if (id === 'orchestrator') return 'Orchestrator'
    return snapshot.agents.find((a) => a.id === id)?.name ?? id.slice(0, 6)
  }

  return (
    <>
      {approvals.length ? (
        <>
          <div className="section-label">Needs your approval</div>
          {approvals.map((task) => (
            <div key={task.id} className="mail" style={{ borderColor: '#4a3f28' }}>
              <div className="mail-head">
                <span className="mail-type owner">approval</span>
                <span className="truncate">{task.title}</span>
              </div>
              <div className="mail-body" style={{ WebkitLineClamp: 3 }}>{task.review}</div>
              <div className="task-actions">
                <button className="btn tiny primary" onClick={() => void guard(() => window.ventriee.approveTask(task.id), 'Approved')}>Approve</button>
                <button
                  className="btn tiny"
                  onClick={() => {
                    const reason = window.prompt('Why is this rejected?') ?? ''
                    if (reason.trim()) void guard(() => window.ventriee.rejectTask(task.id, reason.trim()), 'Sent back')
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}
      <div className="section-label">
        <span>Message log</span>
        <span>{snapshot.messages.length}</span>
      </div>
      {messages.length === 0 ? (
        <p className="faint" style={{ fontSize: 11.5, padding: 4 }}>No messages yet.</p>
      ) : (
        messages.map((m) => (
          <div key={m.id} className="mail">
            <div className="mail-head">
              <span className={`mail-type ${m.type}`}>{m.type}</span>
              <button className="ghost-link" style={{ fontSize: 10 }} onClick={() => m.sender !== 'owner' && m.sender !== 'orchestrator' && select(m.sender)}>
                {name(m.sender)}
              </button>
              <span>→ {name(m.recipient)}</span>
              <span className="mail-route">{time(m.createdAt)}</span>
            </div>
            <div className="mail-body">{m.content}</div>
          </div>
        ))
      )}
    </>
  )
}

function time(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
