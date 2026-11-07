import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, normalize, relative, resolve, sep } from 'node:path'
import { profileProject, type ArtifactProfile } from './artifact'
import { isInside } from './paths'
import type { PreviewState, Project } from '../shared/types'

const WATCH_SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__', 'venv', '.venv', '.cache'])
const PORT_PATTERNS = [
  /https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i,
  /listening (?:on|at) (?:port )?(\d{2,5})/i,
  /port (\d{2,5})/i
]

interface Running {
  child: ChildProcess | null
  command: string
  url: string | null
  server: Server | null
}

export class PreviewService {
  private running = new Map<string, Running>()
  private state = new Map<string, PreviewState>()
  private watchers = new Map<string, ReturnType<typeof setInterval>>()
  private profiles = new Map<string, ArtifactProfile>()
  private fingerprint = new Map<string, string>()
  private autoStarted = new Set<string>()
  private installing = new Set<string>()
  private onChange: () => void
  private isAutoApproved: (projectId: string) => boolean

  constructor(onChange: () => void, isAutoApproved: (projectId: string) => boolean = () => false) {
    this.onChange = onChange
    this.isAutoApproved = isAutoApproved
  }

  profile(projectId: string, root: string): ArtifactProfile {
    const cached = this.profiles.get(projectId)
    if (cached) return cached
    const fresh = profileProject(root)
    this.profiles.set(projectId, fresh)
    return fresh
  }

  get(projectId: string | null, root?: string): PreviewState {
    if (!projectId) return emptyState()
    const current = this.state.get(projectId)
    if (current) return current
    if (!root) return emptyState(projectId)
    const profile = this.profile(projectId, root)
    return {
      ...emptyState(projectId),
      kind: profile.kind,
      label: profile.label,
      detail: profile.notes,
      artifactPath: profile.entry,
      command: profile.runCommand ?? '',
      needsInstall: profile.needsInstall,
      installCommand: profile.installCommand
    }
  }

  /** Re-read the workspace and pick the right adapter. Cheap: only called on run events and selection. */
  rescan(project: Project) {
    this.profiles.delete(project.id)
    const profile = this.profile(project.id, project.path)
    const prev = this.state.get(project.id)
    const next: PreviewState = {
      ...emptyState(project.id),
      kind: profile.kind,
      label: profile.label,
      detail: profile.notes,
      artifactPath: profile.entry,
      command: profile.runCommand ?? '',
      needsInstall: profile.needsInstall,
      installCommand: profile.installCommand,
      revision: prev?.revision ?? 0,
      logs: prev?.logs ?? []
    }
    // static sites still need the local server, so they wait for an explicit start
    if (profile.kind === 'image' || profile.kind === 'document') {
      next.status = profile.entry ? 'ready' : 'off'
    } else if (profile.kind === 'unknown') {
      next.status = 'off'
    } else {
      next.status = this.running.has(project.id) ? prev?.status ?? 'starting' : 'manual'
      if (this.running.has(project.id) && prev) {
        next.url = prev.url
        next.status = prev.status
        next.startedAt = prev.startedAt
      }
    }
    if (this.running.has(project.id)) next.logs = prev?.logs ?? []
    this.state.set(project.id, next)
    this.watch(project)
    // Start the earliest useful preview without waiting for a finished project.
    // Scripts and one-shot runs stay manual: opening a project must not execute code.
    const autoKind = profile.kind === 'web' || profile.kind === 'node' || profile.kind === 'static'
    // Running the project's own dev script executes its code, so it needs the
    // owner's explicit approval once per project; that is recorded in kv on the
    // first manual Start. Until then the preview waits for the click.
    if (autoKind && !profile.needsInstall && !this.running.has(project.id) && !this.autoStarted.has(project.id) && this.isAutoApproved(project.id)) {
      this.autoStarted.add(project.id)
      void this.start(project).catch(() => this.autoStarted.delete(project.id))
    }
    this.onChange()
  }

