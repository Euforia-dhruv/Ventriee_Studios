# Architecture

Electron + React + TypeScript. One renderer window, one main process, no network services.

```
src/
  shared/        types.ts, ipc.ts        the contract both sides compile against
  preload/       index.ts                the only bridge; exposes an explicit method list
  main/          index.ts                Electron bootstrap, IPC registration, scheduler
                 db.ts                   SQLite (node:sqlite, no native deps)
                 store.ts                all reads/writes; the single writer to the DB
                 orchestrator.ts         planning, scheduling, evidence, review, control
                 planner.ts              brief classification + deterministic fallback plan
                 engines.ts              per-CLI and per-API adapters, detection, probing
                 cli.ts                  process spawning, timeouts, stall watchdog, tree kill
                 preview.ts              preview service, watchers, artifact serving
                 artifact.ts             workspace classification by real contents
                 memory.ts               markdown memory tree + retrieval
                 skills.ts               SKILL.md registry
                 roles.ts                the 14 worker templates
                 credentials.ts          safeStorage-encrypted keys
                 exec.ts                 which/execCapture with Windows shim ranking
  renderer/      src/                    React UI, zustand store, no fs, no shell
                 src/office/             vendored munder-difflin office engine (pixi)
```

## The office floor

The floor is a real tile-rendered office, not a card grid. `src/renderer/src/office/` holds the
engine ported from [munder-difflin](https://github.com/HarnessMD/munder-difflin) (MIT; see
`LICENSE-MUNDER-DIFFLIN.md` and `src/renderer/src/office/assets/LIMEZUASSETS-LICENSE.txt` for the
LimeZu tilesets, which require credit). It renders a Tiled map (`assets/office.tmj`) with three
tilesets, a camera that fits the map to the viewport, BFS pathfinding, and procedurally drawn
character sprites (`portraitArt.ts`, no third-party character art).

`components/OfficeFloor.tsx` is the only adapter between that engine and Ventriee state:

- **Seat = desk index.** `Agent.desk` indexes the desk spawn points, so a worker keeps the same
  desk across restarts. The orchestrator gets the corner office.
- **Status = behaviour.** `working` sits and types with the monitor lit and the live task in a
  speech bubble; `waiting` stands at the desk; `paused` shows the looping glyph; `error` walks to
  the entrance area with the blocked glyph and the real error text; `offline` fades to 45%;
  `idle` wanders the floor and stays silent unless it has something real to say.
- **Messages = paper envelopes.** A message row inserted in the database flies from sender desk to
  recipient desk, coloured by message type. Nothing is animated that did not come from an event.
- **Selection = inspector.** A click on a character sets `selectedAgentId`, which opens the same
  inspector drawer the roster uses. The camera nudges toward the selected desk.
- **Reduced motion.** With `prefers-reduced-motion` there is no wandering, no cheering and no
  ambient bubble chatter.

The DOM around it stays accessible: the Office/List toggle gives a keyboard-navigable roster table
with the same data, and the canvas carries an `aria-label` describing it.

## Why these boundaries

**The renderer cannot touch the disk or spawn anything.** It calls named methods on
`window.ventriee`. Every one of those calls lands in an `ipcMain.handle` in `main/index.ts`,
which validates arguments and, for anything path-shaped, checks the path against the active
project roots (`isSafePath`). A compromised renderer gets the same restricted surface a
malicious page would.

**`store.ts` is the only module that writes SQL.** The orchestrator asks it for state and
tells it about changes; it never holds a statement. That keeps the schema in one file and makes
"what survives restart" a single question with a single answer.

**The orchestrator owns process lifecycle.** The preview service is separate because a preview
is not a task: it outlives tasks, it is owned by the project, and it must keep serving while the
queue is idle.

## Talking before running

The chat layer is deliberately a separate service, not a mode of the orchestrator.
`planning.ts` owns it and its whole job is to produce text.

```
sendChat        → one stored transcript per project
createPrompt    → a PromptDoc with twelve fixed sections
enhancePrompt   → a NEW revision, parentId → the one it improved
savePromptEdit  → a NEW revision, source 'edited' or 'restored'
```

Three properties keep planning honest:

- **Nothing here queues work.** No function in `planning.ts` inserts a task or spawns a process.
  The only path from a conversation to execution is `assignPrompt`, which is called by an
  explicit click and records who approved what.
