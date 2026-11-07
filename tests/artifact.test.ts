import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { profileProject } from '../src/main/artifact'

const roots: string[] = []

function workspace(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'ventriee-artifact-'))
  roots.push(root)
  for (const [name, body] of Object.entries(files)) {
    if (body === null) mkdirSync(join(root, name), { recursive: true })
    else writeFileSync(join(root, name), body)
  }
  return root
}

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: 'x', scripts: { dev: 'astro dev' }, dependencies: deps })

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('install detection', () => {
  it('asks for an install when packages are declared and node_modules is missing', () => {
    const root = workspace({ 'package.json': pkg({ astro: '^7.0.0' }) })
    const profile = profileProject(root)
    expect(profile.kind).toBe('web')
    expect(profile.needsInstall).toBe(true)
    expect(profile.installCommand).toBe('npm install')
  })

  it('uses the lockfile that is actually present', () => {
    const root = workspace({ 'package.json': pkg({ vite: '^6.0.0' }), 'pnpm-lock.yaml': '' })
    expect(profileProject(root).installCommand).toBe('pnpm install')
  })

  it('does not ask again once node_modules exists', () => {
    const root = workspace({ 'package.json': pkg({ vite: '^6.0.0' }), node_modules: null })
    expect(profileProject(root).needsInstall).toBe(false)
  })

  it('never asks for projects that declare nothing', () => {
    const root = workspace({ 'package.json': JSON.stringify({ name: 'empty' }), 'index.html': '<h1>hi</h1>' })
    const profile = profileProject(root)
    expect(profile.kind).toBe('static')
    expect(profile.needsInstall).toBe(false)
    expect(profile.installCommand).toBeNull()
  })
})
