// Print the phantom revision's text, so its shape identifies which code path made it.
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
const rows = db.prepare('select id, version, source, parentId, body, createdAt from prompts order by createdAt').all()
const last = rows[rows.length - 1]
console.log(`v${last.version} ${last.source} ${last.body.length}B parent=${last.parentId} at ${new Date(last.createdAt).toISOString()}`)
console.log('--- first 1200 ---')
console.log(last.body.slice(0, 1200))
console.log('--- last 600 ---')
console.log(last.body.slice(-600))
