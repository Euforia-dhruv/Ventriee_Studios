import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { ArtifactKind } from '../shared/types'

export interface ArtifactProfile {
  kind: ArtifactKind
  /** Human label for the preview header, e.g. "Vite + React". */
  label: string
  /** npm script to start, when the project has one. */
  devCommand: string | null
  /** File the preview should show for non-server artifacts. */
  entry: string | null
  /** Extra scripts (python/js) the owner can run once. */
  runCommand: string | null
  /** The workspace declares packages that are not on disk yet. */
  needsInstall: boolean
  /** Command that would install them, when there is one. */
  installCommand: string | null
  notes: string
}

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'])
const DOC = new Set(['.md', '.pdf', '.txt', '.html', '.htm', '.docx', '.pptx', '.csv'])
const CODE = new Set(['.py', '.js', '.mjs', '.ts', '.sh', '.ps1'])

type BaseProfile = Omit<ArtifactProfile, 'needsInstall' | 'installCommand'>

/**
 * Classify a workspace by what it actually contains, not by what the brief said.
 * Install status is attached here so every caller sees the same answer: a Node
 * project with declared dependencies and no node_modules cannot run.
 */
export function profileProject(root: string): ArtifactProfile {
  const profile = classify(root)
  const install = installFor(root)
  return { ...profile, ...install }
}

/** True when package.json declares packages that are not on disk. */
function installFor(root: string): { needsInstall: boolean; installCommand: string | null } {
  const pkg = readJson(join(root, 'package.json'))
  const declared = Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }).length
  if (!pkg || !declared) return { needsInstall: false, installCommand: null }
  if (existsSync(join(root, 'node_modules'))) return { needsInstall: false, installCommand: null }
  return { needsInstall: true, installCommand: installCommandFor(root) }
}

/** Honour the lockfile the workers produced instead of guessing. */
function installCommandFor(root: string): string {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm install'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn install'
  if (existsSync(join(root, 'bun.lockb'))) return 'bun install'
  return 'npm install'
}

function classify(root: string): BaseProfile {
  const pkgPath = join(root, 'package.json')
  const pkg = readJson(pkgPath)
  const deps = pkg ? { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } : {}
  const has = (name: string) => Object.keys(deps).some((d) => d === name || d.startsWith(`${name}/`))
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>
  const scriptName = ['dev', 'start', 'preview', 'serve'].find((s) => typeof scripts[s] === 'string') ?? null
  const devCommand = scriptName ? `npm run ${scriptName}` : null

  const entries = safeEntries(root)

  if (has('vite')) return web('Vite', devCommand, '@vitejs/plugin-react' in deps ? 'Vite + React' : 'Vite')
  if (has('next')) return web('Next.js', devCommand, 'Next.js')
  if (has('astro')) return web('Astro', devCommand, 'Astro')
  if (has('@remix-run/dev') || has('@remix-run/react')) return web('Remix', devCommand, 'Remix')
  if (has('nuxt')) return web('Nuxt', devCommand, 'Nuxt')
  if (has('svelte')) return web('Svelte', devCommand, 'Svelte')
  if (has('react-scripts')) return web('Create React App', devCommand ?? 'npm start', 'Create React App')
  if (has('electron')) return { kind: 'node', label: 'Electron app', devCommand, entry: null, runCommand: devCommand, notes: 'Desktop apps render in their own window. The panel shows build output and the run command.' }
  if (has('express') || has('fastify') || has('koa') || has('hono') || has('@nestjs/core')) {
    return { kind: 'node', label: 'Node service', devCommand, entry: null, runCommand: devCommand, notes: 'Service preview shows live logs. Open the URL from the log line in the browser for the UI.' }
  }
  if (devCommand && (pkg?.dependencies || pkg?.devDependencies)) {
    return { kind: 'node', label: pkg?.name ?? 'Node project', devCommand, entry: null, runCommand: devCommand, notes: 'Runs the package script and streams its output here.' }
  }
  if (existsSync(join(root, 'index.html'))) return { kind: 'static', label: 'Static site', devCommand: null, entry: 'index.html', runCommand: null, notes: 'Served from the project folder; refresh picks up file changes.' }

  const py = entries.find((e) => e.endsWith('.py')) ?? pickByExt(root, ['.py'])
  if (py) {
    return { kind: 'python', label: 'Python', devCommand: null, entry: py, runCommand: `python "${py}"`, notes: 'Run the script to see its real output, errors included.' }
  }
  const image = pickByExt(root, [...IMAGE])
  if (image) return { kind: 'image', label: 'Image', devCommand: null, entry: image, runCommand: null, notes: 'Rendered directly from the project folder.' }
  const doc = pickByExt(root, ['.md', '.pdf', '.html'])
  if (doc) return { kind: 'document', label: 'Document', devCommand: null, entry: doc, runCommand: null, notes: 'Preview of the delivered document.' }
  const script = entries.find((e) => CODE.has(extname(e).toLowerCase()))
  if (script) return { kind: 'python', label: 'Script', devCommand: null, entry: script, runCommand: null, notes: 'Run the script to see its output.' }

  return {
    kind: 'unknown',
    label: 'No artifact yet',
    devCommand,
    entry: null,
    runCommand: null,
    notes: 'The panel fills in as soon as the project contains something runnable or viewable.'
  }
}

function web(framework: string, devCommand: string | null, label: string): BaseProfile {
  return {
    kind: 'web',
    label,
    devCommand,
    entry: null,
    runCommand: devCommand,
    notes: `${framework} dev server. The preview reloads as workers save files.`
  }
}

function readJson(path: string): { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function safeEntries(root: string): string[] {
  try {
    return readdirSync(root).filter((e) => !e.startsWith('.'))
  } catch {
    return []
  }
}

/** Newest file with one of these extensions, skipping dependency and build folders. */
function pickByExt(root: string, exts: string[], depth = 0): string | null {
  if (depth > 3) return null
  let best: { path: string; mtime: number } | null = null
  for (const entry of safeEntries(root)) {
    if (['node_modules', 'dist', 'build', '.git', '.next', 'out', '__pycache__', 'venv', '.venv'].includes(entry)) continue
    const full = join(root, entry)
    try {
      const st = statSync(full)
      if (st.isDirectory()) {
        const nested = pickByExt(full, exts, depth + 1)
        if (nested) {
          // `nested` is relative to the child directory, not to root.
          const nst = statSync(join(full, nested))
          if (!best || nst.mtimeMs > best.mtime) best = { path: join(entry, nested), mtime: nst.mtimeMs }
        }
        continue
      }
      const ext = extname(entry).toLowerCase()
      if (!exts.includes(ext)) continue
      if (!best || st.mtimeMs > best.mtime) best = { path: entry, mtime: st.mtimeMs }
    } catch {
      /* unreadable entry */
    }
  }
  return best?.path ?? null
}
