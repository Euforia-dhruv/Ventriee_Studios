# Reference comparison

The brief named six repositories to evaluate for reuse, plus a wider set of office/agent
products to compare against. This is what was actually checked, and what it changed.

## Rule applied

Nothing proprietary was copied. Code reuse required a permissive license and a clear fit.
Where a repository had no license file, it was read for ideas only, because "public on GitHub"
is not a license to copy.

## Repositories inspected

| Repository | License | Language | Verdict |
| --- | --- | --- | --- |
| [HarnessMD/munder-difflin](https://github.com/HarnessMD/munder-difflin) | MIT | JavaScript | Closest architectural peer. Reuse the *approach*, not the code. |
| [anthropics/skills](https://github.com/anthropics/skills) | None declared | Python | Read for `SKILL.md` layout only. No license, so no copying. |
| [Grail-Computer/Self-Improving-Agent](https://github.com/Grail-Computer/Self-Improving-Agent) | None declared | Markdown | A single `AGENTS.md` template. Idea only. |
| [dot-opencode/memory](https://github.com/dot-opencode/memory) | MIT | Rust | Three-level file memory. Confirmed the design, no code needed. |
| [openai/skills](https://github.com/openai/skills) | None declared | Python | Skill catalogue shape. No license, so no copying. |
| [OpenWorkai/skills](https://github.com/OpenWorkai/skills) | None declared | none | Empty catalogue at time of check. Nothing to evaluate. |

License data read from the GitHub API on 2026-11-05. Stars, language and archive status were
recorded at the same time. A "None declared" license means there is no `LICENSE` file, which
defaults to all rights reserved: usable as a design reference, not as source.

### What each one changed here

**munder-difflin (MIT).** The pitch is an office of agents on your machine, which is the same
premise, so the interesting question was where it diverges. It renders an office and drives
CLI agents; two things it does not do are enforced evidence and durable layered memory. Those
became the parts this project invests in hardest. What was borrowed is the framing: a floor of
desks is a better status display than a list of rows, because idle and busy are readable at a
glance and the office metaphor survives a 14-worker roster. No files were copied.

**anthropics/skills.** The `SKILL.md` convention (front matter with name and description,
instructions in prose, optional `scripts/` and `references/`) is now the registry format here.
The format itself is a convention, not copyrightable code, and it means skills written for other
tools can be dropped in unchanged.

**Grail-Computer/Self-Improving-Agent.** Proposes an `AGENTS.md` that the agent rewrites as it
learns. Rejected as a mechanism: an agent editing its own operating rules is exactly the failure
mode the brief forbids ("never silently rewrite core instructions or security rules"). The
useful residue is the idea that learning should be recorded as durable text, which is why
lessons live in `agents/<id>/lessons.md` and are written by the orchestrator after evidence,
not by the worker about itself.

**dot-opencode/memory (MIT).** Validates three-level file memory: global, project, agent. That
structure is what `src/main/memory.ts` implements, with markdown as the source of truth and
SQLite as an index. Its implementation is Rust with symlinks; this project needed neither, so
the shape was adopted and the code was not.

**openai/skills.** A catalogue rather than a system. Useful for confirming that a skills
registry needs version and description fields. No license, so nothing copied.

**OpenWorkai/skills.** No content at check time. Recorded for completeness.

## Products compared

Named in the brief but not source-available, so compared on behaviour only: Munder Difflin,
Swarmterm, Paseo, Pane, The Cog, Agent Office, ForgeStudio, Fusion, Ekko Studio, Alethe.

The pattern across all of them is the same split: a floor or terminal view that looks alive,
backed by agents that narrate their own progress. None of them answer the question this project
has to answer, which is *can the owner trust the report?* That is why the differentiators here
are evidence digests, reviewer verdicts written by a separate worker, bounded retries, and an
approval gate before a deploy.

## What was deliberately not reused

- **Electron-to-browser migrations.** Several of these products run agents in a browser tab
  against a remote service. The brief requires local-first, so a desktop shell with a local
  SQLite database and local processes was kept.
- **Terminal-only interfaces.** A grid of raw terminals is honest but does not scale to 14
  workers on one screen. The live stream is per-worker in the inspector instead.
- **Self-modifying instructions.** Rejected outright, as above.
- **Copied CSS or assets.** The visual language here is graphite, amber, and a floor grid,
  written from scratch.
