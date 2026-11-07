# Ventriee Studios

**A private, local-first, multi-agent AI creation studio.**

Talk an idea through with an AI planner, turn the conversation into a development prompt,
enhance it, assign it to a team of real CLI agents, and watch them build — in a live office
floor with an always-visible preview of whatever they produce. It runs entirely on your
machine. No cloud, no telemetry, no fake workers.

![Office](artifacts/final-app.png)

---

## What it is

Ventriee Studios is a desktop app (Electron) that turns your computer into a small software
studio. It does **not** replace your tools — it orchestrates them:

- **Chat-first planning.** Describe what you want to build. The planner asks questions and
  turns the conversation into a structured development prompt.
- **Prompt builder.** Generate, edit, enhance, compare and restore prompt revisions. Nothing
  runs until you approve a prompt.
- **Assign to agents.** Pick one worker or several, choose a model per worker, or let the
  orchestrator break the prompt into tasks and route models automatically.
- **Real execution.** Workers are real CLI agent sessions (OpenCode, Claude Code, Codex,
  Gemini CLI, Ollama) or direct model APIs. No simulated steps, no fake output.
- **The office.** A live working floor where each worker sits at a desk, shows its current
  task, and streams real stdout. Click a worker to inspect, pause, stop, or send it a
  direct instruction.
- **Always-visible preview.** Web apps, static sites, node services (with an API explorer),
  Python scripts, images and documents preview live as files change.
- **Memory.** Markdown + SQLite memory, shared across projects, workers and sessions, that
  survives restarts.
- **Skills.** A 132-skill registry, categorized per worker, with every skill scanned on
  import for malicious patterns (SkillSpector-style) before it is installed.

## What you can build with it

Websites, SaaS platforms, web apps, desktop and mobile apps, APIs, backends, databases,
games, automation scripts, AI applications, prototypes, documents, data tools — anything
that can be created with code and real tools. It is not a website builder; it is a general
creation studio.

---

## Install

### Windows

Download the installer from the latest release:

- **`Ventriee Studios-<version>-setup.exe`** — NSIS installer (recommended)
- **`Ventriee Studios-<version>-portable.exe`** — portable, no install needed

Run the installer; it places the app in `%LOCALAPPDATA%\Programs\ventriee-studios` and adds
a desktop shortcut. Your data lives in `%APPDATA%\ventriee-studios` (database + markdown
memory). Delete that folder to start clean; project folders are never touched by the app.

### Linux

From the latest release, download the AppImage or `.deb`:

```bash
# AppImage
chmod +x Ventriee-Studios-<version>.AppImage
./Ventriee-Studios-<version>.AppImage

# Debian/Ubuntu
sudo dpkg -i ventriee-studios_<version>_amd64.deb
ventriee-studios
```

## Build from source

Requires Node.js 18+ and Git.

```bash
npm install
npm run dev        # development, hot reload
npm run build      # production bundle into out/
npm run dist       # package installers (Windows: nsis + portable; Linux: AppImage + deb)
```

## Getting started (5 minutes)

1. **Create a project** — give it a name and a folder. The folder *is* the sandbox:
   agents cannot read or write outside it.
2. **Talk it through** — the project opens on the chat stage. Describe the idea; the
   planner asks what it needs. Nothing is queued during this stage.
3. **Create Prompt** — turn the approved conversation into a structured development prompt.
   Edit it, or **Enhance** it into a new revision (the original is kept).
4. **Assign** — choose workers (or let the orchestrator plan), pick their models, and
   assign. Real sessions start.
5. **Watch** — the office floor lights up per session. Click a desk for the live stream,
   task, mail and config. The preview panel starts a dev server as soon as the workspace
   contains something runnable.
6. **Retry, stop, resume** — from a worker's inspector, stop or pause a session, send a
   direct instruction, or retry a failed task.

## Engines

Workers run on the engines you already have installed or configured:

| Kind | Engines |
| --- | --- |
| CLI agents | OpenCode, Claude Code, Codex, Gemini CLI, Ollama, custom executable |
| API providers | OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Mistral, Deploy, Inception (Mercury), Ollama, LM Studio, vLLM, any OpenAI-compatible endpoint |

Keys live in the OS credential store, never in project files, logs or the renderer.

## Honest limitations

- Windows is the most-tested platform; Linux builds are packaged (AppImage/deb) but less
  exercised. macOS paths exist but are not verified.
- No interactive PTY terminal in the inspector yet — sessions stream stdout live, and
  interactive CLI prompts are detected and failed fast rather than hanging.
- Git worktrees are not implemented; parallel writers are isolated by per-role directory
  claims instead.
- Cost figures are exact only for providers that report usage; others are estimated and
  labelled as such.
- The installer is not code-signed (SmartScreen may warn on Windows).

## Development

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Strict TypeScript over main/preload and renderer |
| `npm test` | Unit tests (vitest) |
| `npm run smoke` | Boots the built app over CDP, checks the shell renders, fails on console errors |
| `node scripts/workflow-check.mjs` | End-to-end gate: chat → prompt → enhance → assign → real sessions → office → providers → persistence |
| `npm run dist` | Build + package installers |

## Credits

- The pixel office engine under `src/renderer/src/office/` — MIT, from
  [munder-difflin](https://github.com/HarnessMD/munder-difflin)
- Character sprites — procedural, MIT
- Tilesets/map art — LimeZu "Modern Interiors" (license in `office/assets/`)
- Everything else — MIT

## License

MIT. See `LICENSE`.
