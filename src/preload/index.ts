import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type VentrieeApi, type CredentialInfo } from '../shared/ipc'
import type { ChatMessage, EngineKind, ModelOption, ModelPrefs, PromptDoc, ProviderConfig, Snapshot } from '../shared/types'

const api: VentrieeApi = {
  snapshot: () => ipcRenderer.invoke(IPC.snapshot),
  onPatch: (cb) => {
    const listener = (_e: unknown, patch: Snapshot) => cb(patch)
    ipcRenderer.on(IPC.patch, listener)
    return () => ipcRenderer.removeListener(IPC.patch, listener)
  },
  onOutput: (cb) => {
    const listener = (_e: unknown, payload: { sessionId: string; agentId: string; taskId: string | null; chunk: string }) => cb(payload)
    ipcRenderer.on(IPC.output, listener)
    return () => ipcRenderer.removeListener(IPC.output, listener)
  },
  testEngine: (engine, model, endpoint) => ipcRenderer.invoke(IPC.testEngine, engine, model, endpoint),
  createProject: (input) => ipcRenderer.invoke(IPC.createProject, input),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  selectProject: (id) => ipcRenderer.invoke(IPC.selectProject, id),
  openProjectWindow: (projectId) => ipcRenderer.invoke(IPC.openProjectWindow, projectId),
  updateProject: (id, patch) => ipcRenderer.invoke(IPC.updateProject, id, patch),
  deleteProject: (id) => ipcRenderer.invoke(IPC.deleteProject, id),
  createAgent: (input) => ipcRenderer.invoke(IPC.createAgent, input),
  updateAgent: (id, patch) => ipcRenderer.invoke(IPC.updateAgent, id, patch),
  deleteAgent: (id) => ipcRenderer.invoke(IPC.deleteAgent, id),
  duplicateAgent: (id) => ipcRenderer.invoke(IPC.duplicateAgent, id),
  startRun: (input) => ipcRenderer.invoke(IPC.startRun, input),
  stopRun: (projectId) => ipcRenderer.invoke(IPC.stopRun, projectId),
  approveTask: (taskId) => ipcRenderer.invoke(IPC.approveTask, taskId),
  rejectTask: (taskId, reason) => ipcRenderer.invoke(IPC.rejectTask, taskId, reason),
  retryTask: (taskId) => ipcRenderer.invoke(IPC.retryTask, taskId),
  deleteTask: (taskId) => ipcRenderer.invoke(IPC.deleteTask, taskId),
  stopAgent: (agentId) => ipcRenderer.invoke(IPC.stopAgent, agentId),
  pauseAgent: (agentId) => ipcRenderer.invoke(IPC.pauseAgent, agentId),
  resumeAgent: (agentId) => ipcRenderer.invoke(IPC.resumeAgent, agentId),
  instructAgent: (agentId, text) => ipcRenderer.invoke(IPC.instructAgent, agentId, text),
  saveMemory: (input) => ipcRenderer.invoke(IPC.saveMemory, input),
  deleteMemory: (id) => ipcRenderer.invoke(IPC.deleteMemory, id),
  pinMemory: (id) => ipcRenderer.invoke(IPC.pinMemory, id),
  searchMemory: (query) => ipcRenderer.invoke(IPC.searchMemory, query),
  importSkill: () => ipcRenderer.invoke(IPC.importSkill),
  toggleSkill: (id) => ipcRenderer.invoke(IPC.toggleSkill, id),
  refreshSkills: () => ipcRenderer.invoke(IPC.refreshSkills),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.saveSettings, patch),
  saveCredential: (engine: EngineKind, value: string) => ipcRenderer.invoke(IPC.saveCredential, engine, value),
  clearCredential: (engine: EngineKind) => ipcRenderer.invoke(IPC.clearCredential, engine),
  credentials: (): Promise<CredentialInfo[]> => ipcRenderer.invoke(IPC.credentials),
  addAutomation: (input) => ipcRenderer.invoke(IPC.addAutomation, input),
  toggleAutomation: (id) => ipcRenderer.invoke(IPC.toggleAutomation, id),
  deleteAutomation: (id) => ipcRenderer.invoke(IPC.deleteAutomation, id),
  previewStart: (projectId) => ipcRenderer.invoke(IPC.previewStart, projectId),
  previewInstall: (projectId) => ipcRenderer.invoke(IPC.previewInstall, projectId),
  previewStop: (projectId) => ipcRenderer.invoke(IPC.previewStop, projectId),
  previewRefresh: (projectId) => ipcRenderer.invoke(IPC.previewRefresh, projectId),
  previewArtifact: (projectId, path) => ipcRenderer.invoke(IPC.previewArtifact, projectId, path),
  previewApiRequest: (input) => ipcRenderer.invoke(IPC.previewApiRequest, input),
  openPath: (path) => ipcRenderer.invoke(IPC.openPath, path),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  revealFile: (path) => ipcRenderer.invoke(IPC.revealFile, path),
  chatSend: (input) => ipcRenderer.invoke(IPC.chatSend, input),
  onChatChunk: (cb) => {
    const listener = (_e: unknown, payload: { projectId: string; messageId: string; chunk: string }) => cb(payload)
    ipcRenderer.on(IPC.chatChunk, listener)
    return () => ipcRenderer.removeListener(IPC.chatChunk, listener)
  },
  promptCreate: (input) => ipcRenderer.invoke(IPC.promptCreate, input),
  promptEnhance: (input) => ipcRenderer.invoke(IPC.promptEnhance, input),
  promptSave: (input) => ipcRenderer.invoke(IPC.promptSave, input),
  assignPrompt: (input) => ipcRenderer.invoke(IPC.assignPrompt, input),
  chatAdvisor: (input) => ipcRenderer.invoke(IPC.chatAdvisor, input),
  modelsDiscover: (projectId) => ipcRenderer.invoke(IPC.modelsDiscover, projectId),
  saveModelPrefs: (patch) => ipcRenderer.invoke(IPC.modelPrefs, patch),
  addProvider: (input) => ipcRenderer.invoke(IPC.addProvider, input),
  updateProvider: (id, patch) => ipcRenderer.invoke(IPC.updateProvider, id, patch),
  deleteProvider: (id) => ipcRenderer.invoke(IPC.deleteProvider, id),
  testProvider: (input) => ipcRenderer.invoke(IPC.testProvider, input)
}

contextBridge.exposeInMainWorld('ventriee', api)
