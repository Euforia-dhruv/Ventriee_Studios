// Dump each agent's stored skill binding, so a role-template change can be
// checked against workers that already exist in the live profile.
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
for (const a of db.prepare('select name, role, projectId, skills from agents order by role').all()) {
  console.log(`${a.role.padEnd(12)} ${a.name.padEnd(8)} ${String(a.skills ?? '[]')}`)
}
