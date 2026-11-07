import 'pixi.js/unsafe-eval'
import { useEffect, useRef } from 'react'
import { Application, Container, Texture, Ticker } from 'pixi.js'
import { Camera } from '../office/Camera'
import { Character } from '../office/Character'
import { DeskScreen } from '../office/DeskScreen'
import { MessageEnvelope, type MessageAct } from '../office/MessageEnvelope'
import { TiledMapRenderer } from '../office/TiledMapRenderer'
import { characterForRole } from '../office/cast'
import { OFFICE_THEME, type Tile } from '../office/themeRegistry'
import { resolveThemeMap, themeTilesetUrls } from '../office/themeLoader'
import { hexNum } from '../office/tokens'
import { useStore } from '../store'
import type { Agent, Message, Snapshot } from '../../../shared/types'

interface Runtime {
  character: Character
  seat: number
  waitTile: Tile
  screen?: DeskScreen
  prevStatus?: Agent['status']
}

const ACT: Record<Message['type'], MessageAct> = {
  note: 'inform',
  request: 'request',
  blocker: 'query',
  handover: 'done',
  review: 'agree',
  owner: 'request'
}

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const texture = Texture.from(image)
      texture.source.scaleMode = 'nearest'
      resolve(texture)
    }
    image.onerror = () => reject(new Error(`Failed to load ${url}`))
    image.src = url
  })
}

