import { useEffect, useMemo, useRef, useState } from 'react'
import { guard, useStore } from '../store'
import {
  IconClose, IconEdit, IconExternal, IconPause, IconPlay, IconSend, IconStop, IconTerminal
} from '../icons'
import type { Agent } from '../../../shared/types'

type Tab = 'live' | 'task' | 'messages' | 'config'

export function Inspector({ agentId }: { agentId: string }) {
  const snapshot = useStore((s) => s.snapshot)!
  const select = useStore((s) => s.select)
  const output = useStore((s) => s.output)
  const clearOutput = useStore((s) => s.clearOutput)
  const [tab, setTab] = useState<Tab>('live')
  const [instruction, setInstruction] = useState('')
  const termRef = useRef<HTMLDivElement>(null)

  const agent = snapshot.agents.find((a) => a.id === agentId) ?? null
  const task = agent?.currentTaskId ? snapshot.tasks.find((t) => t.id === agent.currentTaskId) ?? null : null
  const sessions = useMemo(
    () => snapshot.sessions.filter((s) => s.agentId === agentId).slice(0, 8),
    [snapshot.sessions, agentId]
  )
  const messages = useMemo(
    () => snapshot.messages.filter((m) => m.sender === agentId || m.recipient === agentId).slice(-30),
    [snapshot.messages, agentId]
  )
  const live = output[agentId] ?? ''
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId)

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [live, tab])

  useEffect(() => {
    setTab('live')
  }, [agentId])

  if (!agent) return null

  const tokens = sessions.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0)
  const cost = sessions.reduce((sum, s) => sum + s.costUsd, 0)

  return (
    <aside className="drawer" aria-label={`${agent.name} inspector`}>
      <div className="drawer-head">
        <div className="drawer-id">
          <div className="avatar" style={{ ['--who' as string]: agent.color }}>
            {agent.name.slice(0, 2).toUpperCase()}
            <span className={`status-pip ${agent.status}`} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="drawer-name">
              {agent.name}
              <span className={`desk-state ${agent.status}`}>{agent.status}</span>
            </div>
            <div className="drawer-sub">{agent.title} · {agent.autonomy} autonomy</div>
          </div>
          <button className="icon-btn drawer-close" onClick={() => select(null)} aria-label="Close inspector">
            <IconClose />
          </button>
        </div>
        <div className="drawer-tabs" role="tablist">
          {(['live', 'task', 'messages', 'config'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`drawer-tab${tab === t ? ' on' : ''}`}
              onClick={() => setTab(t)}
              role="tab"
              aria-selected={tab === t}
            >
              {t === 'live' ? 'Live' : t === 'task' ? 'Task' : t === 'messages' ? `Mail${messages.length ? ` ${messages.length}` : ''}` : 'Config'}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-body">
        {tab === 'live' ? (
          <>
            <div className="term-head">
              {agent.status === 'working' ? <span className="live-pip" /> : null}
              <span>{agent.status === 'working' ? 'streaming stdout' : 'session output'}</span>
              <span style={{ marginLeft: 'auto' }}>{live.length.toLocaleString()} chars</span>
              <button className="btn tiny" onClick={() => clearOutput(agentId)}>Clear</button>
            </div>
            <div className="term" ref={termRef} style={{ height: 'calc(100% - 74px)', maxHeight: 420 }}>
              {live || (
                <span className="term-empty">
                  {agent.status === 'working'
                    ? 'Waiting for the first chunk from the engine…'
                    : 'No live session. Output appears here while this worker runs.'}
                </span>
              )}
            </div>
            <div className="instruct">
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Send a direct instruction to this worker"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && instruction.trim()) {
                    void guard(() => window.ventriee.instructAgent(agentId, instruction.trim()), 'Instruction queued')
                    setInstruction('')
                  }
                }}
              />
              <button
                className="btn"
                disabled={!instruction.trim()}
                onClick={() => {
                  void guard(() => window.ventriee.instructAgent(agentId, instruction.trim()), 'Instruction queued')
                  setInstruction('')
                }}
              >
                <IconSend />
              </button>
            </div>
          </>
        ) : null}

        {tab === 'task' ? (
          task ? (
            <>
              <div className="section-label">Assigned task</div>
              <div style={{ fontSize: 13, fontWeight: 550, marginBottom: 6 }}>{task.title}</div>
              <div className="task-meta" style={{ marginBottom: 10 }}>
                <span className="task-phase">{task.phase}</span>
                <span className={`task-status ${task.status}`}>{task.status}</span>
                <span className="faint">attempt {task.attempts}</span>
                {['failed', 'rework', 'blocked'].includes(task.status) ? (
                  <button
                    className="btn tiny"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => void guard(() => window.ventriee.retryTask(task.id), 'Task queued for retry')}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
              <dl>
                <div className="kv"><dt>Runs as</dt><dd className="mono" style={{ fontSize: 11.5 }}>{task.engine ? `${task.engine} · ${task.model || 'default'}` : `${agent.engine} · ${agent.model || 'default'}`}</dd></div>
                <div className="kv"><dt>Brief</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{task.description}</dd></div>
                <div className="kv"><dt>Acceptance</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{task.acceptance}</dd></div>
                {task.review ? <div className="kv"><dt>Review</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{task.review}</dd></div> : null}
                {task.routedBy && task.routedBy !== 'manual' ? (
                  <div className="kv"><dt>Model chosen by</dt><dd>{task.routedBy === 'automatic' ? 'Orchestrator (automatic routing)' : 'Orchestrator (hybrid, worker default kept)'}</dd></div>
                ) : null}
                {task.dependsOn.length ? (
                  <div className="kv">
                    <dt>Depends on</dt>
                    <dd>{task.dependsOn.map((d) => snapshot.tasks.find((t) => t.id === d)?.title ?? d).join(', ')}</dd>
                  </div>
                ) : null}
              </dl>
              {task.output ? (
                <>
                  <div className="section-label" style={{ marginTop: 14 }}>Worker report</div>
                  <div className="term" style={{ maxHeight: 260, minHeight: 100 }}>{task.output}</div>
                </>
              ) : null}
            </>
          ) : (
            <p className="faint" style={{ fontSize: 12 }}>No task assigned right now.</p>
          )
        ) : null}

        {tab === 'messages' ? (
          messages.length ? (
            [...messages].reverse().map((m) => (
              <div key={m.id} className="mail">
                <div className="mail-head">
                  <span className={`mail-type ${m.type}`}>{m.type}</span>
                  <span>{m.sender === agentId ? 'out' : 'in'}</span>
                  <span className="mail-route">{new Date(m.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="mail-body" style={{ WebkitLineClamp: 10 }}>{m.content}</div>
              </div>
            ))
          ) : (
            <p className="faint" style={{ fontSize: 12 }}>No messages exchanged yet.</p>
          )
        ) : null}

        {tab === 'config' ? (
          <>
            <ConfigRow label="Role" value={agent.role} />
            <ConfigRow label="Engine" value={agent.engine} />
            <ConfigRow label="Model" value={agent.model || 'engine default'} mono />
            {agent.endpoint ? <ConfigRow label="Endpoint" value={agent.endpoint} mono /> : null}
            <ConfigRow label="Autonomy" value={agent.autonomy} />
            <ConfigRow label="Reasoning effort" value={agent.reasoning ?? 'auto'} />
            <ConfigRow label="Budget" value={`$${agent.budgetUsd.toFixed(2)}`} />
            <ConfigRow label="Sessions" value={String(sessions.length)} />
            <ConfigRow label="Tokens" value={tokens ? tokens.toLocaleString() : 'not reported'} />
            <ConfigRow label="Cost" value={cost ? `$${cost.toFixed(4)}` : 'not reported'} />
            {agent.lastError ? <ConfigRow label="Last error" value={agent.lastError} danger /> : null}
            <div className="section-label" style={{ marginTop: 14 }}>Standing instructions</div>
            <div className="term" style={{ minHeight: 90, maxHeight: 200 }}>{agent.instructions}</div>

            <div className="flex gap-8" style={{ marginTop: 14, flexWrap: 'wrap' }}>
              {agent.status === 'working' ? (
                <button className="btn danger" onClick={() => void guard(() => window.ventriee.stopAgent(agentId), 'Session stopped')}>
                  <IconStop /> Stop session
                </button>
              ) : null}
              {agent.status === 'waiting' ? (
                <button className="btn" onClick={() => void guard(() => window.ventriee.resumeAgent(agentId), 'Worker resumed')}>
                  <IconPlay /> Resume
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={() => void guard(() => window.ventriee.pauseAgent(agentId), 'Worker paused')}
                  disabled={agent.status !== 'working'}
                >
                  <IconPause /> Pause
                </button>
              )}
              {project ? (
                <button className="btn" onClick={() => void guard(() => window.ventriee.revealFile(project.path), 'Workspace opened')}>
                  <IconExternal /> Workspace
                </button>
              ) : null}
              <button className="btn" onClick={() => useStore.getState().setPanel('settings')}>
                <IconEdit /> Edit worker
              </button>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  )
}

function ConfigRow({ label, value, mono, danger }: { label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <dl>
      <div className="kv">
        <dt>{label}</dt>
        <dd className={mono ? 'mono' : ''} style={{ color: danger ? 'var(--err)' : undefined }}>{value}</dd>
      </div>
    </dl>
  )
}

export type { Agent }
