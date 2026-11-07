import { useMemo, useState } from 'react'
import { guard, useStore } from '../store'
import { Modal } from '../shell'
import { IconCheck, IconEdit, IconPin, IconPlus, IconTrash } from '../icons'
import type { MemoryDoc } from '../../../shared/types'

export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Partial<MemoryDoc> | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const docs = useMemo(() => {
    if (!query.trim()) return snapshot.memories
    const q = query.toLowerCase()
    return snapshot.memories.filter(
      (m) => m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q))
    )
  }, [snapshot.memories, query])

  const grouped = useMemo(() => {
    const map = new Map<string, MemoryDoc[]>()
    for (const doc of docs) {
      const key = doc.scope
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(doc)
    }
    return [...map.entries()]
  }, [docs])

  return (
    <Modal
      title="Memory"
      subtitle={`${snapshot.memories.length} documents · markdown on disk, indexed in SQLite`}
      onClose={onClose}
      actions={
        <button
          className="btn"
          onClick={() =>
            setEditing({ path: '', title: '', body: '', scope: 'project', projectId: snapshot.activeProjectId })
          }
        >
          <IconPlus /> New memory
        </button>
      }
    >
      <input
        className="input"
        placeholder="Search memory…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      {editing ? (
        <MemoryEditor
          doc={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {grouped.map(([scope, items]) => (
        <div key={scope}>
          <div className="section-label">
            <span>{scope}</span>
            <span>{items.length}</span>
          </div>
          {items.map((doc) => (
            <div key={doc.id} className="mem-row">
              <div className="mem-head">
                {doc.pinned ? <IconPin width={11} height={11} style={{ color: 'var(--accent)' }} /> : null}
                <span className="mem-title">{doc.title}</span>
                <span className="badge">{Math.round(doc.confidence * 100)}%</span>
                <span className="mem-path">{doc.path}</span>
              </div>
              <div className={`mem-body${open === doc.id ? ' open' : ''}`} onClick={() => setOpen(open === doc.id ? null : doc.id)}>
                {doc.body.slice(0, 1200)}
              </div>
              <div className="mem-actions">
                <button className="btn tiny" onClick={() => setEditing(doc)}><IconEdit width={10} height={10} /> Edit</button>
                <button className="btn tiny" onClick={() => void guard(() => window.ventriee.pinMemory(doc.id), doc.pinned ? 'Unpinned' : 'Pinned')}>
                  <IconPin width={10} height={10} /> {doc.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  className="btn tiny danger"
                  onClick={async () => {
                    if (!window.confirm(`Delete "${doc.title}"? The markdown file is removed too.`)) return
                    await guard(() => window.ventriee.deleteMemory(doc.id), 'Memory deleted')
                  }}
                >
                  <IconTrash width={10} height={10} />
                </button>
                <span className="faint" style={{ fontSize: 9.5, marginLeft: 'auto', alignSelf: 'center' }}>
                  {doc.source} · {new Date(doc.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
      {!docs.length ? <p className="faint" style={{ fontSize: 12 }}>Nothing matches.</p> : null}
    </Modal>
  )
}

function MemoryEditor({ doc, onClose }: { doc: Partial<MemoryDoc>; onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [title, setTitle] = useState(doc.title ?? '')
  const [path, setPath] = useState(doc.path ?? '')
  const [body, setBody] = useState(doc.body ?? '')
  const [scope, setScope] = useState<MemoryDoc['scope']>(doc.scope ?? 'project')

  const suggested = path || (doc.scope === 'global' ? 'global/notes.md' : `projects/${snapshot.activeProjectId}/notes.md`)

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 12, marginBottom: 14, background: 'var(--panel)' }}>
      <div className="row">
        <div className="field">
          <label className="field-label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label className="field-label">Scope</label>
          <select className="select" value={scope} onChange={(e) => setScope(e.target.value as MemoryDoc['scope'])}>
            {['global', 'project', 'agent', 'skill'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label">File path (relative to the memory root)</label>
        <input className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder={suggested} />
      </div>
      <div className="field">
        <label className="field-label">Content (markdown)</label>
        <textarea className="textarea mono" style={{ minHeight: 150 }} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex gap-8">
        <button
          className="btn primary"
          disabled={!title.trim() || !body.trim()}
          onClick={async () => {
            const saved = await guard(
              () =>
                window.ventriee.saveMemory({
                  id: doc.id,
                  path: path.trim() || suggested,
                  title: title.trim(),
                  body,
                  scope,
                  projectId: scope === 'project' ? snapshot.activeProjectId : doc.projectId ?? null
                }),
              'Memory saved'
            )
            if (saved) onClose()
          }}
        >
          <IconCheck /> Save
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
