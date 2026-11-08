import { useEffect, useRef, useState } from 'react'
import { guard, useStore } from '../store'
import { IconSend } from '../icons'

interface AdvisorMsg {
  role: 'user' | 'assistant'
  text: string
  model?: string
  time: number
}

/**
 * Side-chat advisor: talk with a model that sees the current project state.
 * Use it to improve the prompt, interpret a failure, or plan the next step.
 */
export function SideChat({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [msgs, setMsgs] = useState<AdvisorMsg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, busy])

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy || !project) return
    const userMsg: AdvisorMsg = { role: 'user', text: t, time: Date.now() }
    setMsgs((m) => [...m, userMsg])
    setDraft('')
    setBusy(true)
    const res = await guard(() => window.ventriee.chatAdvisor({ projectId: project.id, text: t }))
    setBusy(false)
    if (res) {
      setMsgs((m) => [...m, { role: 'assistant', text: res.reply, model: res.model, time: Date.now() }])
    }
  }

  const copyLast = () => {
    const last = msgs.filter((m) => m.role === 'assistant').at(-1)
    if (last) void navigator.clipboard.writeText(last.text)
  }

  return (
    <aside className="sidechat" aria-label="Advisor chat">
      <div className="sidechat-head">
        <div>
          <div className="sidechat-title">Advisor</div>
          <div className="sidechat-sub">Talks with your project state · {project?.name ?? 'no project'}</div>
        </div>
        <button className="icon-btn drawer-close" onClick={onClose} aria-label="Close advisor chat">
          ✕
        </button>
      </div>

      <div className="sidechat-body">
        {!project ? (
          <p className="faint" style={{ fontSize: 12 }}>Open a project to talk with the advisor.</p>
        ) : !msgs.length ? (
          <p className="faint" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Ask things like:
            <br />• "Is my prompt specific enough?"
            <br />• "The architect keeps failing, what should it deliver?"
            <br />• "How should I split this into smaller tasks?"
          </p>
        ) : (
          msgs.map((m, i) => (
            <div key={i} className={`sidechat-msg ${m.role}`}>
              <div className="sidechat-msg-head">
                <span>{m.role === 'user' ? 'You' : 'Advisor'}</span>
                {m.model ? <span className="faint mono" style={{ fontSize: 9.5 }}>{m.model}</span> : null}
                <span className="faint" style={{ fontSize: 9.5 }}>{new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="sidechat-msg-body">{m.text}</div>
            </div>
          ))
        )}
        {busy ? <div className="sidechat-typing">thinking…</div> : null}
        <div ref={end} />
      </div>

      <div className="sidechat-foot">
        {msgs.some((m) => m.role === 'assistant') ? (
          <button className="ghost-link" style={{ alignSelf: 'flex-end', marginBottom: 4 }} onClick={copyLast}>
            Copy last reply
          </button>
        ) : null}
        <div className="sidechat-input-row">
          <textarea
            className="textarea sidechat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(draft)
              }
            }}
            placeholder="Ask the advisor…"
            aria-label="Advisor message"
            rows={2}
          />
          <button className="btn primary" onClick={() => void send(draft)} disabled={!draft.trim() || busy || !project}>
            <IconSend width={11} height={11} />
          </button>
        </div>
      </div>
    </aside>
  )
}
