import { useEffect, useMemo, useRef, useState } from 'react'
import { guard, useStore } from '../store'
import { IconCheck, IconCopy, IconRefresh, IconSend, IconSpark } from '../icons'
import { ModelPicker, resolveModel, type ResolvedModel } from './ModelPicker'
import { AddProviderDialog } from './AddProviderDialog'
import { AssignDialog, RecentAssignments } from './AssignDialog'
import type { ChatMessage, PromptDoc } from '../../../shared/types'

/** Six stages, in order. Two of them leave this screen; the rest happen here. */
type Stage = 1 | 2 | 3 | 4 | 5 | 6

export function Workspace() {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const settings = snapshot.settings
  const chat = snapshot.chat
  const prompts = snapshot.prompts
  const chatStream = useStore((s) => s.chatStream)
  const [adding, setAdding] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [sending, setSending] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const latest = prompts.length ? prompts[prompts.length - 1] : null
  const active = prompts.find((p) => p.id === selectedId) ?? latest

  useEffect(() => {
    if (selectedId && !prompts.some((p) => p.id === selectedId)) setSelectedId(null)
  }, [prompts, selectedId])

  const planner: ResolvedModel = {
    engine: settings.plannerEngine,
    model: settings.plannerModel,
    endpoint: settings.plannerEndpoint,
    providerId: null
  }

  const stage: Stage = snapshot.tasks.length
    ? snapshot.tasks.some((t) => t.status === 'done')
      ? 6
      : 5
    : active
      ? active.source === 'enhanced'
        ? 4
        : 3
      : chat.some((m) => m.role === 'owner')
        ? 2
        : 1

  const savePlanner = (pick: ResolvedModel) => {
    void guard(() =>
      window.ventriee.saveSettings({
        plannerEngine: pick.engine,
        plannerModel: pick.model,
        plannerEndpoint: pick.endpoint
      })
    )
  }

  const send = async (text: string) => {
    if (!project || !text.trim() || sending) return
    setSending(true)
    const result = await guard(() =>
      window.ventriee.chatSend({
        projectId: project.id,
        text: text.trim(),
        engine: planner.engine,
        model: planner.model,
        endpoint: planner.endpoint
      })
    )
    setSending(false)
    if (result) useStore.getState().setChatDraft('')
  }

  const createPrompt = async () => {
    if (!project || creating) return
    setCreating(true)
    const doc = await guard(
      () =>
        window.ventriee.promptCreate({
          projectId: project.id,
          engine: planner.engine,
          model: planner.model,
          endpoint: planner.endpoint
        }),
      'Prompt generated'
    )
    setCreating(false)
    if (doc) setSelectedId(doc.id)
  }

  if (!project) {
    return (
      <div className="plan">
        <div className="plan-empty">
          <h2>No project open</h2>
          <p className="dim">Create or pick a project, then describe what you want to build.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="plan">
      <div className="plan-main">
        <StageStrip
          stage={stage}
          onGoOffice={() => useStore.getState().setWorkspace('office')}
          onGoReview={() => {
            useStore.getState().setWorkspace('office')
            useStore.getState().setRailTab('plan')
          }}
        />
        <ChatThread chat={chat} stream={chatStream} />
        <ChatComposer
          sending={sending}
          send={send}
          planner={planner}
          onPick={savePlanner}
          onAddProvider={() => setAdding(true)}
          canCreate={chat.some((m) => m.role === 'owner' && m.content.trim())}
          creating={creating}
          createPrompt={createPrompt}
        />
      </div>

      <aside className="plan-side">
        <PromptPanel
          prompts={prompts}
          active={active}
          onSelect={setSelectedId}
          onAssign={() => setAssigning(true)}
          onAddProvider={() => setAdding(true)}
          planner={planner}
          disabled={!active}
        />
        <RecentAssignments assignments={snapshot.assignments} />
      </aside>

      {adding ? <AddProviderDialog onClose={() => setAdding(false)} /> : null}
      {assigning && active ? (
        <AssignDialog
          prompt={active}
          onClose={() => setAssigning(false)}
          onAssigned={(result) => {
            setAssigning(false)
            useStore.getState().notify(`Assigned. ${result.taskCount || 'Planning'} ${result.taskCount === 1 ? 'task' : 'tasks'} queued.`)
            useStore.getState().setWorkspace('office')
            useStore.getState().setRailTab('plan')
          }}
        />
      ) : null}
    </div>
  )
}

const STAGES = ['Chat', 'Prompt', 'Enhance', 'Assign', 'Execute', 'Review']

function StageStrip({ stage, onGoOffice, onGoReview }: { stage: Stage; onGoOffice: () => void; onGoReview: () => void }) {
  return (
    <ol className="stages" aria-label="Workflow">
      {STAGES.map((label, i) => {
        const n = (i + 1) as Stage
        const done = n < stage
        const current = n === stage
        const jump = n === 5 ? onGoOffice : n === 6 ? onGoReview : null
        return (
          <li key={`${label}:${current ? 'now' : done ? 'done' : 'next'}`} className={`stage${done ? ' done' : ''}${current ? ' now' : ''}`}>
            {jump ? (
              <button className="stage-btn" onClick={jump} title={`Open ${label.toLowerCase()}`}>
                <span className="stage-n">{done ? '✓' : n}</span>
                {label}
              </button>
            ) : (
              <span className="stage-btn static">
                <span className="stage-n">{done ? '✓' : n}</span>
                {label}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function ChatThread({ chat, stream }: { chat: ChatMessage[]; stream: Record<string, string> }) {
  const end = useRef<HTMLDivElement>(null)
  const last = chat[chat.length - 1]
  const live = last ? stream[last.id] ?? '' : ''
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [chat.length, live.length])

  if (!chat.length) {
    return (
      <div className="chat-scroll">
        <div className="chat-empty">
          <h2>What are we building?</h2>
          <p className="dim">
            Describe the idea in your own words. I will ask questions, suggest improvements and help you
            settle the architecture before anything is written. No agent starts working until you assign
            an approved prompt.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-scroll">
      <div className="chat-thread">
        {chat.map((m) => {
          const text = m.status === 'streaming' ? stream[m.id] ?? '' : m.content
          return (
            <article key={m.id} className={`msg ${m.role}`}>
              <div className="msg-head">
                <span className="msg-who">{m.role === 'owner' ? 'You' : 'Ada'}</span>
                {m.role === 'assistant' && m.model ? <span className="msg-model">{m.model}</span> : null}
                <span className="msg-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {text ? (
                <div className="msg-body">{text}</div>
              ) : m.status === 'streaming' ? (
                <div className="msg-body typing"><span /><span /><span /></div>
              ) : (
                <div className="msg-body error-text">{m.content || 'No reply. The engine returned nothing.'}</div>
              )}
              {m.status === 'error' ? <div className="msg-foot error-text">This turn failed. Retry, or switch model.</div> : null}
            </article>
          )
        })}
        <div ref={end} />
      </div>
    </div>
  )
}

function ChatComposer({
  sending,
  send,
  planner,
  onPick,
  onAddProvider,
  canCreate,
  creating,
  createPrompt
}: {
  sending: boolean
  send: (text: string) => void
  planner: ResolvedModel
  onPick: (pick: ResolvedModel) => void
  onAddProvider: () => void
  canCreate: boolean
  creating: boolean
  createPrompt: () => void
}) {
  const draft = useStore((s) => s.chatDraft)
  const setDraft = useStore((s) => s.setChatDraft)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 190)}px`
  }, [draft])

  return (
    <div className="chat-composer">
      <div className="chat-box">
        <textarea
          id="owner-input"
          ref={ref}
          value={draft}
          rows={1}
          placeholder="Describe the idea, or answer the question above…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              send(draft)
              return
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            }
          }}
          aria-label="Message the planner"
        />
        <div className="chat-box-foot">
          <ModelPicker value={planner} onPick={(o) => onPick(resolveModel(o, useStore.getState().snapshot!.providerConfigs))} onAddProvider={onAddProvider} compact />
          <span className="chat-hint"><span className="kbd">Enter</span> send · <span className="kbd">Shift</span>+<span className="kbd">Enter</span> newline</span>
          <div className="ml-auto flex gap-8">
            <button className="btn" onClick={createPrompt} disabled={!canCreate || creating} title="Turn the conversation into a structured development prompt">
              <IconSpark width={12} height={12} /> {creating ? 'Writing…' : 'Create prompt'}
            </button>
            <button className="btn primary" onClick={() => send(draft)} disabled={!draft.trim() || sending}>
              <IconSend width={12} height={12} /> {sending ? 'Thinking…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PromptPanel({
  prompts,
  active,
  onSelect,
  onAssign,
  onAddProvider,
  planner,
  disabled
}: {
  prompts: PromptDoc[]
  active: PromptDoc | null
  onSelect: (id: string | null) => void
  onAssign: () => void
  onAddProvider: () => void
  planner: ResolvedModel
  disabled: boolean
}) {
  const [body, setBody] = useState(active?.body ?? '')
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState<'enhance' | 'save' | null>(null)

  useEffect(() => {
    setBody(active?.body ?? '')
    setCompare(false)
  }, [active?.id, active?.body])

  const original = useMemo(() => {
    if (!active) return null
    if (!active.parentId) return active
    return prompts.find((p) => p.id === active.parentId) ?? null
  }, [active, prompts])

  if (!active) {
    return (
      <div className="prompt-panel empty">
        <div className="section-label">Development prompt</div>
        <p className="faint" style={{ fontSize: 12, lineHeight: 1.65 }}>
          Nothing generated yet. Talk through the idea, then press <strong>Create prompt</strong>. The prompt
          is built from this project's conversation and stays editable.
        </p>
      </div>
    )
  }

  const dirty = body !== active.body

  const enhance = async () => {
    const projectId = useStore.getState().snapshot!.activeProjectId!
    setBusy('enhance')
    const doc = await guard(
      () =>
        window.ventriee.promptEnhance({
          projectId,
          promptId: active.id,
          engine: planner.engine,
          model: planner.model,
          endpoint: planner.endpoint
        }),
      'Enhanced version ready to compare'
    )
    setBusy(null)
    if (doc) onSelect(doc.id)
  }

  const save = async () => {
    const projectId = useStore.getState().snapshot!.activeProjectId!
    setBusy('save')
    const doc = await guard(
      () => window.ventriee.promptSave({ projectId, promptId: active.id, body, source: 'edited' }),
      'Saved as a new revision'
    )
    setBusy(null)
    if (doc) onSelect(doc.id)
  }

  const restore = async () => {
    if (!original) return
    const projectId = useStore.getState().snapshot!.activeProjectId!
    const doc = await guard(
      () =>
        window.ventriee.promptSave({
          projectId,
          promptId: active.id,
          body: original.body,
          source: 'restored'
        }),
      'Original text restored as a new revision'
    )
    if (doc) onSelect(doc.id)
  }

  return (
    <div className="prompt-panel">
      <div className="prompt-head">
        <div>
          <div className="section-label" style={{ margin: 0 }}>Development prompt</div>
          <div className="prompt-title">{active.title || 'Untitled prompt'}</div>
        </div>
        <span className={`badge${active.source === 'enhanced' ? ' ok' : active.source === 'generated' ? ' accent' : ''}`}>
          v{active.version} {active.source}
        </span>
      </div>

      {prompts.length > 1 ? (
        <div className="prompt-versions" role="tablist" aria-label="Prompt versions">
          {prompts.map((p) => (
            <button
              key={p.id}
              className={`ver${p.id === active.id ? ' on' : ''}`}
              onClick={() => onSelect(p.id)}
              role="tab"
              aria-selected={p.id === active.id}
              title={`${p.source} · ${new Date(p.createdAt).toLocaleTimeString()}`}
            >
              v{p.version}
            </button>
          ))}
          {original && active.parentId ? (
            <button className={`ver compare${compare ? ' on' : ''}`} onClick={() => setCompare((v) => !v)}>
              {compare ? 'Editing' : 'Compare'}
            </button>
          ) : null}
        </div>
      ) : null}

      {compare && original ? (
        <div className="compare">
          <div className="compare-col">
            <div className="compare-label">Original · v{original.version}</div>
            <div className="compare-body">{original.body}</div>
          </div>
          <div className="compare-col">
            <div className="compare-label">Enhanced · v{active.version}</div>
            <div className="compare-body">{active.body}</div>
          </div>
        </div>
      ) : (
        <textarea
          className="prompt-editor"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          aria-label="Prompt editor"
        />
      )}

      <div className="prompt-actions">
        <button className="btn" onClick={enhance} disabled={busy !== null}>
          <IconSpark width={12} height={12} /> {busy === 'enhance' ? 'Enhancing…' : 'Enhance'}
        </button>
        <button className="btn" onClick={() => void navigator.clipboard.writeText(body)} title="Copy the prompt">
          <IconCopy width={12} height={12} /> Copy
        </button>
        {dirty ? (
          <button className="btn" onClick={save} disabled={busy !== null}>
            {busy === 'save' ? 'Saving…' : 'Save edit'}
          </button>
        ) : null}
        {original && active.parentId ? (
          <button className="btn" onClick={restore} title="Restore the parent revision as a new version">
            <IconRefresh width={12} height={12} /> Restore
          </button>
        ) : null}
        <button className="btn primary ml-auto" onClick={onAssign} disabled={!active.body.trim() || dirty}>
          <IconCheck width={12} height={12} /> Assign
        </button>
      </div>
      {dirty ? <p className="hint">Unsaved edit. Save it as a revision before assigning, or the approved text stays unchanged.</p> : null}
      {!dirty && active.body.trim() ? <p className="hint">Nothing is overwritten: every edit, enhancement and restore is a new version.</p> : null}
      <button className="ghost-link" style={{ marginTop: 6, alignSelf: 'flex-start' }} onClick={onAddProvider}>
        Change which model writes prompts
      </button>
    </div>
  )
}
