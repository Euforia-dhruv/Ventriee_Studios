import { useEffect, useRef, useState } from 'react'
import { guard, useStore } from './store'
import { Modal, NewProjectDialog, ProjectSwitcher, Toast } from './shell'
import { Floor } from './components/Floor'
import { Rail } from './components/Rail'
import { Preview } from './components/Preview'
import { CommandBar } from './components/CommandBar'
import { Inspector } from './components/Inspector'
import { Workspace } from './components/Workspace'
import { SettingsPanel } from './panels/SettingsPanel'
import { MemoryPanel } from './panels/MemoryPanel'
import { AutomationsPanel, SkillsPanel } from './panels/SkillsPanel'
import { ProjectPanel } from './panels/ProjectPanel'
import { IconMemory, IconClock, IconSettings, IconSkill } from './icons'

export function App() {
  const snapshot = useStore((s) => s.snapshot)
  const ready = useStore((s) => s.ready)
  const panel = useStore((s) => s.panel)
  const setPanel = useStore((s) => s.setPanel)
  const setSnapshot = useStore((s) => s.setSnapshot)
  const appendOutput = useStore((s) => s.appendOutput)
  const appendChat = useStore((s) => s.appendChat)
  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const selectedAgentId = useStore((s) => s.selectedAgentId)
  const [newProject, setNewProject] = useState(false)

  useEffect(() => {
    let mounted = true
    void window.ventriee.snapshot().then((snap) => {
      if (mounted) setSnapshot(snap)
    })
    const offPatch = window.ventriee.onPatch((snap) => setSnapshot(snap))
    const offOutput = window.ventriee.onOutput((payload) => appendOutput(payload.agentId, payload.chunk))
    const offChat = window.ventriee.onChatChunk((payload) => appendChat(payload.messageId, payload.chunk))
    return () => {
      mounted = false
      offPatch()
      offOutput()
      offChat()
    }
  }, [setSnapshot, appendOutput, appendChat])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.getElementById('owner-input')?.focus()
      }
      if (e.key === 'Escape' && useStore.getState().selectedAgentId) {
        useStore.getState().select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // first run opens the dialog once; creating a project (from any surface) closes it
  const hasProjects = Boolean(snapshot && snapshot.projects.length > 0)
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!ready || !snapshot || autoOpened.current) return
    autoOpened.current = true
    if (snapshot.projects.length === 0) setNewProject(true)
  }, [ready, snapshot])
  useEffect(() => {
    if (hasProjects) setNewProject(false)
  }, [hasProjects])

  if (!ready || !snapshot) {
    return (
      <div className="app">
        <div className="skeleton">Starting Ventriee Studios…</div>
      </div>
    )
  }

  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const working = snapshot.agents.filter((a) => a.status === 'working').length
  const configured = snapshot.providers.filter((p) => p.available).length

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" role="img" aria-label="Ventriee Studios" />
          <div className="brand-text">
            <span className="brand-name">VENTRIEE</span>
            <span className="brand-sub">STUDIOS</span>
          </div>
        </div>
        <div className="tb-divider" />
        <ProjectSwitcher onOpen={() => setNewProject(true)} />
        <div className="tb-divider" />
        <div className="ws-toggle" role="tablist" aria-label="Workspace">
          <button
            className={`ws-tab${workspace === 'plan' ? ' on' : ''}`}
            onClick={() => setWorkspace('plan')}
            role="tab"
            aria-selected={workspace === 'plan'}
            title="Talk through the idea, write and approve the prompt"
          >
            Plan
          </button>
          <button
            className={`ws-tab${workspace === 'office' ? ' on' : ''}`}
            onClick={() => setWorkspace('office')}
            role="tab"
            aria-selected={workspace === 'office'}
            title="Watch the team work"
          >
            Office
            {working > 0 ? <span className="ws-live" aria-label={`${working} working`} /> : null}
          </button>
        </div>
        <div className="tb-spacer" />
        <div className="health" title={`${configured} of ${snapshot.providers.length} engines ready`}>
          <span className={`health-dot${working > 0 ? ' on' : configured > 0 ? ' warn' : ''}`} />
          <span className="health-label">
            {working > 0 ? `${working} active` : configured > 0 ? `${configured} engines` : 'no engines'}
          </span>
        </div>
        <div className="tb-divider" />
        <button className={`icon-btn${panel === 'memory' ? ' active' : ''}`} onClick={() => setPanel('memory')} title="Memory" aria-label="Memory">
          <IconMemory />
        </button>
        <button className={`icon-btn${panel === 'skills' ? ' active' : ''}`} onClick={() => setPanel('skills')} title="Skills" aria-label="Skills">
          <IconSkill />
        </button>
        <button className={`icon-btn${panel === 'automations' ? ' active' : ''}`} onClick={() => setPanel('automations')} title="Automations" aria-label="Automations">
          <IconClock />
        </button>
        <button className={`icon-btn${panel === 'settings' ? ' active' : ''}`} onClick={() => setPanel('settings')} title="Settings" aria-label="Settings">
          <IconSettings />
        </button>
      </header>

      {workspace === 'plan' ? (
        <Workspace />
      ) : (
        <>
          <div className="main">
            <div className="floor-wrap">
              <Floor onNewProject={() => setNewProject(true)} />
              {selectedAgentId ? <Inspector agentId={selectedAgentId} /> : null}
            </div>
            <aside className="side">
              <Preview />
              <Rail />
            </aside>
          </div>
          <CommandBar />
        </>
      )}

      {newProject ? <NewProjectDialog onClose={() => setNewProject(false)} /> : null}
      {panel === 'settings' ? <SettingsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'memory' ? <MemoryPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'skills' ? <SkillsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'automations' ? <AutomationsPanel onClose={() => setPanel('none')} /> : null}
      {panel === 'project' ? <ProjectPanel onClose={() => setPanel('none')} /> : null}
      {!project && snapshot.projects.length > 0 ? (
        <Modal title="No active project" onClose={() => setPanel('none')} narrow>
          <p className="dim" style={{ fontSize: 12 }}>
            Pick a project from the switcher, or create a new one.
          </p>
        </Modal>
      ) : null}
      {project && configured === 0 && !snapshot.settings.onboardingSeen ? (
        <OnboardingModal onClose={() => void guard(() => window.ventriee.saveSettings({ onboardingSeen: true }))} />
      ) : null}
      <Toast />
    </div>
  )
}

/** First-run: no engine is usable yet, tell the owner what to install or configure. */
function OnboardingModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Set up an engine to start" onClose={onClose} narrow>
      <p className="dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
        Ventriee runs agents through CLI tools or API providers. None are ready on this machine yet. Pick one path:
      </p>
      <div className="kv-row" style={{ marginTop: 10 }}>
        <div className="kv-row-main">
          <div className="kv-row-title">CLI agent (recommended)</div>
          <div className="kv-row-sub">
            Install and sign in to one of these, then restart: OpenCode (<span className="mono">npm i -g opencode-ai</span>), Claude Code (<span className="mono">claude</span>), Codex, or Ollama.
          </div>
        </div>
      </div>
      <div className="kv-row">
        <div className="kv-row-main">
          <div className="kv-row-title">API provider</div>
          <div className="kv-row-sub">Add a provider and API key in Settings → Providers (OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Mistral, local Ollama/LM Studio).</div>
        </div>
      </div>
      <div className="flex gap-8" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={onClose}>I'll set it up</button>
        <button className="btn" onClick={() => void guard(() => window.ventriee.openExternal('https://github.com/Euforia-dhruv/Ventriee_Studios#engines'))}>
          Read the guide
        </button>
      </div>
    </Modal>
  )
}
