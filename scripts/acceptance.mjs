/**
 * End-to-end suites. Each stage is independent and reports real evidence.
 *
 *   node scripts/acceptance.mjs a    brief the orchestrator, plan, real execution, stop control
 *   node scripts/acceptance.mjs b    restart persistence against stage A's profile
 *   node scripts/acceptance.mjs c    non-web artifact: worker writes Python, preview runs it
 *   node scripts/acceptance.mjs all  a, then b, then c
 *
 * Stage A keeps its profile so B can prove what survives a restart.
 * Real OpenCode sessions take minutes, so every poll window is generous and
 * a stage that runs out of time reports what actually happened instead of
 * inventing a pass.
 */
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync, statSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, killApp, launchApp, sleep } from './lib/app.mjs'

const stage = (process.argv[2] ?? 'all').toLowerCase()
const PORT = 9341
const A_PROFILE = join(tmpdir(), 'ventriee-e2e-a')
const C_PROFILE = join(tmpdir(), 'ventriee-e2e-c')
const ARTIFACTS = join(process.cwd(), 'artifacts')
mkdirSync(ARTIFACTS, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const finish = (label) => {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== ${label}: ${results.length - failed.length}/${results.length} checks passed ===`)
  if (failed.length) console.log('failed:', failed.map((f) => `${f.name} (${f.detail})`).join('; '))
  writeFileSync(
    join(ARTIFACTS, `e2e-${label.toLowerCase()}.json`),
    JSON.stringify({ label, when: new Date().toISOString(), results }, null, 2)
  )
  return failed.length
}

/** Poll a snapshot until `done` says so or the window closes. */
async function poll(evaluate, seconds, done, onTick) {
  let last = null
  for (let t = 0; t < seconds; t += 3) {
    await sleep(3000)
    last = await evaluate(`window.ventriee.snapshot()`)
    if (onTick) onTick(last, t)
    if (done(last)) return { snap: last, timedOut: false }
  }
  return { snap: last, timedOut: true }
}

async function stageA() {
  console.log('\n=== A: orchestrator run on a real workspace ===')
  rmSync(A_PROFILE, { recursive: true, force: true })
  const web = mkdtempSync(join(tmpdir(), 'ventriee-web-'))
  const child = launchApp({ port: PORT, userData: A_PROFILE })
  const app = await connect(PORT)
  const { evaluate, screenshot, errors } = app
  await sleep(1500)

  const project = await evaluate(`window.ventriee.createProject({
    name: 'Portfolio acceptance',
    path: ${JSON.stringify(web)},
    description: 'Interactive portfolio website for a client.'
  })`)
  await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
  await sleep(1500)

  const seeded = await evaluate(`window.ventriee.snapshot()`)
  check('14 workers seeded', seeded.agents.length === 14, `${seeded.agents.length} agents`)
  check('project memory bootstrapped', seeded.memories.length >= 6, `${seeded.memories.length} docs`)
  check('a CLI engine is available', seeded.providers.some((p) => p.available && p.kind === 'cli'))
  check('empty workspace preview is manual/off', ['off', 'manual'].includes(seeded.preview.status), seeded.preview.status)

  const brief =
    'Build a beautiful interactive portfolio website with a responsive layout, animations and a contact section.'
  await evaluate(`window.ventriee.startRun({ projectId: ${JSON.stringify(project.id)}, instruction: ${JSON.stringify(brief)} })`)

  let previewSeen = null
  let peakLive = 0
  const job = await evaluate(`window.ventriee.snapshot().then((s) => s.jobs.find((j) => j.status === 'running') ?? null)`)
  const { snap: final, timedOut } = await poll(
    evaluate,
    60 * 60, // 60 min cap; a full chain of real CLI sessions is slow
    (s) => {
      const live = s.sessions.filter((x) => x.status === 'running').length
      if (!previewSeen && s.preview.status === 'ready' && s.preview.url) previewSeen = s.preview
      return live === 0 && s.tasks.length > 0 && !s.running && s.jobs.every((j) => j.status !== 'running')
    },
    (s, t) => {
      const live = s.sessions.filter((x) => x.status === 'running').length
      peakLive = Math.max(peakLive, live)
      const done = s.tasks.filter((x) => x.status === 'done').length
      process.stdout.write(
        `\r  t=${t + 3}s tasks=${s.tasks.length} done=${done} live=${live} peak=${peakLive} preview=${s.preview.status}   `
      )
    }
  )
  process.stdout.write('\n')
  if (timedOut) console.log('  window closed before the run finished; reporting what exists so far')

  const doneTasks = final.tasks.filter((t) => t.status === 'done')
  check('orchestrator created real tasks', final.tasks.length >= 4, `${final.tasks.length} tasks`)
  check('tasks carry acceptance criteria', final.tasks.every((t) => t.acceptance && t.acceptance.length > 10))
  check('tasks carry dependencies', final.tasks.some((t) => t.dependsOn.length > 0))
  check('plan came from the model, not the fallback', (final.jobs[0]?.planSource ?? 'heuristic') === 'model', final.jobs[0]?.planSource)
  check('at least one task completed', doneTasks.length > 0, `${doneTasks.length}/${final.tasks.length} done`)
  check('no task silently stuck in running', final.tasks.every((t) => t.status !== 'running'), `${final.tasks.length} tasks`)
  const files = existsSync(web) ? readdirSync(web) : []
  check('files were created in the workspace', files.length > 0, files.slice(0, 12).join(', '))
  check('worker messages were exchanged', final.messages.length > 1, `${final.messages.length} messages`)
  check('events logged', final.events.length > 1, `${final.events.length} events`)
  check(
    'every completed task records how it was verified',
    doneTasks.every((t) => t.review && t.review.trim().length > 0),
    doneTasks[0]?.review?.slice(0, 80) ?? 'no completed task'
  )
  if (existsSync(join(web, 'index.html'))) {
    check('preview auto-started a real server', Boolean(previewSeen?.url), previewSeen?.url ?? 'never became ready')
  } else {
    check('preview auto-started a real server', false, `no index.html produced (${files.slice(0, 6).join(', ')})`)
  }
  await screenshot('acceptance-floor.png')

  // Concurrency is measured, not asserted: the default chain is largely serial.
  console.log(`  measured peak concurrent sessions during the run: ${peakLive}`)

  // Stop control on whatever is still live, or on a direct instruction.
  const stillRunning = final.jobs.some((j) => j.status === 'running')
  if (stillRunning) {
    await evaluate(`window.ventriee.stopRun(${JSON.stringify(project.id)})`)
    await sleep(4000)
    const stopped = await evaluate(`window.ventriee.snapshot()`)
    check('stop halts the run', !stopped.running)
    check('no session keeps running after stop', stopped.sessions.filter((s) => s.status === 'running').length === 0)
  } else {
    const qa = final.agents.find((a) => a.role === 'qa')
    await evaluate(`window.ventriee.instructAgent(${JSON.stringify(qa.id)}, 'List the files in this workspace and summarise them in one line.')`)
    await sleep(4000)
    await evaluate(`window.ventriee.stopAgent(${JSON.stringify(qa.id)})`)
    await sleep(3000)
    const after = await evaluate(`window.ventriee.snapshot()`)
    check('stop halts a live worker', after.agents.find((a) => a.id === qa.id)?.status !== 'working')
  }

  check('no renderer console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

  app.ws.close()
  killApp(child)
  await sleep(1200)
  console.log(`  profile kept for stage B: ${A_PROFILE}`)
  return finish('A')
}

async function stageB() {
  console.log('\n=== B: restart persistence ===')
  if (!existsSync(join(A_PROFILE, 'ventriee.db'))) {
    check('stage A profile exists', false, A_PROFILE)
    return finish('B')
  }
  const memProjDir = join(A_PROFILE, 'memory', 'projects')
  const child = launchApp({ port: PORT, userData: A_PROFILE })
  const app = await connect(PORT)
  const { evaluate, errors } = app
  await sleep(2500)
  const snap = await evaluate(`window.ventriee.snapshot()`)

  check('projects survive restart', snap.projects.length === 1, `${snap.projects.length} projects`)
  check('14 workers survive restart', snap.agents.length === 14)
  check('tasks survive restart', snap.tasks.length >= 4, `${snap.tasks.length} tasks`)
  check('messages survive restart', snap.messages.length > 0, `${snap.messages.length} messages`)
  check('memory survives restart', snap.memories.length >= 6, `${snap.memories.length} docs`)
  check('no stale spinners after restart', snap.agents.every((a) => a.status !== 'working'))
  check('no session still marked running', snap.sessions.every((s) => s.status !== 'running'))
  check('history is readable after restart', snap.events.length > 0, `${snap.events.length} events`)

  const projectId = snap.projects[0].id
  const memDir = join(memProjDir, projectId)
  const memoryFiles = existsSync(memDir) ? readdirSync(memDir) : []
  check('markdown memory on disk', memoryFiles.length >= 6, memoryFiles.join(', '))
  const progress = join(memDir, 'progress.md')
  check('progress.md records the run', existsSync(progress) && statSync(progress).size > 80)

  check('no renderer console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  app.ws.close()
  killApp(child)
  await sleep(1000)
  return finish('B')
}

async function stageC() {
  console.log('\n=== C: non-web artifact end to end ===')
  rmSync(C_PROFILE, { recursive: true, force: true })
  const py = mkdtempSync(join(tmpdir(), 'ventriee-py-'))
  const child = launchApp({ port: PORT, userData: C_PROFILE })
  const app = await connect(PORT)
  const { evaluate, screenshot, errors } = app
  await sleep(1800)

  const project = await evaluate(`window.ventriee.createProject({
    name: 'Python acceptance',
    path: ${JSON.stringify(py)},
    description: 'A small python utility.'
  })`)
  await evaluate(`window.ventriee.selectProject(${JSON.stringify(project.id)})`)
  await sleep(1500)
  const fresh = await evaluate(`window.ventriee.snapshot()`)
  check('opening a python project does not execute it', ['off', 'manual'].includes(fresh.preview.status), fresh.preview.status)

  // The plan for a non-web brief must not include web-only roles.
  await evaluate(`window.ventriee.startRun({ projectId: ${JSON.stringify(project.id)}, instruction: ${JSON.stringify(
    'Write a standalone Python utility named report.py that prints exactly the line ventriee-python-acceptance-ok and exits 0. Keep it dependency free.'
  )}})`)
  const { snap: planned, timedOut: planTimeout } = await poll(
    evaluate,
    15 * 60,
    (s) => s.tasks.length > 0,
    (s, t) => process.stdout.write(`\r  planning t=${t + 3}s tasks=${s.tasks.length}   `)
  )
  process.stdout.write('\n')
  check('non-web brief produced a plan', planned.tasks.length > 0, `${planned.tasks.length} tasks${planTimeout ? ' (timed out)' : ''}`)
  check('python plan skips the design system', !planned.tasks.some((t) => t.role === 'designer' || t.role === 'frontend'))
  await evaluate(`window.ventriee.stopRun(${JSON.stringify(project.id)})`)
  await sleep(3000)

  // A direct instruction to one worker is enough to prove execution end to end.
  const backend = (await evaluate(`window.ventriee.snapshot()`)).agents.find((a) => a.role === 'backend')
  await evaluate(`window.ventriee.instructAgent(${JSON.stringify(backend.id)}, ${JSON.stringify(
    'Create the file report.py in this workspace. It must print exactly ventriee-python-acceptance-ok and exit 0. Do not create anything else.'
  )})`)
  const { snap: afterWork, timedOut: fileTimeout } = await poll(
    evaluate,
    25 * 60,
    () => existsSync(join(py, 'report.py')),
    (s, t) => {
      const a = s.agents.find((x) => x.id === backend.id)
      process.stdout.write(`\r  writing t=${t + 3}s agent=${a?.status ?? '?'}   `)
    }
  )
  process.stdout.write('\n')
  check('python file was written by a worker', existsSync(join(py, 'report.py')), fileTimeout ? 'timed out' : '')

  // The preview must classify the folder and run it for real.
  await evaluate(`window.ventriee.previewStart(${JSON.stringify(project.id)})`)
  const { snap: previewed } = await poll(
    evaluate,
    60,
    (s) => ['ready', 'error', 'manual', 'external', 'off'].includes(s.preview.status) && s.preview.status !== 'starting',
    (s, t) => process.stdout.write(`\r  preview t=${t + 3}s ${s.preview.kind}/${s.preview.status}   `)
  )
  process.stdout.write('\n')
  const logs = (previewed.preview.logs ?? []).join('\n')
  check('workspace classified as python', previewed.preview.kind === 'python', previewed.preview.kind)
  check('preview executed the utility', logs.includes('ventriee-python-acceptance-ok'), logs.slice(-140))
  check('utility exited cleanly', previewed.preview.status === 'ready', previewed.preview.status)

  // Preview must also serve a real web page, and pick up an edit.
  const html = join(py, 'index.html')
  writeFileSync(html, '<!doctype html><title>one</title><h1>first</h1>')
  await evaluate(`window.ventriee.previewRefresh(${JSON.stringify(project.id)})`)
  await sleep(4000)
  const webStart = await evaluate(`window.ventriee.previewStart(${JSON.stringify(project.id)})`)
  await sleep(3000)
  const webState = await evaluate(`window.ventriee.snapshot()`)
  let served = ''
  if (webState.preview.url) {
    try {
      served = await (await fetch(`${webState.preview.url.replace(/\/$/, '')}/`)).text()
    } catch (error) {
      served = `fetch failed: ${error.message}`
    }
  }
  check('web artifact is served over a real port', served.includes('first'), (webState.preview.url ?? webStart?.status ?? 'no url'))
  writeFileSync(html, '<!doctype html><title>two</title><h1>second</h1>')
  await sleep(3000)
  let servedAgain = ''
  if (webState.preview.url) {
    try {
      servedAgain = await (await fetch(`${webState.preview.url.replace(/\/$/, '')}/`)).text()
    } catch (error) {
      servedAgain = `fetch failed: ${error.message}`
    }
  }
  check('edits are served without a manual restart', servedAgain.includes('second'), servedAgain.slice(0, 60))

  await screenshot('acceptance-python.png')
  check('no renderer console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  app.ws.close()
  killApp(child)
  await sleep(1200)
  return finish('C')
}

let failures = 0
if (stage === 'a' || stage === 'all') failures += await stageA()
if (stage === 'b' || stage === 'all') failures += await stageB()
if (stage === 'c' || stage === 'all') failures += await stageC()
if (!['a', 'b', 'c', 'all'].includes(stage)) console.log('usage: node scripts/acceptance.mjs [a|b|c|all]')
process.exit(failures ? 1 : 0)
