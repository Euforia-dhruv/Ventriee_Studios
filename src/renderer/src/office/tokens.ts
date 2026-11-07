// Pixi colours for the office scene. CSS owns the rest of the app's theme;
// this mirrors the handful of ink/cream/accent values the pixel art needs.
export const colors = {
  cream: { 50: 0xfffdf5, 100: 0xfff8e7, 200: 0xf4e9c7, 300: 0xe8d9a0 },
  ink: { 900: 0x14161c, 700: 0x3d2e4a, 500: 0x6b5878, 300: 0xa899b5 },
  accent: {
    coral: 0xd96a62,
    mint: 0x5ca97a,
    sky: 0x4f9faf,
    lemon: 0xd9ad57,
    lilac: 0x9482d3,
    peach: 0xd99168
  }
} as const

/** Parse a #rrggbb colour (agent colours come from the database as CSS hex). */
export function hexNum(value: string): number {
  const parsed = parseInt(value.replace('#', ''), 16)
  return Number.isFinite(parsed) ? parsed : colors.accent.lemon
}
