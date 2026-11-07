// Mirrors SkillService.parseSkill exactly: same frontmatter regex, same slug.
// A CRLF or missing description here becomes a skill that looks installed but
// shows a blank description and a folder-derived id in the registry.
const { readFileSync, readdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join('resources', 'skills')
const slug = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ids = new Map()
let problems = 0

for (const folder of readdirSync(root)) {
  const file = join(root, folder, 'SKILL.md')
  if (!existsSync(file)) {
    console.log(`NO SKILL.md  ${folder}`)
    problems += 1
    continue
  }
  const raw = readFileSync(file, 'utf8')
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? ''
  const name = /name:\s*(.+)/.exec(front)?.[1]?.trim() ?? folder
  const description = /description:\s*(.+)/.exec(front)?.[1]?.trim() ?? ''
  const id = slug(name)

  const issues = []
  if (!front) issues.push('frontmatter not parsed')
  if (!description) issues.push('empty description')
  if (id !== folder) issues.push(`id "${id}" != folder`)
  if (ids.has(id)) issues.push(`duplicate id, also ${ids.get(id)}`)
  ids.set(id, folder)

  if (issues.length) {
    problems += 1
    console.log(`${folder.padEnd(24)} ${issues.join('; ')}`)
  }
}

console.log(`\n${ids.size} skills parsed, ${problems} with problems`)
process.exit(problems ? 1 : 0)
