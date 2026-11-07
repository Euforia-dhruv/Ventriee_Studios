---
name: evidence-first-delivery
description: How Ventriee workers prove a task is finished instead of describing it.
version: 1.0.0
---

# Evidence-first delivery

A task is finished only when something external proves it.

Acceptable evidence, strongest first:

1. A passing test run, with the command and the summary line.
2. A successful build or typecheck, with the command and result.
3. A browser run with a screenshot and the console clean.
4. Real file diffs in the workspace, listed by path.

Not evidence: your own description of what you would do, a plan, a summary of intent.

Before finishing:

- Run the project's own checks (typecheck, build, test). If none exist and you added non-trivial logic, add one small test.
- List the files you changed with their paths.
- State anything you could not verify, plainly.

If a check fails and you cannot fix it, report the failure with the exact output instead of claiming success.
