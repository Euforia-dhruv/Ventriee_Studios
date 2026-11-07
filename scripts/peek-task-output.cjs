// Print one task's stored output, so a failed delivery can be read as the
// worker actually wrote it rather than guessed at from the verdict.
const { DatabaseSync } = require('node:sqlite')
const [file, role] = process.argv.slice(2)
const db = new DatabaseSync(file)
const task = db.prepare('select id, title, status, output, description from tasks where role = ? order by createdAt desc limit 1').get(role)
if (!task) {
  console.log('no task for role', role)
  process.exit(1)
}
console.log('title:', task.title)
console.log('status:', task.status)
console.log('description:\n' + task.description)
console.log('\n===== OUTPUT (' + String(task.output).length + ' chars) =====\n')
console.log(String(task.output).slice(0, 6000))
