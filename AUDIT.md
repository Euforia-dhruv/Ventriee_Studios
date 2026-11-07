# Audit

A full pass over the studio as it stands: gates, a real end-to-end run with real CLI workers, and a
read of every main-process module. Findings are ranked by what would actually hurt you.

Date: 2026-11-06. Build audited: `out/` from this working tree.

---

## Verdict

The studio is real. It plans, dispatches, spawns actual CLI sessions, writes files into the project
folder, routes messages, persists everything across restart, and shows the truth when something
fails. The office is a working render of that state, not decoration.

Two things stopped it from being trustworthy as a hands-off studio. Both were fixed after this
first pass:

1. A scheduler bug killed every dependency chain after the first task. **Fixed and
   regression-tested.**
2. It could generate a project it could not preview, because nothing installed dependencies.
   **Fixed:** the preview detects a missing `node_modules`, shows the exact install command, and
   runs it only when you click, or automatically before a start you asked for.

The six gaps this report originally ranked are now closed, one deliberately by narrowing scope
rather than adding a feature. See "Gap status" below.

---

## Fixed in this pass

| Fix | Why it mattered | Evidence |
| --- | --- | --- |
| Dependency promotion ran before `pending` was computed | `runQueue` computed the pending list, then promoted `blocked` → `ready`, then checked `!pending.length` against the stale list. Every chain stopped after its first task. | Old run: 8 tasks, 0 done, one 619 s designer session. New run: first task done at t=264 s, chain continued. `tests/queue.test.ts`, 5 cases, was written first and failed. |
| Per-worker budget was stored, never enforced | A worker could spend past its limit indefinitely. | `store.agentSpend` + hard stop before `runTask`. |
| Review could claim an independent review that never ran | A task was marked with a review verdict when the reviewer engine was unavailable. | Label now reads `Evidence pass only - independent review did not run (<reason>)`. |
| Secrets could reach logs and the UI | CLI output was stored and rendered verbatim. | New `src/main/redact.ts`, 60 s secret cache, wired through the orchestrator. Unit-tested. |
| `.office-canvas` had no base style after the CSS cleanup | Canvas sized by attribute instead of the stage. | Restored `position: absolute; inset: 0`. |

## Gates, all green after the fixes

```
npm run typecheck   clean (node + web projects)
npm test            29/29 in 4 files (planner, paths, redact, queue)
npm run build       clean
npm run smoke       app mounts, zero console errors
node scripts/concurrency-check.mjs   PASS, two real CLI sessions overlapped
node scripts/preview-check.mjs       PASS, static server, reload on edit, python run
node scripts/office-check.mjs        canvas renders, real character click opens inspector
node scripts/office-live.mjs         worker seated and typing during a real session
```

## Acceptance run (real CLI, real model, 60-minute window)

`node scripts/acceptance.mjs a` → **15/17**. `b` (restart and persistence) → **11/11**.

What passed: 14 workers seeded, 51 memory docs, model-availability probe, tasks with acceptance
criteria and dependencies, at least one task completed, no task stuck in `running`, files created in
the workspace, messages exchanged, events logged, verification recorded on completed tasks, stop
halts a live worker, zero renderer console errors. Stage B confirmed projects, workers, tasks,
messages, memory, markdown project files and readable history all survive a restart.

Two failures, both honest and both explained:

**1. `plan came from the model, not the fallback`.** The run logged `Model plan was unusable`. I
probed the parser directly with real `opencode run` output and it parses correctly, so the gap is
upstream: the planning session hit its 4-minute timeout (or returned empty text) on this machine.
A generous timeout does not fix a slow backend; the deterministic planner took over and produced a
usable plan, which is the designed fallback. Treated as an environment limit, not a code defect.

**2. `preview auto-started a real server`.** The workspace genuinely built an Astro app, and the
preview classified it correctly, then ran `npm run dev`, which failed with `'astro' is not
recognized`. The workers wrote `package.json` but nothing runs `npm install`. That is the gap below.

---

## Gap status

All six are closed. One was closed by narrowing scope instead of adding a feature, and that is
stated plainly rather than hidden.

| # | Gap | Status | What actually changed |
| --- | --- | --- | --- |
| 1 | No dependency install before preview | **Fixed** | `artifact.ts` reports `needsInstall` + the exact command (lockfile-aware: pnpm/yarn/bun/npm). The preview panel shows that command and runs it on one click; `start()` installs first when you asked for a start. Opening a project never installs, because that would run lifecycle scripts the owner did not approve. `tests/artifact.test.ts`. |
| 2 | No installer or distributable | **Fixed** | `electron-builder.yml` (NSIS setup + portable, x64) and `npm run dist`. Verified here: setup 130.6 MB, portable 112.2 MB, bundled skills present in `resources/skills`, packaged exe boots and renders. Default Electron icon and no code signing. |
| 3 | Database has no migration versioning | **Fixed** | Ordered `MIGRATIONS` with `PRAGMA user_version`. Each pending migration runs in its own transaction with the version bump inside it, rolling back on failure. Pre-versioning profiles are adopted safely because every statement is idempotent. `tests/db.test.ts`. |
| 4 | Plan reliability depends on a slow backend | **Fixed as a decision, not a speedup** | The 4-minute cap stays. `plannerFallback` was a stored setting that nothing read; it now decides the behaviour. On: the deterministic plan runs and the job says so. Off: the run fails with a message naming the setting, instead of silently substituting. The job row records which planner produced the plan. |
| 5 | Serialization instead of worktrees | **Accepted, documented** | A worktree per writer buys parallelism and costs a merge back into the owner's folder, where a conflict is destructive. Claims are slower and never lose work. Non-writing roles already run concurrently. Rationale in `ARCHITECTURE.md`, and the limit in `README.md`. |
| 6 | No PTY | **Failure mode closed** | Sessions stay pipes; a PTY means a native dependency and this app has none. What changed: `detectInteractivePrompt()` spots an unmistakable question, kills the tree immediately, and reports the exact line, instead of burning the whole session timeout on a prompt that can never be answered. `tests/prompt.test.ts`. |

## What I checked and found sound

- **Planner** classifies by real signal (15 categories), parses fenced and aliased model output with
  guards, orders topologically, and never silently assigns work to the orchestrator.
- **Preview** only auto-starts `web`/`node`/`static`, never executes on project open, serves static
  files in-process with a path guard and `no-store`, parses ports from real output, and reports a
  non-zero exit as an error instead of a fake success.
- **Artifact classification** reads actual contents in a fixed precedence, so a folder of Python is
  not mistaken for a website.
- **Renderer cannot touch disk or spawn.** Every call is a named method landing in a validating
  `ipcMain.handle`, with path checks against project roots.
- **One SQL writer.** `store.ts` owns every statement; `deleteProject` cascades all eight tables.
- **Memory is markdown-first**, front-matter, never clobbers, scored retrieval, reindexed on boot.
- **No leftover `TODO`, `FIXME` or `HACK` comments.** The only matches for those strings are the real
  `todo` task status and the `TodoWrite` tool name.

## How to reproduce

```bash
npm run typecheck && npm test && npm run build && npm run smoke
node scripts/acceptance.mjs a     # 60 min, real agents
node scripts/acceptance.mjs b     # restart persistence
node scripts/dbdump.mjs <profile>/ventriee.db
node scripts/events.mjs <profile>/ventriee.db
```

Every script runs against a temp `VENTRIEE_USERDATA` profile and never touches your real data.
