import { useEffect, useMemo, useState } from 'react'
import { guard, useStore } from '../store'
import { IconExternal, IconPlay, IconRefresh, IconStop, IconTerminal } from '../icons'
import type { ArtifactKind, PreviewState } from '../../../shared/types'

type Viewport = 'fit' | 'desktop' | 'tablet' | 'mobile'

const KIND_LABEL: Record<ArtifactKind, string> = {
  web: 'Web app',
  static: 'Static site',
  node: 'Node',
  python: 'Script',
  image: 'Image',
  document: 'Document',
  data: 'Data',
  unknown: 'Artifact'
}

export function Preview() {
  const snapshot = useStore((s) => s.snapshot)!
  const notify = useStore((s) => s.notify)
  const state = snapshot.preview
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [viewport, setViewport] = useState<Viewport>('fit')
  const [reload, setReload] = useState(0)
  const [showLogs, setShowLogs] = useState(false)
  const [showApi, setShowApi] = useState(false)
  const [artifact, setArtifact] = useState<{ url: string; mime: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const isServer = state.kind === 'web' || state.kind === 'static'
  const isService = state.kind === 'node'
  const live = state.status === 'ready' && Boolean(state.url)

  // Reload the frame whenever the main process reports a new file revision.
  useEffect(() => {
    if (live) setReload((n) => n + 1)
  }, [state.revision, live])

  useEffect(() => {
    setArtifact(null)
    if (!project || !state.artifactPath) return
    if (!['image', 'document', 'data'].includes(state.kind)) return
    let alive = true
    void window.ventriee
      .previewArtifact(project.id, state.artifactPath)
      .then((result) => {
        if (!alive || !result.ok || !result.data) return
        setArtifact({ url: `data:${result.mime ?? 'text/plain'};base64,${result.data}`, mime: result.mime ?? 'text/plain' })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [project?.id, state.artifactPath, state.kind, state.revision])

  const start = async () => {
    if (!project) return
    setBusy(true)
    await guard(() => window.ventriee.previewStart(project.id), 'Preview started')
    setBusy(false)
  }
  const stop = async () => {
    if (!project) return
    await guard(() => window.ventriee.previewStop(project.id))
  }
  const install = async () => {
    if (!project) return
    setBusy(true)
    await guard(() => window.ventriee.previewInstall(project.id), 'Packages installed')
    setBusy(false)
  }
  const refresh = async () => {
    if (!project) return
    setReload((n) => n + 1)
    await guard(() => window.ventriee.previewRefresh(project.id))
  }

  const width = useMemo(() => {
    if (viewport === 'desktop') return 1280
    if (viewport === 'tablet') return 834
    if (viewport === 'mobile') return 420
    return null
  }, [viewport])

  return (
    <section className="preview" aria-label="Live preview">
      <div className="preview-head">
        <span className={`preview-dot ${state.status}`} />
        <span className="preview-title">{state.label || KIND_LABEL[state.kind]}</span>
        {isServer && state.url ? (
          <button
            className="preview-url mono truncate"
            title={state.url}
            onClick={() => void guard(() => window.ventriee.openExternal(state.url!))}
          >
            {state.url.replace(/^https?:\/\//, '')}
          </button>
        ) : (
          <span className="preview-kind">{KIND_LABEL[state.kind]}</span>
        )}
        <div className="preview-tools">
          {isServer && live ? (
            <>
              <select
                className="preview-select"
                value={viewport}
                onChange={(e) => setViewport(e.target.value as Viewport)}
                aria-label="Preview viewport"
              >
                <option value="fit">Fit</option>
                <option value="desktop">1280</option>
                <option value="tablet">834</option>
                <option value="mobile">420</option>
              </select>
              <button className="icon-btn sm" onClick={refresh} title="Reload preview" aria-label="Reload preview">
                <IconRefresh />
              </button>
              <button
                className="icon-btn sm"
                onClick={() => void guard(() => window.ventriee.openExternal(state.url!))}
                title="Open in browser"
                aria-label="Open in browser"
              >
                <IconExternal />
              </button>
              <button className="icon-btn sm" onClick={stop} title="Stop preview" aria-label="Stop preview">
                <IconStop />
              </button>
            </>
          ) : null}
          {!live && state.status !== 'starting' ? (
            <button className="btn tiny primary" onClick={start} disabled={!project || busy}>
              <IconPlay width={11} height={11} /> {state.kind === 'python' ? 'Run' : 'Start'}
            </button>
          ) : null}
          {state.status === 'starting' ? <span className="preview-wait">starting…</span> : null}
          {state.logs.length ? (
            <button
              className={`icon-btn sm${showLogs ? ' active' : ''}`}
              onClick={() => setShowLogs((v) => !v)}
              title="Preview log"
              aria-label="Preview log"
            >
              <IconTerminal />
            </button>
          ) : null}
          {isService && state.url ? (
            <button
              className={`icon-btn sm${showApi ? ' active' : ''}`}
              onClick={() => setShowApi((v) => !v)}
              title="API explorer"
              aria-label="API explorer"
            >
              <IconPlay width={11} height={11} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="preview-body">
        {!project ? (
          <PreviewNotice title="No project open" body="Create or select a project. The preview attaches to whatever that workspace actually contains." />
        ) : state.kind === 'unknown' ? (
          <PreviewNotice title="Nothing to preview yet" body={state.detail || 'Workers are still producing the first artifact.'} />
        ) : state.needsInstall && state.status !== 'starting' && state.status !== 'error' ? (
          <div className="preview-stage">
            <PreviewNotice
              title="Dependencies are not installed"
              body={`This project declares packages but has no node_modules. Preview will run: ${state.installCommand ?? 'npm install'}`}
              action={
                <button className="btn primary" onClick={install} disabled={busy}>
                  <IconTerminal width={11} height={11} /> {state.installCommand ?? 'npm install'}
                </button>
              }
            />
          </div>
        ) : state.kind === 'image' ? (
          artifact ? (
            <img className="preview-image" src={artifact.url} alt={state.artifactPath ?? 'Artifact'} />
          ) : (
            <PreviewNotice title="Waiting for the image" body={state.artifactPath ?? 'No image file found yet.'} />
          )
        ) : state.kind === 'document' ? (
          artifact ? (
            artifact.mime === 'application/pdf' || artifact.mime === 'text/html' ? (
              <iframe className="preview-frame" src={artifact.url} title="Document preview" />
            ) : (
              <pre className="preview-doc">{decodeDataUrl(artifact.url)}</pre>
            )
          ) : (
            <PreviewNotice title="Waiting for the document" body={state.artifactPath ?? 'No document found yet.'} />
          )
        ) : live ? (
          <div className="preview-stage">
            <iframe
              key={`${state.url}-${reload}`}
              className="preview-frame"
              src={state.url!}
              title="Live application preview"
              style={width ? { width, maxWidth: '100%' } : undefined}
            />
          </div>
        ) : state.status === 'starting' ? (
          <div className="preview-stage">
            <div className="preview-starting">
              <span className="spinner" />
              <div>
                <div className="preview-notice-title">Starting {state.label}</div>
                <div className="preview-notice-body mono">{state.command}</div>
              </div>
            </div>
          </div>
        ) : state.status === 'error' ? (
          <div className="preview-stage">
            <div className="preview-notice error">
              <div className="preview-notice-title">Preview failed</div>
              <div className="preview-notice-body">{state.detail}</div>
              <pre className="preview-log">{state.logs.slice(-20).join('\n') || 'No log output.'}</pre>
              <button className="btn" onClick={start}>Try again</button>
            </div>
          </div>
        ) : (
          <div className="preview-stage">
            <PreviewNotice
              title={state.status === 'manual' ? 'Preview is stopped' : 'Ready to run'}
              body={state.detail || 'Start the preview to see the real artifact.'}
              action={
                <button className="btn" onClick={start} disabled={busy}>
                  <IconPlay width={11} height={11} /> Start preview
                </button>
              }
            />
          </div>
        )}

        {showLogs ? (
          <div className="preview-logs">
            <div className="preview-logs-head">
              <span>Preview log</span>
              <button className="ghost-link" onClick={() => setShowLogs(false)}>hide</button>
            </div>
            <pre className="preview-log">{state.logs.slice(-120).join('\n') || 'No output yet.'}</pre>
          </div>
        ) : null}

        {showApi && isService && state.url ? (
          <ApiExplorer baseUrl={state.url} onClose={() => setShowApi(false)} />
        ) : null}
      </div>

      {state.status === 'manual' && state.kind !== 'unknown' && !showLogs ? (
        <div className="preview-foot">
          <span className="truncate">{state.detail}</span>
          <button className="ghost-link" onClick={() => notify('Preview monitors the project folder and reloads on real file changes.')}>
            how it updates
          </button>
        </div>
      ) : null}
    </section>
  )
}

function PreviewNotice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="preview-notice">
      <div className="preview-notice-title">{title}</div>
      <div className="preview-notice-body">{body}</div>
      {action}
    </div>
  )
}

function ApiExplorer({ baseUrl, onClose }: { baseUrl: string; onClose: () => void }) {
  const [method, setMethod] = useState('GET')
  const [path, setPath] = useState('/')
  const [body, setBody] = useState('')
  const [result, setResult] = useState<{
    ok: boolean
    status?: number
    statusText?: string
    contentType?: string
    body?: string
    error?: string
  } | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    const res = await guard(() =>
      window.ventriee.previewApiRequest({ baseUrl, method, path: path || '/', body: method === 'GET' ? undefined : body || undefined })
    )
    setBusy(false)
    if (res) setResult(res)
  }

  const validJson = !body.trim() || (() => { try { JSON.parse(body); return true } catch { return false } })()

  return (
    <div className="api-explorer">
      <div className="preview-logs-head">
        <span>API explorer · {baseUrl.replace(/^https?:\/\//, '')}</span>
        <button className="ghost-link" onClick={onClose}>hide</button>
      </div>
      <div className="api-row">
        <select className="preview-select" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          className="input api-path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/api/users"
          aria-label="Request path"
          onKeyDown={(e) => { if (e.key === 'Enter' && validJson) void send() }}
        />
        <button className="btn tiny primary" onClick={send} disabled={busy || !validJson}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {method !== 'GET' ? (
        <textarea
          className="textarea mono api-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder='{"name": "value"}'
          aria-label="Request body"
          spellCheck={false}
        />
      ) : null}
      {!validJson ? <div className="err-text faint" style={{ fontSize: 11 }}>Request body is not valid JSON.</div> : null}
      {result ? (
        <div className="api-result">
          <div className="api-result-head">
            <span className={`badge ${result.ok ? (result.status! >= 400 ? 'warn' : 'ok') : 'err'}`}>
              {result.ok ? `${result.status} ${result.statusText}` : 'error'}
            </span>
            <span className="faint mono" style={{ fontSize: 10.5 }}>{result.contentType ?? ''}</span>
          </div>
          <pre className="preview-log">{result.error ?? (result.body ?? '(empty response)')}</pre>
        </div>
      ) : null}
    </div>
  )
}

function decodeDataUrl(url: string) {
  const base64 = url.slice(url.indexOf(',') + 1)
  try {
    return decodeURIComponent(escape(atob(base64)))
  } catch {
    return atob(base64)
  }
}

export type { PreviewState }
