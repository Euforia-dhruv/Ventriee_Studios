import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'
import { scanSkill, type SkillScanReport } from './skillsec'
import type { Store } from './store'
import type { SkillRecord } from '../shared/types'

/** Registry keys for stored scan reports: skillsec:<skillId>. */
export const scanKey = (id: string) => `skillsec:${id}`

/**
 * Skills are plain directories with a SKILL.md plus optional scripts and
 * references, mirroring the upstream agentskills layout so anything written
 * for that format can be dropped in.
 */
export class SkillService {
  readonly root: string

  constructor(private store: Store, userData: string) {
    this.root = join(userData, 'skills')
    mkdirSync(this.root, { recursive: true })
  }

  scan(): SkillRecord[] {
    if (!existsSync(this.root)) return this.store.skills()
    const out: SkillRecord[] = []
    for (const entry of readdirSync(this.root)) {
      const dir = join(this.root, entry)
      if (!statSync(dir).isDirectory()) continue
      const file = join(dir, 'SKILL.md')
      if (!existsSync(file)) continue
      const parsed = parseSkill(file, entry)
      const existing = this.store.skills().find((s) => s.id === parsed.id)
      const rec: SkillRecord = {
        ...parsed,
        enabled: existing?.enabled ?? true,
        uses: existing?.uses ?? 0,
        successes: existing?.successes ?? 0
      }
      this.store.upsertSkill(rec)
      // Scan every known, on rescan and on boot. The report is cheap (static
      // regex over small text files) and is persisted so the panel can show it
      // without re-scanning on every snapshot.
      const report = scanSkill(dir)
      this.store.db.kvSet(scanKey(rec.id), JSON.stringify(report))
      out.push({ ...rec, scan: report })
    }
    return out
  }

  /** Scan a single installed skill, persisting the report. */
  scanOne(record: SkillRecord): SkillScanReport {
    const report = scanSkill(record.path)
    this.store.db.kvSet(scanKey(record.id), JSON.stringify(report))
    return report
  }

  /**
   * Copy an external skill folder into the registry, scan it, and reject it if
   * the scan says DO NOT INSTALL (the copy is removed). Returns the installed
   * skill plus its report, or a removed result when the scan rejected it.
   */
  installFrom(sourceDir: string): { skill: SkillRecord | null; report: SkillScanReport; removed: boolean } {
    const file = join(sourceDir, 'SKILL.md')
    if (!existsSync(file)) return { skill: null, report: { score: 0, severity: 'LOW', recommendation: 'SAFE', executable: false, findings: [] }, removed: false }
    const target = join(this.root, basename(sourceDir))
    if (!existsSync(target)) cpSync(sourceDir, target, { recursive: true })
    const report = scanSkill(target)
    if (report.recommendation === 'DO NOT INSTALL') {
      // Serious problem: remove the copy instead of registering it.
      if (existsSync(target)) rmSync(target, { recursive: true, force: true })
      return { skill: null, report, removed: true }
    }
    const skill = this.scan().find((s) => s.path === target) ?? null
    if (skill) this.store.db.kvSet(scanKey(skill.id), JSON.stringify(report))
    return { skill, report, removed: false }
  }

  create(name: string, description: string, instructions: string): SkillRecord {
    const id = slug(name)
    const dir = join(this.root, id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${description}\nversion: 1.0.0\n---\n\n# ${name}\n\n${instructions}\n`,
      'utf8'
    )
    const rec = this.scan().find((s) => s.id === id)!
    this.scanOne(rec)
    return rec
  }

  instructionsFor(skill: SkillRecord): string {
    const file = join(skill.path, 'SKILL.md')
    if (!existsSync(file)) return ''
    return readFileSync(file, 'utf8').replace(/^---[\s\S]*?---\n?/, '').trim()
  }

  /** Import the reusable skills shipped with the studio on first boot. */
  seedBundled(bundledDir: string) {
    if (!existsSync(bundledDir)) return
    for (const entry of readdirSync(bundledDir)) {
      const src = join(bundledDir, entry)
      if (!statSync(src).isDirectory()) continue
      const target = join(this.root, entry)
      if (existsSync(target)) continue
      // Recursive: most skills carry references/, scripts/ or assets/ that the
      // SKILL.md links to, and a top-level-only copy leaves those links dangling.
      cpSync(src, target, { recursive: true })
    }
  }
}

export function parseSkill(file: string, folder: string): SkillRecord {
  const raw = readFileSync(file, 'utf8')
  // Skills come from other people's repos, and many are saved with CRLF. A
  // \n-only pattern silently leaves name and description empty.
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? ''
  const name = /name:\s*(.+)/.exec(front)?.[1]?.trim() ?? folder
  const description = /description:\s*(.+)/.exec(front)?.[1]?.trim() ?? ''
  const version = /version:\s*(.+)/.exec(front)?.[1]?.trim() ?? '1.0.0'
  return {
    id: slug(name),
    name,
    description,
    path: join(file, '..'),
    enabled: true,
    version,
    uses: 0,
    successes: 0,
    source: 'local',
    updatedAt: Date.now()
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
