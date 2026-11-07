import { create } from 'zustand'
import type { Agent, Snapshot } from '../../shared/types'
import type { VentrieeApi } from '../../shared/ipc'

declare global {
  interface Window {
    ventriee: VentrieeApi
  }
}

export type Panel = 'none' | 'settings' | 'memory' | 'skills' | 'automations' | 'project'
export type RailTab = 'plan' | 'activity' | 'mail'
/** Plan is the primary entry point; the office is where work happens. */
export type Workspace = 'plan' | 'office'

interface UiState {
  snapshot: Snapshot | null
  ready: boolean
  selectedAgentId: string | null
  railTab: RailTab
  panel: Panel
  workspace: Workspace
  output: Record<string, string>
  /** Live text for the streaming planning reply, keyed by chat message id. */
  chatStream: Record<string, string>
  chatDraft: string
  draft: string
  toast: { text: string; kind: 'info' | 'error' } | null
  setSnapshot: (s: Snapshot) => void
  select: (id: string | null) => void
  setRailTab: (tab: RailTab) => void
  setPanel: (panel: Panel) => void
  setWorkspace: (workspace: Workspace) => void
  appendOutput: (agentId: string, chunk: string) => void
  clearOutput: (agentId: string) => void
  appendChat: (messageId: string, chunk: string) => void
  clearChatStream: (messageId: string) => void
  setChatDraft: (text: string) => void
  setDraft: (text: string) => void
  notify: (text: string, kind?: 'info' | 'error') => void
  dismissToast: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useStore = create<UiState>((set, get) => ({
  snapshot: null,
  ready: false,
  selectedAgentId: null,
  railTab: 'plan',
  panel: 'none',
  workspace: 'plan',
  output: {},
  chatStream: {},
  chatDraft: '',
  draft: '',
  toast: null,
  setSnapshot: (snapshot) => set({ snapshot, ready: true }),
  select: (selectedAgentId) => set({ selectedAgentId }),
  setRailTab: (railTab) => set({ railTab }),
  setPanel: (panel) => set({ panel }),
  setWorkspace: (workspace) => set({ workspace }),
  appendOutput: (agentId, chunk) => {
    const current = get().output[agentId] ?? ''
    const next = `${current}${chunk}`
    set({ output: { ...get().output, [agentId]: next.length > 240_000 ? next.slice(-160_000) : next } })
  },
  clearOutput: (agentId) => set({ output: { ...get().output, [agentId]: '' } }),
  appendChat: (messageId, chunk) => {
    const current = get().chatStream[messageId] ?? ''
    const next = `${current}${chunk}`
    set({ chatStream: { ...get().chatStream, [messageId]: next } })
  },
  clearChatStream: (messageId) => {
    const rest = { ...get().chatStream }
    delete rest[messageId]
    set({ chatStream: rest })
  },
  setChatDraft: (chatDraft) => set({ chatDraft }),
  setDraft: (draft) => set({ draft }),
  notify: (text, kind = 'info') => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: { text, kind } })
    toastTimer = setTimeout(() => set({ toast: null }), 5200)
  },
  dismissToast: () => set({ toast: null })
}))

export function activeAgent(snapshot: Snapshot | null, id: string | null): Agent | null {
  if (!snapshot || !id) return null
  return snapshot.agents.find((a) => a.id === id) ?? null
}

export async function guard<T>(work: () => Promise<T>, success?: string): Promise<T | null> {
  try {
    const result = await work()
    if (success) useStore.getState().notify(success)
    return result
  } catch (error) {
    useStore.getState().notify(cleanError(error), 'error')
    return null
  }
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
}
