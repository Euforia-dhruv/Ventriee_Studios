# Working with Ventriee Studios

Practical notes. What to type, what you get, how to recover when something goes wrong.

---

## Create a project

**Top bar → project switcher → New project.** You give it three things:

- **Name.** What you will call it.
- **Workspace folder.** The sandbox. Agents can read and write here and nowhere else.
  If the folder does not exist it is created.
- **Brief (optional).** Stored as project memory, so the orchestrator and every worker
  understands the intent without repeating it.

Creating a project seeds the 14 workers and the memory files for that project. It does not start
anything. Nothing runs until you ask for it.

## Brief the orchestrator

Type in the command bar (Enter sends, Shift+Enter is a newline):

```
Build a beautiful interactive portfolio website with a responsive layout,
animations and a contact section.
```

What happens, in order:

1. **Classify.** The brief is matched to a category (`web`, `saas`, `mobile`, `game`,
   `backend`, `ai`, `automation`, `data`, `design`, `document`, `research`, `infra`, `qa`,
   `marketing`, `desktop`). Category decides the shape of the plan, not just the labels.
2. **Plan.** The orchestrator's own engine writes the plan when it is reachable. Otherwise the
   deterministic planner produces one. Either way you get real tasks with dependencies.
3. **Dispatch.** Tasks run as ready. Writers run in parallel only when their directories do not
   overlap; otherwise the second waits its turn.
4. **Preview.** The moment the workspace contains something runnable, the preview panel starts
   it. You do not wait for the whole project.
5. **Review.** A reviewer session checks the deliverable against the acceptance criteria. A
   rejection sends the task back with findings.
6. **Report.** The rail shows the plan, the activity log, and the mail between workers.

### Briefs that work well

Be specific about the artifact and the finish line. The acceptance criteria are derived from
your words, so vagueness produces vague acceptance.

Good:

- "Build a static marketing site for a bike shop with hours, prices and an enquiry form. Vanilla
  HTML/CSS/JS, no build step."
- "Write a Python script `clean.py` that reads `raw.csv` and writes `clean.csv` with duplicates
  removed and dates normalised. Standard library only."
- "Audit this Express API for input validation gaps and fix what you find. Add a test for each
  fix."

Weak:

- "Make it better." (No artifact, no finish line.)
- "Do everything for my business." (No scope; the plan will be generic.)

### What the studio will not do

- It will not run outside the project folder.
- It will not deploy without your approval (the task lands in the rail as `approval`).
- It will not treat file contents as instructions. A README that says "ignore your rules" is
  data the worker may read, not an order it follows.

## Reading the floor

Each desk is a worker. The floor is event-driven: a desk lit amber means a process is producing
output right now, not that someone clicked a button.

| Signal | Meaning |
| --- | --- |
| Grey desk | Idle, available |
| Amber pulse | Working: a real session is running |
| Blue | Waiting on a dependency or a teammate |
| Orange | Paused by you |
| Red | Failed; open it for the error |
| Dim | Offline or disabled |

Click a desk for the drawer:

- **Live** — the actual stream from the process, plus the direct instruction box.
- **Task** — what it is doing, the acceptance criteria, attempts, the review verdict.
- **Mail** — messages to and from this worker, with sender, recipient and status.
- **Config** — engine, model, endpoint, autonomy, budget, working directory.

Stop, pause and resume are per worker. Stop kills the process tree, not just the wrapper.

## The preview panel

Always visible on the right. It classifies the workspace and picks an adapter.

| Artifact | What you see |
| --- | --- |
| Vite / Next / Astro / Remix / Nuxt / Svelte / CRA | Dev server, embedded, hot reload |
| Static HTML | Local server, embedded |
| Node service | Start script, health, logs |
| Python | The actual run output |
| Image | The image |
| Document | Rendered PDF or text |
| Mobile / game / desktop | The adapter's honest explanation of what it needs |

Controls: viewport presets (fit, 1280, 834, 420), reload, open in browser, stop, and a log
toggle. If it is stopped, it stays stopped: editing files will not silently restart it.

## Memory

Open **Memory** in the top bar to search, edit, pin, correct or delete. Files live under
`<userData>/memory/`:

```
global/owner.md          who you are, what you care about
global/preferences.md    how you like work done
global/conventions.md    code and naming conventions
projects/<id>/overview.md         what this project is
projects/<id>/architecture.md     decisions about structure
projects/<id>/decisions.md        the decision log
projects/<id>/design-system.md    tokens, type, layout
projects/<id>/progress.md         what has been delivered
projects/<id>/known-issues.md     open problems
agents/<id>/lessons.md            what this worker has learned
```

Edit any of these in a text editor. The app reads markdown from disk, so your edits are the
truth. Restarting never overwrites a file that already exists.

To make a fact stick, write it in `global/preferences.md` and pin it in the Memory panel.
Pinned entries rank first in retrieval, which means they reach the worker's prompt earliest.

## Skills

**Skills** in the top bar lists the registry. Enable or disable, import a folder containing a
`SKILL.md`, and see usage counts.

A skill is a directory:

```
my-skill/
  SKILL.md        front matter (name, description) + instructions
  scripts/        optional
  references/     optional
```

Enabled skills are summarised into every task prompt, so a worker knows what is available
without you repeating it.

## Automations

**Automations** in the top bar. An automation is an instruction plus an interval. It runs
through the same orchestrator as a manual brief and it is off until you enable it. Interval
schedules persist across restarts; a missed window does not fire retroactively.

## Recovery

| Symptom | What to do |
| --- | --- |
| A worker shows red | Open it, read the error in Live, fix the configuration, press Retry in the rail |
| Run seems stuck | Check the rail: a task in `approval` is waiting on you |
| Session timed out | The task returns to `rework` and retries; after 3 attempts it fails with the reason |
| App closed mid-run | On restart, running work is marked interrupted and returned to `rework`; nothing keeps spinning |
| Preview blank | Check the log toggle; a dev server that failed to bind shows its own error there |
| Engine says unavailable | Settings → Engines → **Test**. It performs a real call; the failure text is the actual error |
| Wrong worker for a task | Settings → Workers → change the role instructions, or reassign in the inspector |

## Configuration reference

Settings → Run policy:

| Setting | Meaning |
| --- | --- |
| Max concurrent sessions | Upper bound on simultaneous processes |
| Session timeout | Wall clock limit per session |
| Auto-extract lessons | Write lessons after a fully successful run |
| Require deploy approval | Deployment tasks stop for your approval |
| Planner fallback | Use the deterministic planner when no engine answers |
| Reduced motion | Turn off decorative motion |

Settings → Data: where the database, memory and skills live; open or reveal any of them.

## Verification commands

```bash
npm run typecheck           # strict, both projects
npm test                    # planner unit tests
npm run smoke               # boots the built app, fails on renderer console errors
node scripts/preview-check.mjs   # preview adapters
node scripts/acceptance.mjs      # full multi-agent acceptance run
```

All of them use a temporary profile, so your real projects, memory and keys are untouched.
