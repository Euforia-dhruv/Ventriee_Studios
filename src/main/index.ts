import { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { Store, newId } from './store'
import { Credentials } from './credentials'
import { MemoryService } from './memory'
import { SkillService } from './skills'
import { PreviewService } from './preview'
import { Orchestrator } from './orchestrator'
import { PlanningService } from './planning'
import { isInside } from './paths'
import { detectProviders, testEngine, defaultEndpoint, runEngine } from './engines'
import { IPC } from '../shared/ipc'
import type {
  Agent,
  AppSettings,
  AssignPromptInput,
  ChatMessage,
  CreateAgentInput,
  EngineKind,
  MemoryDoc,
  ModelOption,
  ModelPrefs,
  Project,
  PromptDoc,
  ProviderConfig,
  ProviderStatus,
  SessionRecord,
  SkillRecord
} from '../shared/types'

const bus = new EventEmitter()
/** One entry per open window. The project id lives here, not in global kv. */
const windows = new Map<number, { win: BrowserWindow; projectId: string | null }>()
let tray: Tray | null = null
let quitting = false
let store: Store
let creds: Credentials
let memory: MemoryService
let skills: SkillService
let preview: PreviewService
let orchestrator: Orchestrator
let planning: PlanningService
let scheduler: NodeJS.Timeout | null = null
let lastProviders: ProviderStatus[] = []
/** Discovered model options. Refreshed on demand, never hardcoded. */
let lastModels: ModelOption[] = []
const isDev = !app.isPackaged

// Isolated profile for automated runs, so tests never touch the owner's data.
if (process.env.VENTRIEE_USERDATA) app.setPath('userData', process.env.VENTRIEE_USERDATA)

function windowProject(win: BrowserWindow): string | null {
  const entry = windows.get(win.webContents.id)
  if (!entry) return null
  if (entry.projectId && store.project(entry.projectId)) return entry.projectId
  // Unassigned windows (first run, no projects yet) take the last used project once one exists.
  // After the window is assigned it never follows another window's selection.
  return store.projects()[0]?.id ?? null
}

/** The project the sender's window is showing, for handlers that need a cwd. */
function projectOf(event: Electron.IpcMainInvokeEvent): string | null {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? windowProject(win) : store.activeProjectId()
}

function snapshotFor(projectId: string | null) {
  const project = projectId ? store.project(projectId) : null
  const previewState = preview.get(project?.id ?? null, project?.path)
  return store.snapshot(lastProviders, previewState, lastModels, project?.id ?? null)
}

function sendSnapshot() {
  for (const { win, projectId } of windows.values()) {
    if (win.isDestroyed()) continue
    win.webContents.send(IPC.patch, snapshotFor(windowProject(win) ?? projectId))
  }
  refreshTray()
}

/** Stream output only to windows showing that project. */
function sendToProject(projectId: string | null, channel: string, payload: unknown) {
  for (const { win } of windows.values()) {
    if (win.isDestroyed()) continue
    if (projectId && windowProject(win) !== projectId) continue
    win.webContents.send(channel, payload)
  }
}

function debouncedNotify() {
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    sendSnapshot()
  }, 120)
}
let notifyTimer: ReturnType<typeof setTimeout> | null = null

async function refreshProviders() {
  lastProviders = await detectProviders(creds)
  return lastProviders
}

/** Ask the real providers what they serve. A slow probe must not block the UI. */
async function refreshModels(projectId: string | null) {
  const project = projectId ? store.project(projectId) : null
  const cwd = project?.path ?? store.projects()[0]?.path ?? app.getPath('userData')
  lastModels = await planning.discoverModels(cwd)
  debouncedNotify()
  return lastModels
}

// Packaged builds carry the icon in the exe; dev needs the PNG on disk.
const windowIcon = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png')