/** The one-line activity shown in the speech bubble above a worker. */
function liveActivity(agent: Agent, state: Snapshot, output: Record<string, string>): string {
  const task = agent.currentTaskId ? state.tasks.find((t) => t.id === agent.currentTaskId) : null
  if (task) return task.title
  const tail = (output[agent.id] ?? '').trim().split('\n').filter(Boolean).pop() ?? ''
  if (tail) return tail.replace(/^[>#*\s-]+/, '').slice(0, 64)
  if (agent.lastError) return agent.lastError.slice(0, 64)
  return ''
}

export function OfficeFloor({ onSelect }: { onSelect: (id: string) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    const app = new Application()
    const runtimes = new Map<string, Runtime>()
    const envelopes: MessageEnvelope[] = []
    const seenMessages = new Set<string>()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const boot = async () => {
      const theme = OFFICE_THEME
      await app.init({
        background: theme.palette.background,
        antialias: false,
        roundPixels: true,
        resolution: Math.max(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        width: host.clientWidth || 900,
        height: host.clientHeight || 620
      })
      if (disposed) {
        app.destroy(true)
        return
      }
      host.replaceChildren(app.canvas)

      const textures = await Promise.all(themeTilesetUrls(theme).map(loadTexture))
      if (disposed) {
        app.destroy(true)
        return
      }

      const world = new Container()
      app.stage.addChild(world)

      const map = new TiledMapRenderer(resolveThemeMap(theme), textures)
      world.addChild(map.getContainer())
      const charLayer = map.getCharacterContainer()

      const camera = new Camera(world)
      camera.setMapSize(map.width * map.tileSize, map.height * map.tileSize)
      camera.setViewSize(app.screen.width, app.screen.height)
      camera.fitToScreen()

      // Seats in claim order: the corner office first, then the desks, then the
      // meeting room as overflow. Index matches Agent.desk, so a worker keeps
      // the same desk across restarts.
      const seatTiles: Tile[] = []
      const seen = new Set<string>()
      const addSeat = (tile?: Tile) => {
        if (!tile) return
        const key = `${tile.x},${tile.y}`
        if (seen.has(key)) return
        seen.add(key)
        seatTiles.push({ x: tile.x, y: tile.y })
      }
      for (const name of theme.primarySeatNames) addSeat(map.getSpawnPoint(name))
      const boardroom = map.getZone('boardroom')
      if (boardroom) {
        for (let y = boardroom.y; y < boardroom.y + boardroom.height; y += 1) {
          for (let x = boardroom.x; x < boardroom.x + boardroom.width; x += 1) {
            if (map.isWalkable(x, y)) addSeat({ x, y })
          }
        }
      }

      const entrance = map.getSpawnPoint('entrance') ?? { x: Math.floor(map.width / 2), y: map.height - 2 }
      const waitTiles: Tile[] = []
      for (let radius = 0; radius <= 6 && waitTiles.length < 16; radius += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
            const tile = { x: entrance.x + dx, y: entrance.y + dy }
            if (map.isWalkable(tile.x, tile.y)) waitTiles.push(tile)
          }
        }
      }
      if (!waitTiles.length) waitTiles.push(entrance)

      const facingForSeat = (tile: Tile): 'up' | 'down' | 'left' | 'right' => {
        if (!map.isWalkable(tile.x, tile.y - 1)) return 'up'
        if (!map.isWalkable(tile.x, tile.y + 1)) return 'down'
        if (!map.isWalkable(tile.x - 1, tile.y)) return 'left'
        if (!map.isWalkable(tile.x + 1, tile.y)) return 'right'
        return 'up'
      }

      const positionOf = (id: string): { x: number; y: number } | null => {
        if (id === 'orchestrator') {
          const boss = useStore.getState().snapshot?.agents.find((a) => a.role === 'orchestrator')
          const runtime = boss ? runtimes.get(boss.id) : undefined
          return runtime ? runtime.character.getPixelPosition() : null
        }
        const runtime = runtimes.get(id)
        return runtime ? runtime.character.getPixelPosition() : null
      }

      const applyState = (agent: Agent, runtime: Runtime) => {
        const snapshot = useStore.getState().snapshot
        if (!snapshot) return
        const output = useStore.getState().output
        const character = runtime.character
        const activity = liveActivity(agent, snapshot, output)
        const wasWorking = runtime.prevStatus === 'working'
        runtime.prevStatus = agent.status

        // An agent that just finished a long session gets a small celebration.
        if (wasWorking && agent.status === 'idle' && !reduced && agent.role !== 'orchestrator') {
          character.cheer()
        }

        switch (agent.status) {
          case 'working':
            character.setStatusGlyph('none')
            character.sitAtDesk(true)
            // The typing animation already says "working"; the bubble is only
            // worth showing when it names the real task or live step.
            if (activity) character.showThought(activity)
            else character.hideThought()
            break
          case 'waiting':
            character.setStatusGlyph('none')
            character.sitAtDesk(false)
            character.showThought(activity || 'Waiting on the team')
            break
          case 'paused':
            character.setStatusGlyph('looping')
            character.sitAtDesk(false)
            character.showThought(activity || 'Paused by the owner')
            break
          case 'error':
            character.setStatusGlyph('blocked')
            character.sitAtDesk(false)
            character.walkToTile(runtime.waitTile)
            character.showThought(activity || agent.lastError || 'Needs the owner')
            break
          case 'offline':
            character.setStatusGlyph('none')
            character.setBaseAlpha(0.45)
            character.sitAtDesk(false)
            character.hideThought()
            break
          case 'idle':
          default:
            character.setBaseAlpha(1)
            character.setStatusGlyph('none')
            character.sitAtDesk(agent.role === 'orchestrator')
            // Idle workers only speak when they have something real to say;
            // a wall of bubbles naming their job would be decoration.
            if (activity) character.showThought(activity)
            else character.hideThought()
            if (reduced || !agent.enabled) {
              /* no ambient movement */
            } else if (agent.role !== 'orchestrator') {
              character.startWandering()
            }
            break
        }
        character.setBaseAlpha(agent.enabled ? 1 : 0.45)
        runtime.screen?.setOn(agent.status === 'working' || agent.status === 'waiting')
      }

      const addCharacter = async (agent: Agent) => {
        const seat = Math.min(Math.max(agent.desk, 0), seatTiles.length - 1)
        const seatTile = seatTiles[seat] ?? entrance
        const frames = await OFFICE_THEME.cast.getFrames(characterForRole(agent.role))
        if (disposed) return
        const current = useStore.getState().snapshot?.agents.find((a) => a.id === agent.id)
        if (!current) return

        const character = new Character({
          agentId: agent.id,
          displayName: agent.name,
          mapRenderer: map,
          frames,
          seatTile,
          seatDirection: facingForSeat(seatTile),
          spawnTile: entrance,
          glowColor: hexNum(agent.color),
          onClick: (id) => onSelectRef.current(id)
        })
        character.show(charLayer)

        const runtime: Runtime = {
          character,
          seat,
          waitTile: waitTiles[seat % waitTiles.length] ?? entrance
        }
        if (map.gidAt('furniture-above', seatTile.x, seatTile.y - 2) === theme.monitor.offTopLeftGid) {
          const top = { x: seatTile.x, y: seatTile.y - 2 }
          runtime.screen = new DeskScreen(map, top, theme.monitor)
          charLayer.addChild(runtime.screen.container)
        }
        runtimes.set(agent.id, runtime)
        applyState(current, runtime)
      }

      const removeCharacter = (id: string) => {
        const runtime = runtimes.get(id)
        if (!runtime) return
        runtime.character.setThoughtLift(0)
        runtime.screen?.destroy()
        runtime.character.hide(0)
        setTimeout(() => runtime.character.destroy(), 650)
        runtimes.delete(id)
      }

      const syncAgents = () => {
        const agents = useStore.getState().snapshot?.agents ?? []
        const present = new Set(agents.map((a) => a.id))
        for (const id of [...runtimes.keys()]) if (!present.has(id)) removeCharacter(id)
        for (const agent of agents) {
          const runtime = runtimes.get(agent.id)
          if (!runtime) void addCharacter(agent)
          else {
            runtime.character.setName(agent.name)
            applyState(agent, runtime)
          }
        }
      }

      // Paper planes for real routed messages, not decorative ones.
      const spawnEnvelope = (message: Message) => {
        if (envelopes.length >= 12) return
        if (message.sender === message.recipient) return
        const from = positionOf(message.sender)
        const to = positionOf(message.recipient)
        if (!from || !to) return
        const envelope = new MessageEnvelope(from, to, ACT[message.type] ?? 'inform', message.type === 'blocker')
        charLayer.addChild(envelope.container)
        envelopes.push(envelope)
      }

      const messages = useStore.getState().snapshot?.messages ?? []
      for (const message of messages) seenMessages.add(message.id)
      const onSnapshot = (snapshot: Snapshot) => {
        for (const message of snapshot.messages) {
          if (seenMessages.has(message.id)) continue
          seenMessages.add(message.id)
          spawnEnvelope(message)
        }
      }

      syncAgents()

      const unsubscribe = useStore.subscribe((state, prev) => {
        if (state.snapshot && state.snapshot !== prev.snapshot) {
          syncAgents()
          onSnapshot(state.snapshot)
        }
        if (state.selectedAgentId !== prev.selectedAgentId && state.selectedAgentId) {
          const runtime = runtimes.get(state.selectedAgentId)
          if (runtime) {
            const point = runtime.character.getPixelPosition()
            camera.nudgeToward(point.x, point.y)
          }
        }
      })

      // Thought bubbles carry the current task/step, so refresh them on a slow
      // beat instead of on every streamed output chunk.
      let refresh = 0
      const onTick = (ticker: Ticker) => {
        const dt = ticker.deltaMS / 1000
        camera.update(dt)
        const zoom = world.scale.x
        for (const runtime of runtimes.values()) {
          runtime.character.setBubbleZoom(zoom)
          runtime.character.update(dt)
          runtime.screen?.update(dt)
        }
        refresh += dt
        if (refresh >= 2) {
          refresh = 0
          const agents = useStore.getState().snapshot?.agents ?? []
          for (const agent of agents) {
            const runtime = runtimes.get(agent.id)
            if (runtime && (agent.status === 'working' || agent.status === 'error')) applyState(agent, runtime)
          }
        }
        for (let i = envelopes.length - 1; i >= 0; i -= 1) {
          if (envelopes[i].update(dt)) {
            envelopes[i].destroy()
            envelopes.splice(i, 1)
          }
        }
      }
      app.ticker.add(onTick)

      const resize = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect
          if (!width || !height) continue
          app.renderer.resize(width, height)
          camera.setViewSize(width, height)
        }
      })
      resize.observe(host)

      cleanup = () => {
        resize.disconnect()
        unsubscribe()
        app.ticker.remove(onTick)
        for (const runtime of runtimes.values()) {
          runtime.screen?.destroy()
          runtime.character.destroy()
        }
        runtimes.clear()
        for (const envelope of envelopes) envelope.destroy()
        envelopes.length = 0
        app.destroy(true, { children: true })
      }
    }

    let cleanup: (() => void) | null = null
    void boot().catch((error) => {
      console.error('[office] failed to start the floor', error)
    })

    return () => {
      disposed = true
      cleanup?.()
      host.replaceChildren()
    }
  }, [])

  return <div className="office-canvas" ref={hostRef} role="img" aria-label="Studio floor showing each worker at their desk" />
}
