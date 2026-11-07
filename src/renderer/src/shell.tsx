import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from './store'
import { IconChevron, IconClose, IconFolder, IconPlus, IconSettings, IconWindow } from './icons'
import { guard } from './store'
import type { Project } from '../../shared/types'

export function AppShell() {
  return null
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  narrow,
  tabs,
  actions
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  narrow?: boolean
  tabs?: ReactNode
  actions?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${narrow ? ' narrow' : ''}`}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <div className="flex gap-4" style={{ marginLeft: 'auto' }}>
            {actions}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <IconClose />
            </button>
          </div>
        </div>
        {tabs}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      className={`switch${on ? ' on' : ''}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
    />
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismissToast)
  if (!toast) return null
  return (
    <div className={`toast${toast.kind === 'error' ? ' error' : ''}`} role="status" onClick={dismiss}>
      <span>{toast.text}</span>
    </div>
  )
}

export function ProjectSwitcher({ onOpen }: { onOpen: () => void }) {
  const snapshot = useStore((s) => s.snapshot)
  const [open, setOpen] = useState(false)
  const project = snapshot?.projects.find((p) => p.id === snapshot.activeProjectId) ?? null

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="project-btn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="project-dot" style={{ background: project ? 'var(--ok)' : 'var(--faint)' }} />
        <span className="project-name">{project?.name ?? 'No project selected'}</span>
        <IconChevron className="project-caret" width={12} height={12} />
      </button>
      {open ? (
        <div className="popover" role="menu" onClick={(e) => e.stopPropagation()}>
          {snapshot?.projects.length ? (
            snapshot.projects.map((p) => (
              <div key={p.id} className="popover-item-row">
                <button
                  className="popover-item"
                  onClick={() => {
                    setOpen(false)
                    void guard(() => window.ventriee.selectProject(p.id))
                  }}
                >
                  <IconFolder width={13} height={13} style={{ color: 'var(--muted)' }} />
                  <span className="grow truncate">{p.name}</span>
                  {p.id === snapshot.activeProjectId ? <span className="badge accent">active</span> : null}
                </button>
                <button
                  className="popover-row-action"
                  title="Open this project in its own window"
                  aria-label={`Open ${p.name} in a new window`}
                  onClick={() => {
                    setOpen(false)
                    void guard(() => window.ventriee.openProjectWindow(p.id), `${p.name} opened in a new window`)
                  }}
                >
                  <IconWindow width={13} height={13} />
                </button>
              </div>
            ))
          ) : (
            <div className="popover-item faint" style={{ cursor: 'default' }}>No projects yet</div>
          )}
          <div className="popover-sep" />
          <button
            className="popover-item"
            onClick={() => {
              setOpen(false)
              onOpen()
            }}
          >
            <IconPlus width={13} height={13} style={{ color: 'var(--accent)' }} />
            New project
          </button>
          <button
            className="popover-item"
            onClick={() => {
              setOpen(false)
              useStore.getState().setPanel('project')
            }}
          >
            <IconSettings width={13} height={13} style={{ color: 'var(--muted)' }} />
            Project settings
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim() || !path.trim() || busy) return
    setBusy(true)
    const project = await guard(
      () => window.ventriee.createProject({ name, path, description }),
      'Project created'
    )
    setBusy(false)
    if (project) onClose()
  }

  return (
    <Modal
      title="New project"
      subtitle="A workspace folder and a squad are created for you."
      onClose={onClose}
      narrow
      actions={
        <button className="btn primary" onClick={submit} disabled={!name.trim() || !path.trim() || busy}>
          {busy ? 'Creating…' : 'Create project'}
        </button>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="proj-name">Project name</label>
        <input id="proj-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client site refresh" autoFocus />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="proj-path">Workspace folder</label>
        <div className="row">
          <input id="proj-path" className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder={'D:\\Work\\client-site'} />
          <button
            className="btn"
            style={{ flex: 'none' }}
            onClick={async () => {
              const picked = await guard(() => window.ventriee.pickFolder())
              if (picked) {
                setPath(picked)
                if (!name.trim()) setName(picked.split(/[\\/]/).filter(Boolean).pop() ?? '')
              }
            }}
          >
            Browse
          </button>
        </div>
        <div className="hint">Agents are restricted to this folder. It is created if missing.</div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="proj-desc">Brief (optional)</label>
        <textarea
          id="proj-desc"
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this project is, who it is for, and what counts as done."
        />
      </div>
      <div className="hint">
        Creating a project seeds the 14 default workers and the memory files for this project.
      </div>
    </Modal>
  )
}

export function useProject(): Project | null {
  const snapshot = useStore((s) => s.snapshot)
  return useMemo(
    () => snapshot?.projects.find((p) => p.id === snapshot.activeProjectId) ?? null,
    [snapshot]
  )
}