- **History is append-only.** An edit, an enhancement and a restore each insert a row. The
  version you approved is still there afterwards, which is what makes compare and restore real
  rather than a UI trick.
- **The brief is normalised.** `ensureSections` promotes whatever heading style the model chose
  to the canonical twelve, and marks sections the conversation never covered as unanswered
  instead of letting a model invent them.

Assignment closes the loop: the brief plus the recent transcript go into the task prompt, and
each selected worker's engine, model and endpoint are written to the agent row *before* the
session starts. That write is why the model shown in the picker is the model that runs.

## The run loop

```
startRun(projectId, instruction)
  ├─ guard: project exists, workspace exists, no active job
  ├─ ensureRoster: seed 14 workers only if the project has none
  ├─ insert Job(status=running)
  └─ executeJob (async, not awaited by IPC)
        ├─ makePlan
        │    ├─ retrieve memory, build the planning prompt
        │    ├─ model plan via the orchestrator's own engine  → parsePlanAnswer
        │    └─ else heuristicPlan(classifyBrief(instruction))
        ├─ persistPlan: topological insert, then dependency patch
        ├─ runQueue
        │    ├─ promote blocked tasks whose dependencies are done
        │    ├─ pick ready tasks: agent enabled, not paused, not already running,
        │    │  and write scope disjoint from every live writer
        │    ├─ runTask (concurrent, capped by maxConcurrentSessions)
        │    └─ repeat until nothing is ready, running, or in review
        ├─ extractLessons if every task passed
        └─ close the Job as done / failed / stopped
```

`runTask` is where truth is enforced:

1. Task → running, agent → working, session row inserted. The row records the engine, model
   and reasoning effort the session actually used, so a finished run can be explained without
   trusting the worker's own summary.
2. Retrieve memory for this task; read the worker's unread mail; list enabled skills.
3. Snapshot the evidence digest **before** the session.
4. Run the engine with the task prompt, streaming chunks to the renderer as they arrive.
5. Snapshot the digest **after**. A code role with no changed files fails the evidence check
   regardless of what the agent said.
6. Review: a reviewer session returns `{verdict, reasoning, blockers}`. Fail → task goes to
   `rework` with the findings attached, bounded to 3 attempts. `parseVerdict` accepts a JSON
   object buried in CLI chatter; if no verdict can be read, the task is marked done with
   `Evidence pass only — independent review did not run (<reason>)` rather than claiming a pass
   that never happened.
7. Pass → `done`, progress appended to markdown memory, lesson extracted, skill usage counted.

## Evidence, not claims

`evidenceDigest(root)` records file mtimes (excluding `node_modules`, `.git`, build output)
plus `git status` when the folder is a repo. Comparing before and after answers "did anything
actually change", and it is independent of the agent's own report.

This is the reason the pipeline cannot report a false success: the reviewer sees the digest, the
acceptance criteria, and the session output, and its verdict is what moves the task forward. The
reviewer itself can fail, and that is recorded too.

