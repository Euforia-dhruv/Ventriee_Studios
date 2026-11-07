# Ventriee Studios — Quick start for coworkers

Ventriee Studios runs on **your machine**. Your projects, agents, memory and API keys stay local.
Nothing is shared with anyone else unless you push your project to git.

## 1. Install

- **Windows:** run `Ventriee Studios-<version>-setup.exe`. Your data lives in
  `%APPDATA%\ventriee-studios`.
- **Linux:** extract `ventriee-studios-<version>-linux-x64.tar.gz` and run `./ventriee-studios`.

## 2. Set up an engine (one-time)

Workers are real CLI agents or API calls. You need at least one:

**Option A — CLI agent (recommended, you may already have one):**
- **OpenCode:** `npm install -g opencode-ai`, then `opencode auth login`
- **Claude Code:** install from Anthropic, then `claude` and sign in
- **Codex:** install OpenAI Codex, sign in
- **Ollama:** install Ollama and pull a model, e.g. `ollama pull llama3.2:3b`

**Option B — API provider:**
Open Settings → Providers, add OpenAI/Anthropic/Gemini/OpenRouter/DeepSeek/Mistral with your key.
Keys are stored in the OS credential store, never in project files.

## 3. First project

1. **Create a project** — name it and pick a folder. Agents cannot write outside that folder.
2. **Chat** — describe the idea in the planning box. The planner asks questions; nothing runs yet.
3. **Create Prompt** — turns the conversation into a structured development prompt. Edit or Enhance it.
4. **Assign** — pick workers + models (or let the orchestrator plan), then assign. Real sessions start.
5. **Watch** — the office floor shows each worker; the right panel live-previews whatever is being built.

## 4. Team workflow

- Each person has their own local copy — collaborate by using git as usual (the agents already commit/respect git repos).
- To share the same skills and conventions, copy the `resources/skills` folder from one install to another, or share the repo's bundled skills.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "No engines" banner | Do step 2; restart the app |
| Worker fails instantly, "engine unavailable" | Check Settings → Providers shows the engine as available |
| Preview shows nothing for an API/backend | It's a service: use the API explorer (terminal icon in the preview header) |
| Agents are slow | Local models are slow; prefer a cloud provider for bigger briefs |
