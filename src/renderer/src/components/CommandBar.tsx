import { useEffect, useRef, useState } from 'react'
import { guard, useStore } from '../store'
import { IconSend, IconStop } from '../icons'

const SUGGESTIONS = [
  'Build a modern marketing site with an admin panel, auth, responsive design and SEO',
  'Add Stripe checkout to the existing app and wire the webhook',
  'Audit this project for security issues, then fix what you find'
]

export function CommandBar() {
  const snapshot = useStore((s) => s.snapshot)!
  const draft = useStore((s) => s.draft)
  const setDraft = useStore((s) => s.setDraft)
  const notify = useStore((s) => s.notify)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const running = snapshot.running
  const configured = snapshot.providers.filter((p) => p.available).length

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [draft])

  const submit = async () => {
    if (!project || busy || running || !draft.trim()) return
    setBusy(true)
    const result = await guard(() => window.ventriee.startRun({ projectId: project.id, instruction: draft.trim() }))
    setBusy(false)
    if (result) {
      setDraft('')
      useStore.getState().setRailTab('plan')
      notify('Brief sent to the orchestrator')
    }
  }

  return (
    <div className="command">
      <div className="command-inner">
        <div className="composer">
          <textarea
            id="owner-input"
            ref={ref}
            value={draft}
            rows={1}
            placeholder={
              project
                ? 'Brief the orchestrator. What should the studio build next?'
                : 'Create a project first, then brief the orchestrator.'
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            disabled={!project}
            aria-label="Owner instruction"
          />
          {running ? (
            <button className="stop-btn" onClick={() => void guard(() => window.ventriee.stopRun(project!.id), 'Run stopped')}>
              <IconStop /> Stop
            </button>
          ) : (
            <button className="send-btn" onClick={submit} disabled={!project || !draft.trim() || busy}>
              <IconSend /> Run
            </button>
          )}
        </div>
        <div className="command-foot">
          <span><span className="kbd">Enter</span> send · <span className="kbd">Shift</span>+<span className="kbd">Enter</span> newline</span>
          <span>·</span>
          <span><span className="kbd">Ctrl</span>+<span className="kbd">K</span> focus</span>
          <span className="ml-auto">
            {running
              ? 'Orchestrator is dispatching. Stop halts every live session.'
              : draft.trim()
                ? 'Sends to the orchestrator, which plans and assigns the team.'
                : configured === 0
                  ? 'No engine available. Open settings to configure one.'
                  : SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)]}
          </span>
        </div>
      </div>
    </div>
  )
}