  private watch(project: Project) {
    if (this.watchers.has(project.id)) return
    const timer = setInterval(() => {
      const next = fingerprintTree(project.path)
      const prev = this.fingerprint.get(project.id)
      if (prev && prev !== next && this.state.has(project.id)) {
        const state = this.state.get(project.id)!
        if (state.kind === 'unknown') {
          // Something appeared: re-classify, then start the earliest useful preview.
          this.profiles.delete(project.id)
          const profile = this.profile(project.id, project.path)
          this.state.set(project.id, {
            ...state,
            kind: profile.kind,
            label: profile.label,
            detail: profile.notes,
            artifactPath: profile.entry,
            command: profile.runCommand ?? '',
            status: profile.kind === 'unknown' ? 'off' : profile.entry ? 'ready' : 'manual',
            revision: state.revision + 1
          })
          if (profile.kind === 'web' && profile.runCommand && !this.running.has(project.id)) {
            void this.start(project)
            return
          }
        } else {
          this.state.set(project.id, { ...state, revision: state.revision + 1 })
        }
        this.onChange()
      }
      this.fingerprint.set(project.id, next)
    }, 2000)
    timer.unref?.()
    this.watchers.set(project.id, timer)
    this.fingerprint.set(project.id, fingerprintTree(project.path))
  }

  unwatch(projectId: string) {
    const timer = this.watchers.get(projectId)
    if (timer) clearInterval(timer)
    this.watchers.delete(projectId)
    this.stop(projectId)
  }

