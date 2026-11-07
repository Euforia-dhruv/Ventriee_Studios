---
name: webapp-testing
description: Drive a real browser with Playwright to verify a local web app before claiming a task is done.
version: 1.0.0
---

# Web app testing

Use this whenever an acceptance criterion says "works in a browser" or when a UI change was made.

1. Start the dev server in the background and wait until it responds (`curl -sf http://localhost:PORT`).
2. Write a Playwright script in `scripts/` inside the project, not in a temp folder:
   - launch chromium with `page.goto(baseUrl)`,
   - assert the critical journey with real selectors,
   - capture a screenshot on failure.
3. Read the console messages and failed network requests; silent console errors count as failures.
4. Kill the dev server when done.
5. Report exact steps, the screenshot path and the pass or fail of each assertion.

Never report "tested" without a run log or screenshot as evidence.