/** Tray menu: one entry per open window and one per project, so six windows stay reachable. */
function refreshTray() {
  if (!tray || tray.isDestroyed()) return
  const open = [...windows.values()].filter((w) => !w.win.isDestroyed())
  const running = store ? store.projects().filter((p) => store.runningJob(p.id)).length : 0
  tray.setToolTip(
    `Ventriee Studios — ${open.length} window${open.length === 1 ? '' : 's'}${running ? `, ${running} running` : ''}`
  )
  const menu = Menu.buildFromTemplate([
    { label: 'Ventriee Studios', enabled: false },
    { type: 'separator' },
    ...open.map(({ win }, index) => ({
      label: `${store.project(windowProject(win) ?? '')?.name ?? 'No project'}${index === 0 ? '  (1)' : ''}`,
      click: () => {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
    })),
    { type: 'separator' },
    {
      label: 'Open project in a new window',
      submenu: store.projects().map((p) => ({
        label: p.name,
        click: () => createWindow(p.id)
      }))
    },
    { label: 'New window', click: () => createWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
}

function createTray() {
  if (tray) return
  const image = nativeImage.createFromPath(windowIcon)
  tray = new Tray(image.isEmpty() ? windowIcon : image.resize({ width: 16, height: 16 }))
  tray.on('double-click', () => {
    const first = [...windows.values()][0]?.win
    if (first) { if (first.isMinimized()) first.restore(); first.show(); first.focus() } else createWindow()
  })
  refreshTray()
}

/** Each window owns its project, so several can run side by side. */
function createWindow(projectId?: string) {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#14161a',
    icon: windowIcon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const initial = projectId ?? store.activeProjectId() ?? store.projects()[0]?.id ?? null
  windows.set(win.webContents.id, { win, projectId: initial })
  win.on('closed', () => {
    windows.delete(win.webContents.id)
    refreshTray()
  })

  win.once('ready-to-show', () => win.show())

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  return win
}

function registerIpc() {
  ipcMain.handle(IPC.snapshot, async (event) => {
    await refreshProviders()
    const win = BrowserWindow.fromWebContents(event.sender)
    const projectId = win ? windowProject(win) : store.activeProjectId()
    const project = projectId ? store.project(projectId) : null
    return store.snapshot(lastProviders, preview.get(project?.id ?? null, project?.path), lastModels, project?.id ?? null)
  })

  ipcMain.handle(IPC.testEngine, async (_e, engine: EngineKind, model: string, endpoint: string) => {
    const result = await testEngine(engine, model, endpoint, creds)
    await refreshProviders()
    debouncedNotify()
    return result
  })

  ipcMain.handle(IPC.createProject, async (event, input: { name: string; path: string; description: string }) => {
    const path = input.path.trim()
    if (!path) throw new Error('A project workspace path is required')
    if (!existsSync(path)) mkdirSync(path, { recursive: true })
    const project = store.createProject({ name: input.name.trim() || 'Untitled project', path, description: input.description ?? '' })
    store.setActiveProject(project.id)
    // The window that created it switches to it; other windows keep theirs.
    const entry = windows.get(event.sender.id)
    if (entry) entry.projectId = project.id
    memory.bootstrap(project)
    orchestrator.ensureRoster(project, creds)
    preview.rescan(project)
    await refreshProviders()
    debouncedNotify()
    return project
  })

  ipcMain.handle(IPC.pickFolder, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent ?? undefined!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(IPC.selectProject, async (event, id: string) => {
    store.setActiveProject(id)
    // The window that asked switches project; other windows keep theirs.
    const win = BrowserWindow.fromWebContents(event.sender)
    const entry = win ? windows.get(win.webContents.id) : null
    if (entry) entry.projectId = id
    const project = store.project(id)
    if (project) {
      memory.bootstrap(project)
      orchestrator.ensureRoster(project, creds)
      preview.rescan(project)
    }
    debouncedNotify()
  })

  ipcMain.handle(IPC.openProjectWindow, async (_e, projectId: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    memory.bootstrap(project)
    orchestrator.ensureRoster(project, creds)
    preview.rescan(project)
    createWindow(projectId)
    debouncedNotify()
  })

  ipcMain.handle(IPC.updateProject, async (_e, id: string, patch: Partial<Project>) => {
    store.updateProject(id, patch)
    debouncedNotify()
  })

  ipcMain.handle(IPC.deleteProject, async (_e, id: string) => {
    store.deleteProject(id)
    memory.archive(id)
    debouncedNotify()
  })

  ipcMain.handle(IPC.createAgent, async (_e, input: CreateAgentInput) => {
    const agents = store.agents(input.projectId)
    const agent = {
      ...input,
      id: newId('agt'),
      endpoint: input.endpoint || defaultEndpoint(input.engine),
      skills: input.skills ?? [],
      concurrency: 1,
      desk: agents.length,
      enabled: true,
      status: 'idle' as const,
      currentTaskId: null,
      lastError: null,
      createdAt: Date.now()
    }
    store.insertAgent(agent)
    memory.bootstrapAgent(agent, store.project(input.projectId) ?? null)
    debouncedNotify()
    return agent
  })

  ipcMain.handle(IPC.updateAgent, async (_e, id: string, patch: Partial<Agent>) => {
    store.updateAgent(id, patch)
    debouncedNotify()
    return store.agent(id)
  })

  ipcMain.handle(IPC.deleteAgent, async (_e, id: string) => {
    orchestrator.stopAgent(id)
    store.deleteAgent(id)
    memory.deleteFilesFor(join('agents', id))
    debouncedNotify()
  })

  ipcMain.handle(IPC.duplicateAgent, async (_e, id: string) => {
    const source = store.agent(id)
    if (!source) throw new Error('Worker not found')
    const agents = store.agents(source.projectId)
    const copy = { ...source, id: newId('agt'), name: `${source.name} II`, desk: agents.length, status: 'idle' as const }
    store.insertAgent(copy)
    memory.bootstrapAgent(copy, store.project(source.projectId) ?? null)
    debouncedNotify()
    return copy
  })

  ipcMain.handle(IPC.startRun, async (_e, input: { projectId: string; instruction: string }) => {
    await refreshProviders()
    const project = store.project(input.projectId)
    if (project) preview.rescan(project)
    const jobId = await orchestrator.startRun(input.projectId, input.instruction)
    debouncedNotify()
    return { jobId }
  })

  ipcMain.handle(IPC.previewStart, async (_e, projectId: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    // The owner clicked Start: from now on this project's dev script may auto-start
    // on open. Until this kv flag exists, rescan shows the manual state instead.
    store.db.kvSet(`preview:autoapproved:${projectId}`, '1')
    const state = await preview.start(project)
    debouncedNotify()
    return state
  })

  ipcMain.handle(IPC.previewInstall, async (_e, projectId: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    const state = await preview.install(project)
    debouncedNotify()
    return state
  })

  ipcMain.handle(IPC.previewStop, async (_e, projectId: string) => {
    preview.stop(projectId)
    debouncedNotify()
    const project = store.project(projectId)
    return project ? preview.stateForProject(project) : preview.get(projectId)
  })

  ipcMain.handle(IPC.previewRefresh, async (_e, projectId: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    preview.rescan(project)
    const state = preview.stateForProject(project)
    debouncedNotify()
    return state
  })

  ipcMain.handle(IPC.previewArtifact, async (_e, projectId: string, path: string) => {
    const project = store.project(projectId)
    if (!project) throw new Error('Project not found')
    return preview.readArtifact(project, path)
  })

  ipcMain.handle(IPC.previewApiRequest, async (_e, input: {
    baseUrl: string
    method: string
    path: string
    body?: string
    timeoutMs?: number
  }) => {
    const method = String(input.method ?? 'GET').toUpperCase()
    const url = `${input.baseUrl.replace(/\/+$/, '')}/${String(input.path ?? '').replace(/^\/+/, '')}`
    // Only loopback targets: the preview harness must not be usable as a proxy
    // to arbitrary internet hosts from the renderer.
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(url)) {
      return { ok: false, error: 'Only loopback preview URLs are allowed' }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 15000)
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: input.body ? { 'content-type': 'application/json' } : undefined,
        body: input.body ? input.body : undefined
      })
      const text = await res.text()
      return {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get('content-type') ?? '',
        body: text.slice(0, 200_000)
      }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    } finally {
      clearTimeout(timer)
    }
  })

  ipcMain.handle(IPC.stopRun, async (_e, projectId: string) => {
    orchestrator.stopRun(projectId)
    debouncedNotify()
  })

  ipcMain.handle(IPC.approveTask, async (_e, taskId: string) => {
    orchestrator.approveTask(taskId)
    debouncedNotify()
  })

  ipcMain.handle(IPC.rejectTask, async (_e, taskId: string, reason: string) => {
    orchestrator.rejectTask(taskId, reason)
    debouncedNotify()
  })

  ipcMain.handle(IPC.retryTask, async (_e, taskId: string) => {
    orchestrator.retryTask(taskId)
    debouncedNotify()
  })

  ipcMain.handle(IPC.stopAgent, async (_e, agentId: string) => {
    orchestrator.stopAgent(agentId)
    debouncedNotify()
  })

  ipcMain.handle(IPC.pauseAgent, async (_e, agentId: string) => {
    orchestrator.pauseAgent(agentId)
    debouncedNotify()
  })

  ipcMain.handle(IPC.resumeAgent, async (_e, agentId: string) => {
    orchestrator.resumeAgent(agentId)
    debouncedNotify()
  })

  ipcMain.handle(IPC.instructAgent, async (_e, agentId: string, text: string) => {
    await orchestrator.instruct(agentId, text)
    debouncedNotify()
  })

  ipcMain.handle(IPC.saveMemory, async (_e, input: Partial<MemoryDoc> & { path: string; title: string; body: string }) => {
    const doc = memory.save(input)
    debouncedNotify()
    return doc
  })

  ipcMain.handle(IPC.deleteMemory, async (_e, id: string) => {
    const doc = store.memory(id)
    store.deleteMemory(id)
    if (doc) memory.deleteFilesFor(doc.path)
    debouncedNotify()
  })

  ipcMain.handle(IPC.pinMemory, async (_e, id: string) => {
    const doc = store.memory(id)
    if (!doc) return
    memory.save({ ...doc, pinned: !doc.pinned })
    debouncedNotify()
  })

  ipcMain.handle(IPC.searchMemory, async (_e, query: string) => {
    const active = store.activeProjectId()
    const local = store.searchMemory(query, active)
    if (local.length) return local
    return memory.retrieve(active ?? '', query, 8)
  })

  ipcMain.handle(IPC.importSkill, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent ?? undefined!, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const installed = skills.installFrom(result.filePaths[0])
    if (!installed.skill && !installed.removed) throw new Error('That folder has no SKILL.md')
    debouncedNotify()
    return { skill: installed.skill, report: installed.report, removed: installed.removed }
  })

  ipcMain.handle(IPC.toggleSkill, async (_e, id: string) => {
    const skill = skills.scan().find((s) => s.id === id)
    if (!skill) return
    store.setSkillEnabled(id, !skill.enabled)
    debouncedNotify()
  })

  ipcMain.handle(IPC.refreshSkills, async () => {
    const list = skills.scan()
    debouncedNotify()
    return list
  })

  ipcMain.handle(IPC.saveSettings, async (_e, patch: Partial<AppSettings>) => {
    const next = store.saveSettings(patch)
    debouncedNotify()
    return next
  })

  ipcMain.handle(IPC.saveCredential, async (event, engine: EngineKind, value: string) => {
    creds.set(engine, value.trim())
    await refreshProviders()
    // A new key can unlock models, so rediscover before the picker is opened again.
    await refreshModels(projectOf(event))
    debouncedNotify()
  })

  ipcMain.handle(IPC.clearCredential, async (event, engine: EngineKind) => {
    creds.clear(engine)
    await refreshProviders()
    await refreshModels(projectOf(event))
    debouncedNotify()
  })

  ipcMain.handle(IPC.credentials, async () => creds.list())

  ipcMain.handle(IPC.addAutomation, async (_e, input: { projectId: string; name: string; instruction: string; intervalMinutes: number }) => {
    const interval = Math.max(5, Math.round(input.intervalMinutes))
    const automation = {
      id: newId('aut'),
      projectId: input.projectId,
      name: input.name,
      instruction: input.instruction,
      intervalMinutes: interval,
      enabled: true,
      lastRunAt: null,
      nextRunAt: Date.now() + interval * 60_000
    }
    store.addAutomation(automation)
    debouncedNotify()
    return automation
  })

  ipcMain.handle(IPC.toggleAutomation, async (_e, id: string) => {
    const current = store.automations().find((a) => a.id === id)
    if (!current) return
    store.updateAutomation(id, {
      enabled: !current.enabled,
      nextRunAt: !current.enabled ? Date.now() + current.intervalMinutes * 60_000 : null
    })
    debouncedNotify()
  })

  ipcMain.handle(IPC.deleteAutomation, async (_e, id: string) => {
    store.deleteAutomation(id)
    debouncedNotify()
  })

  ipcMain.handle(IPC.openPath, async (_e, path: string) => {
    if (!isSafePath(path)) throw new Error('Path is outside the permitted workspace')
    await shell.openPath(path)
  })

  ipcMain.handle(IPC.openExternal, async (_e, url: string) => {
    if (!/^https?:\/\//.test(url)) throw new Error('Only http(s) links can be opened')
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC.revealFile, async (_e, path: string) => {
    if (!isSafePath(path)) throw new Error('Path is outside the permitted workspace')
    shell.showItemInFolder(path)
  })

  // ---------------------------------------------------------------- planning
  ipcMain.handle(IPC.chatSend, async (_e, input: { projectId: string; text: string; engine: EngineKind; model: string; endpoint: string }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    const result = await planning.sendChat(project, input.text, input)
    debouncedNotify()
    return result.assistant
  })

  ipcMain.handle(IPC.promptCreate, async (_e, input: { projectId: string; engine: EngineKind; model: string; endpoint: string }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    const doc = await planning.createPrompt(project, input)
    debouncedNotify()
    return doc
  })

  ipcMain.handle(IPC.promptEnhance, async (_e, input: { projectId: string; promptId: string; engine: EngineKind; model: string; endpoint: string }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    const doc = await planning.enhancePrompt(project, input.promptId, input)
    debouncedNotify()
    return doc
  })

  ipcMain.handle(IPC.promptSave, async (_e, input: { projectId: string; promptId: string; body: string; source: 'edited' | 'restored' }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    if (!input.body.trim()) throw new Error('A prompt cannot be saved empty')
    const doc = planning.savePromptEdit(project, { id: input.promptId, body: input.body, source: input.source })
    debouncedNotify()
    return doc
  })

  ipcMain.handle(IPC.assignPrompt, async (_e, input: AssignPromptInput) => {
    const result = await orchestrator.assignPrompt(input)
    debouncedNotify()
    return result
  })

  /**
   * Advisor side-chat: answers on the planner engine, with a summary of the
   * current project so it can give concrete improvement advice.
   */
  ipcMain.handle(IPC.chatAdvisor, async (_e, input: { projectId: string; text: string }) => {
    const project = store.project(input.projectId)
    if (!project) throw new Error('Project not found')
    const tasks = store.tasks(project.id).slice(-12).map((t) => `- [${t.status}] ${t.title} (${t.role}${t.attempts ? `, attempt ${t.attempts}` : ''})`)
    const latestPrompt = store.prompts(project.id).at(-1)
    const job = store.runningJob(project.id)
    const system = `You are the advisor inside Ventriee Studios, a local multi-agent AI studio. The owner is building "${project.name}" (${project.description || 'no description'}). Be concrete and practical. Give short, actionable advice: how to improve the prompt, split tasks, choose models, or interpret failures. Do not invent credentials or claim things ran that did not.

Current project state:
- Active run: ${job ? 'running' : 'none'}
- Tasks:${tasks.length ? '\n' + tasks.join('\n') : ' none yet'}
- Latest prompt revision: ${latestPrompt ? `"${latestPrompt.title}" (v${latestPrompt.version})` : 'none'}

Answer the owner's question directly.`
    const settings = store.settings()
    const result = await runEngine(
      {
        engine: settings.plannerEngine,
        model: settings.plannerModel,
        endpoint: settings.plannerEndpoint,
        system,
        prompt: input.text,
        cwd: project.path,
        maxTokens: 8000,
        timeoutMs: 120_000,
        reasoning: 'auto'
      },
      creds
    )
    if (!result.ok) throw new Error(result.error ?? 'Advisor request failed')
    return { reply: result.text, model: settings.plannerModel || 'default' }
  })

  ipcMain.handle(IPC.modelsDiscover, async (_e, projectId: string | null) => {
    return refreshModels(projectId ?? store.activeProjectId())
  })

  ipcMain.handle(IPC.modelPrefs, async (_e, patch: Partial<ModelPrefs>) => {
    const next = store.saveModelPrefs(patch)
    debouncedNotify()
    return next
  })

  ipcMain.handle(IPC.addProvider, async (_e, input: {
    label: string
    kind: 'openai' | 'anthropic' | 'gemini'
    engine: EngineKind
    baseUrl: string
    apiKey: string
    models: string[]
  }) => {
    const label = input.label.trim()
    if (!label) throw new Error('Give the provider a name')
    const config: ProviderConfig = {
      id: newId('prv'),
      label,
      kind: input.kind,
      engine: input.engine,
      baseUrl: input.baseUrl.trim() || defaultEndpoint(input.engine),
      models: input.models,
      createdAt: Date.now()
    }
    store.addProvider(config)
    // The key is stored under the provider id and never returned to the renderer.
    if (input.apiKey.trim()) {
      creds.setKey(`cred:provider:${config.id}`, input.apiKey.trim())
      // Execution resolves a key by engine, so mirror it into that slot too.
      // shortcut: two custom providers on the same engine share the last key, split per-provider if that matters
      creds.set(config.engine, input.apiKey.trim())
    }
    await refreshProviders()
    await refreshModels(store.activeProjectId())
    debouncedNotify()
    return config
  })

  ipcMain.handle(IPC.updateProvider, async (_e, id: string, patch: Partial<ProviderConfig> & { apiKey?: string }) => {
    const existing = store.providers().find((p) => p.id === id)
    if (!existing) throw new Error('Provider not found')
    store.updateProvider(id, patch)
    if (patch.apiKey !== undefined) {
      creds.setKey(`cred:provider:${id}`, patch.apiKey.trim())
    }
    await refreshModels(store.activeProjectId())
    debouncedNotify()
    return store.providers().find((p) => p.id === id)!
  })

  ipcMain.handle(IPC.deleteProvider, async (_e, id: string) => {
    store.deleteProvider(id)
    await refreshModels(store.activeProjectId())
    debouncedNotify()
  })

  ipcMain.handle(IPC.testProvider, async (_e, input: {
    id?: string
    engine: EngineKind
    baseUrl: string
    apiKey?: string
    model: string
  }) => {
    const key = input.apiKey?.trim() || (input.id ? creds.getKey(`cred:provider:${input.id}`) : undefined)
    const result = await planning.testProviderConfig({
      engine: input.engine,
      baseUrl: input.baseUrl,
      apiKey: key ?? undefined
    })
    return result
  })
}

let patchAgentShape: unknown

/** Renderer-supplied paths must sit inside an authorized project workspace. */
function isSafePath(target: string) {
  return store.projects().some((p) => isInside(p.path, target))
}

function startScheduler() {
  if (scheduler) clearInterval(scheduler)
  scheduler = setInterval(() => {
    const now = Date.now()
    for (const automation of store.automations()) {
      if (!automation.enabled || !automation.nextRunAt || automation.nextRunAt > now) continue
      const project = store.project(automation.projectId)
      if (!project) {
        store.updateAutomation(automation.id, { enabled: false, nextRunAt: null })
        continue
      }
      if (store.runningJob(project.id)) continue
      store.updateAutomation(automation.id, {
        lastRunAt: now,
        nextRunAt: now + automation.intervalMinutes * 60_000
      })
      store.addEvent({
        projectId: project.id,
        agentId: null,
        taskId: null,
        type: 'automation',
        message: `Scheduled run started: ${automation.name}`
      })
      void orchestrator.startRun(project.id, automation.instruction).catch((error) => {
        store.addEvent({
          projectId: project.id,
          agentId: null,
          taskId: null,
          type: 'error',
          message: `Automation failed: ${(error as Error).message}`
        })
      })
    }
    debouncedNotify()
  }, 30_000)
  scheduler.unref?.()
}

function bootstrapData() {
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  store = new Store(join(userData, 'ventriee.db'))
  creds = new Credentials(store.db)
  memory = new MemoryService(store, userData)
  skills = new SkillService(store, userData)
  preview = new PreviewService(debouncedNotify, (projectId) => store.db.kvGet(`preview:autoapproved:${projectId}`) === '1')
  planning = new PlanningService(
    store,
    creds,
    memory,
    debouncedNotify,
    (payload) => {
      sendToProject(payload.projectId, IPC.chatChunk, payload)
    }
  )

  const bundledSkills = isDev
    ? join(app.getAppPath(), 'resources', 'skills')
    : join(process.resourcesPath, 'skills')
  skills.seedBundled(bundledSkills)
  skills.scan()
  memory.reindex()

  const activeProject = store.activeProjectId() ? store.project(store.activeProjectId()!) : null
  memory.bootstrap(activeProject ?? null)
  if (activeProject) preview.rescan(activeProject)

  orchestrator = new Orchestrator({
    store,
    memory,
    creds,
    emit: bus,
    notify: debouncedNotify,
    isProjectOpen: () => true,
    models: () => lastModels,
    providerConfigs: () => store.providers()
  })

  // Mark anything that was mid-flight at shutdown, so the UI never shows a stale spinner.
  for (const session of store.sessions()) {
    if (session.status === 'running') {
      store.updateSession(session.id, { status: 'failed', endedAt: Date.now(), exitCode: null })
    }
  }
  for (const project of store.projects()) {
    for (const agent of store.agents(project.id)) {
      if (agent.status === 'working' || agent.status === 'waiting') {
        store.updateAgent(agent.id, { status: 'idle', currentTaskId: null })
      }
    }
    for (const task of store.tasks(project.id)) {
      if (task.status === 'running' || task.status === 'review' || task.status === 'approval') {
        store.updateTask(task.id, { status: 'rework', review: 'Interrupted. The app restarted mid-task; retry when ready.' })
      }
    }
    for (const job of store.jobs(project.id)) {
      if (job.status === 'running') store.updateJob(job.id, { status: 'failed', error: 'Interrupted by app restart' })
    }
  }
}

app.whenReady().then(async () => {
  // Ties the window to the installed shortcut so the taskbar shows our icon, not Electron's.
  if (process.platform === 'win32') app.setAppUserModelId('com.ventriee.studios')
  bootstrapData()
  registerIpc()
  bus.on('output', (payload: { sessionId: string; agentId: string; taskId: string | null; chunk: string }) => {
    // Only windows showing that project need the chunk.
    const agent = store.agents().find((a) => a.id === payload.agentId)
    sendToProject(agent?.projectId ?? null, IPC.output, payload)
  })
  await refreshProviders()
  createWindow()
  createTray()
  startScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // With a tray the app keeps running until Quit is chosen there.
  if (process.platform === 'darwin' || !quitting) return
  app.quit()
})

app.on('before-quit', () => {
  quitting = true
  if (scheduler) clearInterval(scheduler)
  tray?.destroy()
  for (const project of store?.projects?.() ?? []) {
    orchestrator?.stopRun(project.id)
    preview?.unwatch(project.id)
  }
})

export type { SessionRecord, SkillRecord }