  stop(projectId: string) {
    const running = this.running.get(projectId)
    if (running) {
      if (running.server) running.server.close()
      if (running.child?.pid) {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(running.child.pid), '/T', '/F'], { windowsHide: true })
        } else {
          running.child.kill('SIGKILL')
        }
      }
      this.running.delete(projectId)
    }
    const state = this.state.get(projectId)
    if (state) this.state.set(projectId, { ...state, status: 'manual', url: null, startedAt: null })
    this.onChange()
  }

  /** Start the artifact: dev server for web/node, one-shot run for scripts, viewer for files. */
  async start(project: Project): Promise<PreviewState> {
    const profile = this.profile(project.id, project.path)
    const base = this.get(project.id, project.path)
    if (profile.kind === 'image' || profile.kind === 'document') {
      const next: PreviewState = {
        ...base,
        status: profile.entry ? 'ready' : 'off',
        artifactPath: profile.entry,
        detail: profile.notes,
        revision: base.revision + 1
      }
      this.state.set(project.id, next)
      this.onChange()
      return next
    }
    if (profile.kind === 'static') {
      if (this.running.has(project.id)) return this.get(project.id, project.path)
      const port = await freePort()
      const server = createServer((req, res) => {
        let relativePath: string
        try {
          relativePath = decodeURIComponent((req.url ?? '/').split('?')[0])
        } catch {
          res.writeHead(400, { 'content-type': 'text/plain' })
          res.end('Bad request')
          return
        }
        const target = resolve(project.path, `.${normalize(relativePath === '/' ? '/index.html' : relativePath)}`)
        if (!isInside(project.path, target) || !existsSync(target)) {
          res.writeHead(404, { 'content-type': 'text/plain' })
          res.end('Not found')
          return
        }
        res.writeHead(200, { 'content-type': mimeFor(target), 'cache-control': 'no-store' })
        createReadStream(target).pipe(res)
      })
      await new Promise<void>((done) => server.listen(port, '127.0.0.1', done))
      this.running.set(project.id, { child: null, command: 'static server', url: `http://127.0.0.1:${port}`, server })
      const next: PreviewState = {
        ...base,
        status: 'ready',
        kind: 'static',
        label: profile.label,
        url: `http://127.0.0.1:${port}`,
        command: 'static file server',
        artifactPath: profile.entry,
        detail: 'Served straight from the project folder. Refresh to pick up changes.',
        logs: [`Serving ${project.path} on http://127.0.0.1:${port}`],
        startedAt: Date.now(),
        revision: base.revision + 1
      }
      this.state.set(project.id, next)
      this.onChange()
      return next
    }
    if (!profile.runCommand) {
      const next: PreviewState = { ...base, status: 'off', detail: profile.notes }
      this.state.set(project.id, next)
      this.onChange()
      return next
    }
    if (this.running.has(project.id)) return this.get(project.id, project.path)

    // Declared packages but no node_modules: install before the first run, or the
    // dev server fails with "command not recognized". The command is in the state.
    if (profile.needsInstall) {
      const installed = await this.install(project)
      if (installed.status === 'error') return installed
      return this.start(project)
    }

    if (profile.kind === 'python' && !profile.devCommand) {
      return this.runOnce(project, profile)
    }

    const next: PreviewState = {
      ...base,
      status: 'starting',
      command: profile.runCommand,
      url: null,
      logs: [`$ ${profile.runCommand}`],
      startedAt: Date.now(),
      revision: base.revision + 1
    }
    this.state.set(project.id, next)
    this.onChange()

    const child = shellRun(profile.runCommand, project.path, {
      ...process.env,
      BROWSER: 'none',
      CI: '0',
      FORCE_COLOR: '0'
    })
    const entry: Running = { child, command: profile.runCommand, url: null, server: null }
    this.running.set(project.id, entry)

    const push = (chunk: Buffer) => {
      const current = this.state.get(project.id)
      if (!current) return
      const lines = String(chunk).split(/\r?\n/).filter(Boolean)
      const logs = [...current.logs, ...lines].slice(-300)
      let url = current.url
      let status = current.status
      if (!url) {
        for (const line of lines) {
          for (const pattern of PORT_PATTERNS) {
            const match = pattern.exec(line)
            if (match) {
              const fromLine = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}/i.exec(line)?.[0]
              url = fromLine ?? `http://localhost:${match[1]}`
              status = 'ready'
              entry.url = url
              break
            }
          }
          if (url) break
        }
      }
      if (/error|failed|cannot|EADDRINUSE/i.test(lines.join(' ')) && status === 'starting') {
        status = 'error'
      }
      this.state.set(project.id, { ...current, logs, url, status, detail: status === 'ready' ? `${profile.label} dev server` : current.detail })
      this.onChange()
    }
    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    child.on('error', (error) => {
      const current = this.state.get(project.id)
      if (!current) return
      this.state.set(project.id, { ...current, status: 'error', detail: error.message, logs: [...current.logs, error.message].slice(-300) })
      this.running.delete(project.id)
      this.onChange()
    })
    child.on('close', (code) => {
      this.running.delete(project.id)
      const current = this.state.get(project.id)
      if (!current) return
      const crashed = current.status === 'starting' || (code !== 0 && code !== null)
      this.state.set(project.id, {
        ...current,
        status: crashed ? 'error' : 'manual',
        url: crashed ? null : current.url,
        detail: crashed ? `Preview stopped (exit ${code ?? 'killed'}). Check the log.` : 'Preview stopped.',
        logs: [...current.logs, `[process exited with code ${code ?? 'null'}]`].slice(-300)
      })
      this.onChange()
    })
    return next
  }

  /**
   * Install declared dependencies. Exposed on its own as well as called from
   * start(), because installing is a trust boundary: the owner sees the exact
   * command before it runs.
   */
  async install(project: Project): Promise<PreviewState> {
    const profile = this.profile(project.id, project.path)
    const base = this.get(project.id, project.path)
    if (!profile.installCommand) {
      const next: PreviewState = { ...base, needsInstall: false, detail: 'Nothing declared to install.' }
      this.state.set(project.id, next)
      this.onChange()
      return next
    }
    if (this.running.has(project.id) || this.installing.has(project.id)) return this.get(project.id, project.path)
    this.installing.add(project.id)
    const command = profile.installCommand
    const starting: PreviewState = {
      ...base,
      status: 'starting',
      command,
      needsInstall: true,
      detail: `Installing declared packages with ${command}.`,
      logs: [`$ ${command}`],
      startedAt: Date.now(),
      revision: base.revision + 1
    }
    this.state.set(project.id, starting)
    this.onChange()

    const child = shellRun(command, project.path, {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
      npm_config_yes: 'true'
    })
    child.stdout?.on('data', (chunk: Buffer) => this.pushLog(project.id, chunk))
    child.stderr?.on('data', (chunk: Buffer) => this.pushLog(project.id, chunk))

    const code = await new Promise<number | null>((done) => {
      child.on('error', (error) => {
        this.pushLog(project.id, Buffer.from(error.message))
        done(null)
      })
      child.on('close', done)
    })

    // A fresh install changes what is on disk, so the classification is stale.
    this.profiles.delete(project.id)
    const current = this.state.get(project.id) ?? base
    const ok = code === 0 && existsSync(join(project.path, 'node_modules'))
    const next: PreviewState = {
      ...current,
      status: ok ? 'manual' : 'error',
      needsInstall: !ok && this.profile(project.id, project.path).needsInstall,
      installCommand: this.profile(project.id, project.path).installCommand,
      detail: ok ? 'Packages installed. Start the preview.' : `Install failed (exit ${code ?? 'killed'}). Read the log.`,
      logs: [...current.logs, `[install exited with code ${code ?? 'null'}]`].slice(-300)
    }
    this.state.set(project.id, next)
    this.onChange()
    return next
  }

  /** Append streamed output to the state without re-deriving anything else. */
  private pushLog(projectId: string, chunk: Buffer) {
    const current = this.state.get(projectId)
    if (!current) return
    this.state.set(projectId, {
      ...current,
      logs: [...current.logs, ...String(chunk).split(/\r?\n/).filter(Boolean)].slice(-300)
    })
    this.onChange()
  }

  /** Scripts and utilities: run once, stream real output. */
  private async runOnce(project: Project, profile: ArtifactProfile): Promise<PreviewState> {
    const base = this.get(project.id, project.path)
    const command = profile.runCommand!
    const next: PreviewState = {
      ...base,
      status: 'starting',
      command,
      logs: [`$ ${command}`],
      startedAt: Date.now(),
      revision: base.revision + 1
    }
    this.state.set(project.id, next)
    this.onChange()
    const child = shellRun(command, project.path, {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      FORCE_COLOR: '0'
    })
    const running: Running = { child, command, url: null, server: null }
    this.running.set(project.id, running)
    const push = (chunk: Buffer) => {
      const current = this.state.get(project.id)
      if (!current) return
      this.state.set(project.id, {
        ...current,
        logs: [...current.logs, ...String(chunk).split(/\r?\n/).filter(Boolean)].slice(-300)
      })
      this.onChange()
    }
    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    child.on('close', (code) => {
      this.running.delete(project.id)
      const current = this.state.get(project.id)
      if (!current) return
      this.state.set(project.id, {
        ...current,
        status: code === 0 ? 'ready' : 'error',
        detail: code === 0 ? 'Run finished with exit code 0.' : `Run failed with exit code ${code}. Read the log above.`,
        logs: [...current.logs, `[exit code ${code}]`].slice(-300)
      })
      this.onChange()
    })
    return next
  }

  /** File bytes for the artifact viewer, restricted to the project root. */
  readArtifact(project: Project, relativePath: string): { ok: boolean; data?: string; mime?: string; error?: string } {
    const target = resolve(project.path, relativePath)
    if (!isInside(project.path, target)) {
      return { ok: false, error: 'Path is outside the project' }
    }
    if (!existsSync(target)) return { ok: false, error: 'Artifact no longer exists' }
    const ext = extname(target).toLowerCase()
    const mime =
      ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : ext === '.gif' ? 'image/gif'
            : ext === '.webp' ? 'image/webp'
              : ext === '.svg' ? 'image/svg+xml'
                : ext === '.pdf' ? 'application/pdf'
                  : ext === '.html' || ext === '.htm' ? 'text/html'
                    : 'text/plain'
    try {
      const buffer = readFileSync(target)
      if (buffer.length > 8 * 1024 * 1024) return { ok: false, error: 'Artifact is larger than 8 MB' }
      return { ok: true, data: buffer.toString('base64'), mime }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  stateForProject(project: Project): PreviewState {
    return this.get(project.id, project.path)
  }
}

export function emptyState(projectId: string | null = null): PreviewState {  return {
    projectId,
    kind: 'unknown',
    label: 'No artifact yet',
    status: 'off',
    url: null,
    command: '',
    detail: 'The preview fills in as soon as this project contains something runnable or viewable.',
    artifactPath: null,
    artifactUrl: null,
    needsInstall: false,
    installCommand: null,
    logs: [],
    revision: 0,
    startedAt: null
  }
}

function mimeFor(file: string): string {
  const ext = extname(file).toLowerCase()
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8'
  }
  return map[ext] ?? 'application/octet-stream'
}

/** Run a shell command line verbatim. On Windows /s /c with an outer quote pair keeps inner quotes intact. */
function shellRun(command: string, cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', `"${command}"`], { cwd, env, windowsHide: true, windowsVerbatimArguments: true })
  }
  return spawn('sh', ['-c', command], { cwd, env })
}
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

/** Cheap tree fingerprint: paths plus mtimes, ignoring dependency folders. */
function fingerprintTree(root: string, depth = 0, acc: string[] = []): string {  if (depth > 4 || acc.length > 600) return acc.join('|')
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return acc.join('|')
  }
  for (const entry of entries) {
    if (WATCH_SKIP.has(entry)) continue
    const full = join(root, entry)
    try {
      const st = statSync(full)
      if (st.isDirectory()) fingerprintTree(full, depth + 1, acc)
      else acc.push(`${relative(root, full)}:${st.mtimeMs}`)
    } catch {
      /* entry vanished mid-walk */
    }
  }
  return acc.join('|')
}