A model that cannot touch disk delivers files as `=== FILE: path ===` blocks and the studio writes
them. A body wrapped in one fence from top to bottom is unwrapped before writing, because models
habitually return source inside a ``` fence and a verbatim copy does not compile. Markdown is
exempt: there the fences are content. A reviewer caught exactly this, which is why the unwrapping
has its own test and a check that runs it through the app. Paths that escape the workspace, point
into `node_modules`/`.git`, or repeat the hint's own placeholder (`path/relative/to/workspace`) are
refused: a model copied that placeholder verbatim once and wrote a junk file named `path`.

## Parallelism

Two sessions may write at the same time only if their claimed directories do not share a
top-level path.

| Role | Claims |
| --- | --- |
| architect | `docs` |
| designer | `docs`, `public`, `styles`, `assets` |
| frontend | `client`, `web`, `src`, `app`, `pages`, `components`, `public`, `index.html` |
| integration | `client`, `web`, `src`, `middleware`, `config` |
| backend | `server`, `api`, `db`, `prisma`, `migrations`, `worker` |
| qa | `tests`, `e2e`, `test` |
| seo, aeo | `public`, `docs` |
| fixer, deployment | everything (`*`) |

Claims are top-level on purpose: `package.json`, lockfiles and `tsconfig` sit at the root and
are shared by anything inside the repo. `fixer` and `deployment` claim `*`, so they serialize
against everything, which is correct because a fix can touch any file.

Non-writing roles (researcher, reviewer, monitoring) claim nothing and never block a writer.

**Why claims and not git worktrees.** A worktree gives each writer its own checkout, but it also
creates a merge back into the owner's folder, and a conflict there is either destructive or a
manual job. Claims are slower and never lose work: a writer simply waits for a free directory. The
cost is throughput, not correctness, and for a project of this size the difference is small because
non-writing roles (which dominate the early plan) run concurrently anyway. Worktrees would become
worth it if the studio ever fanned ten writers into one root, which it does not today.

## Preview

`profileProject(root)` reads the workspace and returns `{kind, label, devCommand, entry,
runCommand, needsInstall, installCommand, notes}`. Detection order matters: a Vite project with
an `index.html` is a web project, not a static site.

`needsInstall` is true when `package.json` declares packages and `node_modules` is absent;
`installCommand` honours whichever lockfile the workers actually wrote (`pnpm`/`yarn`/`bun`,
else `npm install`). It is attached inside `profileProject` so every caller, the preview and the
UI alike, sees the same answer.

`PreviewService` keeps a state object per project:

- **web** — spawn the dev command, parse the port out of the log, serve the URL to the iframe.
- **static** — serve the folder from an OS-assigned port.
- **node** — run the start script, show logs and health.
- **python / script** — run once, show output.
- **image / document** — read the file back over IPC as a data URL (8 MB cap, root-checked).
- **unknown** — say so, offer nothing fake.

A 2 s mtime fingerprint watcher bumps `revision` on real changes; the renderer reloads the
iframe on that number. The watcher also re-classifies a formerly empty workspace the first time
it becomes runnable, and auto-starts web/static/node previews. Scripts and one-shot runs never
auto-start: opening a project must not execute code.

## Memory

Markdown is the source of truth; SQLite indexes it for search and metadata.

```
<userData>/memory/
  global/            owner.md, preferences.md, conventions.md
  projects/<id>/     overview, architecture, decisions, design-system, progress, known-issues
  agents/<id>/       identity, lessons, working-memory
  sessions/
  skills/
  index.md
```

Front matter carries source, timestamp, project and confidence. `retrieve()` scores by keyword
overlap, pinned flag and recency, then `promptBlock()` renders the winners into the task prompt
as quoted context, never as instructions. That distinction matters: project content is data. A
README that says "ignore your rules" is text the worker is asked to consider, not a directive it
must obey. The only instruction channel is the owner's brief.

Ensuring files is non-clobbering: `ensure()` writes a template only when the file is absent, so
restarting the app never overwrites owner edits.

## Process control

`runCli` spawns with `shell: false` and pipes. On Windows, a `.cmd`/`.ps1` target is wrapped in
its host interpreter; killing the wrapper alone leaves the real process alive, so termination
goes through `taskkill /pid <pid> /T /F`. Three guards exist: a wall-clock timeout, an
inactivity watchdog (`stallMs`, default a quarter of the timeout), and an abort signal from the
UI. All three converge on the same tree kill, and a `settled` flag makes the promise resolve
exactly once.

Prompts are piped over stdin, never passed as arguments. This is not stylistic: a multi-line
brief handed to `cmd.exe` gets parsed as commands, and a quote inside it leaves the session
blocked on stdin forever. That was a real hang found by the acceptance run.

## Credentials

Keys are encrypted with Electron `safeStorage` and stored in the `kv` table. Environment
variables are a read-only fallback (`OPENAI_API_KEY` and friends). The renderer can write a key
and can ask whether one exists, but never receives the value back. Engine output is passed
through the same boundary, so a key present in a log line is not rendered.

## Failure behaviour

- Engine unreachable → the deterministic planner runs, so a brief never dead-ends.
- Session timeout or stall → task fails with a specific message, retried up to 3 times.
- Review rejection → `rework` with the reviewer's findings in `review`.
- App killed mid-run → on boot, running sessions become failed, working agents idle, running
  tasks return to `rework`, running jobs are closed as "Interrupted by app restart".
- Preview crash → status `error` with the log tail in the panel; retry is one click.
