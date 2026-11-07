import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { IconGrid, IconList, IconPlus, IconSpark } from '../icons'
import { OfficeFloor } from './OfficeFloor'
import type { Agent } from '../../../shared/types'

const roleShort = (role: string) =>
  ({
    orchestrator: 'Orchestrator',
    researcher: 'Researcher',
    architect: 'Architect',
    designer: 'Designer',
    frontend: 'Frontend',
    integration: 'Integration',
    backend: 'Backend',
    reviewer: 'Reviewer',
    fixer: 'Bug fixer',
    qa: 'QA',
    seo: 'SEO',
    aeo: 'AEO/GEO',
    deployment: 'Deployment',
    monitoring: 'Monitoring'
  })[role] ?? role

export function Floor({ onNewProject }: { onNewProject: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const select = useStore((s) => s.select)
  const selectedAgentId = useStore((s) => s.selectedAgentId)
  const [view, setView] = useState<'floor' | 'list'>('floor')

  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const agents = snapshot.agents
  const tasks = snapshot.tasks

  const currentTask = (agent: Agent) => {
    if (!agent.currentTaskId) return null
    return tasks.find((t) => t.id === agent.currentTaskId) ?? null
  }
  const working = agents.filter((a) => a.status === 'working').length
  const liveJob = snapshot.jobs.find((j) => j.status === 'running') ?? null
  const runningTask = tasks.find((t) => t.status === 'running') ?? null
  const done = tasks.filter((t) => t.status === 'done').length

  const summary = useMemo(() => {
    if (liveJob) {
      return runningTask ? `${roleShort(runningTask.role)} on “${runningTask.title}”` : 'Planning and dispatching work'
    }
    if (tasks.length) return lastSummary(snapshot)
    return 'Waiting for your brief'
  }, [liveJob, runningTask, tasks.length, snapshot])

  if (!project) {
    return (
      <div className="empty-stage">
        <div className="empty-card">
          <div className="empty-glyph"><IconSpark /></div>
          <div className="empty-title">Your studio is empty</div>
          <p className="empty-body">
            Create a project to open the office. Ventriee will seed fourteen specialist workers,
            a memory folder and an orchestrator ready to take a brief.
          </p>
          <button className="btn primary" onClick={onNewProject} style={{ height: 30 }}>
            <IconPlus /> New project
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="floor-toolbar">
        <span className="floor-title">Studio floor</span>
        <span className="floor-count">
          {working > 0 ? `${working} working` : agents.length ? 'all idle' : 'no workers'}
          {tasks.length ? ` · ${done}/${tasks.length} done` : ''}
        </span>
        <span className="floor-summary" title={summary}>{summary}</span>
        <div className="floor-tools">
          <button
            className={`chip-toggle${view === 'floor' ? ' on' : ''}`}
            onClick={() => setView('floor')}
            aria-pressed={view === 'floor'}
          >
            <IconGrid /> Office
          </button>
          <button
            className={`chip-toggle${view === 'list' ? ' on' : ''}`}
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
          >
            <IconList /> List
          </button>
        </div>
      </div>

      {view === 'floor' ? (
        <div className="office-stage">
          <OfficeFloor onSelect={select} />
          <div className="office-legend">
            <span className="legend-item"><span className="legend-dot working" /> working</span>
            <span className="legend-item"><span className="legend-dot waiting" /> waiting</span>
            <span className="legend-item"><span className="legend-dot error" /> needs you</span>
            <span className="legend-item"><span className="legend-dot idle" /> idle</span>
          </div>
        </div>
      ) : (
        <div className="floor">
          <div className="roster" role="table" aria-label="Worker roster">
            <div className="roster-row roster-head" role="row">
              <span>Worker</span><span>Current task</span><span>Model</span><span>State</span>
            </div>
            {agents.map((agent) => {
              const task = currentTask(agent)
              return (
                <button
                  key={agent.id}
                  className={`roster-row${selectedAgentId === agent.id ? ' selected' : ''}`}
                  onClick={() => select(agent.id)}
                  role="row"
                >
                  <span className="roster-who">
                    <span className="avatar" style={{ ['--who' as string]: agent.color }}>
                      {initials(agent.name)}
                      <span className={`status-pip ${agent.status}`} />
                    </span>
                    {agent.name}
                    <span className="roster-role">{roleShort(agent.role)}</span>
                  </span>
                  <span className="roster-task">{task?.title ?? agent.lastError ?? idleLine(agent)}</span>
                  <span className="roster-model">{shortModel(agent)}</span>
                  <span className={`desk-state ${agent.status}`} style={{ justifySelf: 'start' }}>{agent.status}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

function shortModel(agent: Agent) {
  if (agent.model) return agent.model.split('/').pop() ?? agent.model
  const map: Record<string, string> = {
    'cli-opencode': 'opencode default',
    'cli-claude': 'claude default',
    'cli-codex': 'codex default',
    'cli-gemini': 'gemini default',
    'cli-ollama': 'ollama default'
  }
  return map[agent.engine] ?? agent.engine.replace(/^(cli|api)-/, '')
}

function idleLine(agent: Agent) {
  const lines: Record<string, string> = {
    orchestrator: 'Ready for a brief',
    researcher: 'No research queued',
    architect: 'Waiting on research',
    designer: 'Waiting on requirements',
    frontend: 'At the desk',
    integration: 'At the desk',
    backend: 'At the desk',
    reviewer: 'Review queue empty',
    fixer: 'No defects open',
    qa: 'No build to test',
    seo: 'No crawl targets yet',
    aeo: 'No content to structure',
    deployment: 'Nothing staged',
    monitoring: 'No deployment to watch'
  }
  return lines[agent.role] ?? 'Idle'
}

function lastSummary(snapshot: { events: Array<{ type: string; message: string }>; jobs: Array<{ status: string }> }) {
  const last = snapshot.events.filter((e) => e.type === 'task' || e.type === 'memory').slice(-1)[0]
  if (last) return last.message
  return snapshot.jobs.length ? 'Last run complete' : 'Waiting for your brief'
}
