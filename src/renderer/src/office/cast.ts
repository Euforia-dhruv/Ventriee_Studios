import { Texture } from 'pixi.js'
import { paintPortrait, sceneFrameBufs, SCENE_W, SCENE_H } from './portraitArt'

// The office cast. Every Ventriee member is rendered from a procedural recipe
// (see portraitArt.ts), so no sprite sheets and no external art licences are
// involved for characters. Roles map onto recipes in ROLE_CHARACTER below.
export type OfficeCharacterName =
  | 'michael' | 'jim' | 'pam' | 'dwight' | 'kevin' | 'angela'
  | 'oscar' | 'stanley' | 'phyllis' | 'andy' | 'kelly' | 'ryan'
  | 'toby' | 'creed' | 'meredith'

export interface CastMember {
  name: OfficeCharacterName
  displayName: string
  shirt: string
  blurb: string
}

export const OFFICE_CAST: CastMember[] = [
  { name: 'michael', displayName: 'Michael', shirt: '#5a6b8c', blurb: 'Runs the floor' },
  { name: 'jim', displayName: 'Jim', shirt: '#6fa8dc', blurb: 'Ships the work' },
  { name: 'pam', displayName: 'Pam', shirt: '#9caf88', blurb: 'Designs the work' },
  { name: 'dwight', displayName: 'Dwight', shirt: '#b89b3e', blurb: 'Guards the standards' },
  { name: 'kevin', displayName: 'Kevin', shirt: '#4a7ab5', blurb: 'Keeps the books' },
  { name: 'angela', displayName: 'Angela', shirt: '#8a86a6', blurb: 'Checks the books' },
  { name: 'oscar', displayName: 'Oscar', shirt: '#7a4b6b', blurb: 'Reads the docs' },
  { name: 'stanley', displayName: 'Stanley', shirt: '#8c5a4b', blurb: 'On the wire' },
  { name: 'phyllis', displayName: 'Phyllis', shirt: '#b08bbf', blurb: 'Finds the words' },
  { name: 'andy', displayName: 'Andy', shirt: '#6fae6f', blurb: 'Deploys it' },
  { name: 'kelly', displayName: 'Kelly', shirt: '#d16ba5', blurb: 'Talks to the market' },
  { name: 'ryan', displayName: 'Ryan', shirt: '#3a3a44', blurb: 'The new hire' },
  { name: 'toby', displayName: 'Toby', shirt: '#9a8c5a', blurb: 'Writes it down' },
  { name: 'creed', displayName: 'Creed', shirt: '#6b7a4b', blurb: 'Tests it' },
  { name: 'meredith', displayName: 'Meredith', shirt: '#b5544a', blurb: 'Keeps it running' }
]

export const CAST_BY_NAME: Record<OfficeCharacterName, CastMember> = Object.fromEntries(
  OFFICE_CAST.map((c) => [c.name, c])
) as Record<OfficeCharacterName, CastMember>

export const DEFAULT_CHARACTER: OfficeCharacterName = 'jim'

/** Ventriee worker role → cast member. The orchestrator sits in the corner office. */
export const ROLE_CHARACTER: Record<string, OfficeCharacterName> = {
  orchestrator: 'michael',
  researcher: 'oscar',
  architect: 'toby',
  designer: 'pam',
  frontend: 'jim',
  integration: 'stanley',
  backend: 'dwight',
  reviewer: 'angela',
  fixer: 'creed',
  qa: 'kevin',
  seo: 'phyllis',
  aeo: 'kelly',
  deployment: 'andy',
  monitoring: 'meredith'
}

export function characterForRole(role: string): OfficeCharacterName {
  return ROLE_CHARACTER[role] ?? DEFAULT_CHARACTER
}

const frameCache = new Map<OfficeCharacterName, Texture[][]>()

function bufToTexture(buf: Uint8ClampedArray): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = SCENE_W
  canvas.height = SCENE_H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(SCENE_W, SCENE_H)
  img.data.set(buf)
  ctx.putImageData(img, 0, 0)
  const tex = Texture.from(canvas)
  tex.source.scaleMode = 'nearest'
  return tex
}

/** Frame grid CharacterSprite expects: 3 rows (down, up, right) × 7 frames. */
export function getCastFrames(name: OfficeCharacterName): Texture[][] {
  const cached = frameCache.get(name)
  if (cached) return cached
  const { front, back } = sceneFrameBufs(name)
  const toRow = (bufs: Uint8ClampedArray[]): Texture[] => {
    const [stand, stepL, stepR] = bufs.map(bufToTexture)
    return [stand, stepL, stepR, stand, stand, stand, stand]
  }
  const frontRow = toRow(front)
  const frames: Texture[][] = [frontRow, toRow(back), frontRow]
  frameCache.set(name, frames)
  return frames
}

/** Draw a member's portrait into a 2D canvas (used by the roster list). */
export function paintCastPortrait(ctx: CanvasRenderingContext2D, name: OfficeCharacterName, scale = 2): void {
  paintPortrait(ctx, name, scale)
}
