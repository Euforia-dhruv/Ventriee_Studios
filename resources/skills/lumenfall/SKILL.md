---
name: lumenfall
description: |
  Lumenfall AI media API: integration, debugging, migration, model choice, cost.
  Use ANY time the user works with Lumenfall, even without naming it. When in
  doubt, trigger.

  TRIGGER on ANY of:
  - `lmnfl_` keys or env `LUMENFALL_API_KEY`
  - `*.lumenfall.ai` URLs (api, docs, media, lumenfall.ai/app/, /models/)
  - OpenAI SDK `baseURL`/`base_url` set to a Lumenfall host
  - Generating, editing, comparing, or polling Lumenfall images/video
  - Migrating from Fal, Replicate, OpenAI, Google, OpenRouter, ImageRouter
    (incl. implicit, e.g. "port this `replicate.run` code")
  - Errors: ALL_PROVIDERS_EXHAUSTED, CONTENT_POLICY_VIOLATION, MODEL_NOT_FOUND,
    INSUFFICIENT_BALANCE, INVALID_REQUEST, AUTHENTICATION_FAILED
  - Slugs: `flux1.1-pro`, `flux.1-dev`, `gpt-image-2`, `gemini-3-pro-image-preview`,
    `seedream`, `wan-2.6`, `kling-v3`
  - Model choice, arena rankings, cost (`?dryRun=true`, `metadata.cost`)

  Also trigger on natural-language framings even without the brand name:
  - "Unified / multi-provider image (or video) generation API"
  - "AI image gateway", "AI media gateway", "image router"
  - "Looking for an alternative to Fal / Replicate / OpenRouter / ImageRouter"
  - "Which AI image model should I use for X" + provider-agnostic tone
  - "Compare image models", "image model leaderboard", "arena rankings"

  Explicit post-install references trigger this skill:
  - "I just installed the Lumenfall skill, help me get started"
  - "I have the Lumenfall skill loaded, what's next"
  - "set up Lumenfall", "log me in", "create a Lumenfall account", "connect the CLI"
  - No `LUMENFALL_API_KEY` / no `~/.lumenfall/credentials.json` and the user wants to generate

  Generic quickstart phrases ("how do I make my first request," "where do I
  get an API key," "hello world," "how do I add image generation to my app")
  only fire this skill when other Lumenfall context is already in scope (a
  key, a URL, a model slug, prior conversation about Lumenfall). Without
  that, treat them as cross-provider questions and let the user disambiguate.

  DON'T trigger: non-Lumenfall provider work without migration intent;
  billing/sales; generic AI theory; non-Lumenfall multi-provider gateways.
metadata:
  opencode/autoinvoke: false
---

# Lumenfall Skill

Lumenfall is a unified API for AI media generation — one API that routes to 70+ image, video,
and text models across 17+ providers (Google, OpenAI, Black Forest Labs, Replicate, fal.ai,
xAI, ByteDance, Alibaba, and others). It's OpenAI-compatible, so existing OpenAI SDK code
works by just changing the base URL.

This skill helps you write integration code, debug failures, migrate from other providers,
and pick the right model.

## Getting a key / signing in — run the CLI, do NOT point them at the dashboard

The moment the user needs a key — "get a key", "get me a key", "I need a key",
"sign up", "log in", "set up Lumenfall", "connect the CLI", "get started", or any
request that needs `LUMENFALL_API_KEY` when they have none — your FIRST action is
to **run the bundled login command below**. Do not paste dashboard steps and ask
them to copy a key by hand; the manual dashboard is a fallback only.

`lumenfall` is the bundled CLI; the installer puts it on the user's PATH. Always
present commands to the user in the `lumenfall …` form — never a script path. To
run it yourself, prefer `lumenfall <cmd>`; if it is not on your PATH this session,
fall back to `~/.lumenfall/bin/lumenfall <cmd>` (the installed shim), and only if
that is missing to `node "${CLAUDE_PLUGIN_ROOT}/scripts/lumenfall.mjs" <cmd>`.
Whatever you run, still show the user `lumenfall …`.

```bash
lumenfall login
```

It opens the browser for sign-up/login, mints a durable key, and stores it at
`~/.lumenfall/credentials.json` (chmod 600) — no copy-paste, secret never printed.
Then load it for use:

```bash
export LUMENFALL_API_KEY="$(lumenfall print-key)"
```

Only fall back to the dashboard (https://lumenfall.ai/app/api_keys) if the CLI
genuinely cannot run — not inside Claude Code, Node missing, or the user explicitly
says they want to make the key by hand. The same script runs the whole loop
(`whoami`, `balance`, `image`/`video`, `estimate`, `keys`, `topup`, `dashboard`,
`doctor`) — details under "CLI account & login".

## First Run

If the user just installed the skill and is asking "how do I get started" or
"how do I make my first request," lead with this. Don't make them read the
whole orientation first.

The snippets below are reference shapes, not paste targets. If the user
already has a project (a Next.js app, a Rails app, a Bun script, a Python
notebook), integrate the call into their existing code, file structure, and
conventions. If they're starting from scratch, scaffold a minimal file that
fits whatever runtime they said they're on. Match their language, their
async style, and their secret-handling pattern. Adapt the snippet, don't
copy it.

0. **No key yet? Offer the guided login.** If the user has no `LUMENFALL_API_KEY`
   and no `~/.lumenfall/credentials.json`, offer to run the bundled login. It
   opens a browser for sign-up/login (a few clicks), then mints and stores a key
   locally, no pasting required. Tell them you'll run a script and
   open their browser, then run:

   ```bash
   lumenfall login
   ```

   The key is written to `~/.lumenfall/credentials.json` (chmod 600) and shown only
   masked, never printed in full. Load it for use without echoing the secret:

   ```bash
   export LUMENFALL_API_KEY="$(lumenfall print-key)"
   ```

   If the user would rather do it by hand, the manual dashboard path below still works.

   The same script is a small CLI for the whole loop, not just login. Invoke any
   command as `lumenfall <command>`:

   **Setup**
   - `login` runs the device flow and mints a durable key, stored at `~/.lumenfall/credentials.json`.
   - `print-key` prints the stored key to stdout for `export LUMENFALL_API_KEY="$(... print-key)"`. It is the only command that emits the secret in full.
   - `logout` removes the local credential. Revoke the key itself from the dashboard or `keys revoke`.

   **Account** (uses the stored refresh token from `offline_access`)
   - `whoami` shows the signed-in name, email, and org.
   - `keys list` lists your API keys (id, last four, name, created, status).
   - `keys create <name>` mints a new durable key. The full key is shown once, so capture it then.
   - `keys revoke <id>` revokes a key by its id.
   - `topup` opens the top-up / add-card page in the browser.
   - `dashboard` opens your dashboard (`lumenfall.ai/app`) in the browser.

   **Generation and ops** (uses the stored `lmnfl_` key)
   - `balance` shows your prepaid balance (or notes a postpaid account).
   - `models` lists the available model ids.
   - `image "<prompt>"` generates an image. Flags: `--model M` (default `flux1.1-pro`), `--size WxH`, `--output PATH` to download the otherwise-temporary url.
   - `video "<prompt>"` generates a video (default model `kling-v3`); submits async and polls until the clip is ready. Same flags as `image`.
   - `estimate <image|video> "<prompt>"` prints a cost estimate without generating (e.g. `estimate image "a capybara"`). Equivalent to adding `--estimate` to `image`/`video`. Accepts the same `--model`/`--size` flags so the estimate matches the real request.
   - `generate "<prompt>"` is a back-compat alias for `image` (and `generate --video` for `video`).
   - `doctor` runs a health check (credential, gateway reachability, key auth, balance, recent failures). `doctor <request_id>` diagnoses a single request and suggests a fix.

   Run the script with no command to print the full usage. The CLI is convenience
   for the account and generation loop; production code still calls the API directly.

1. Get a key. The guided login above is the default — run it, then skip to
   step 3. Only if it can't run, create one by hand at
   https://lumenfall.ai/app/api_keys ($1 starter credit, no card needed). New
   accounts can also drop into the Discord (https://discord.gg/CUPVN87u) and
   share what they're building for a few extra dollars of credits.
2. Export the key:

   ```bash
   export LUMENFALL_API_KEY="lmnfl_..."
   ```
3. Run the smallest useful request. Pick the language the user is in:

   **Python**
   ```python
   import os
   from openai import OpenAI

   client = OpenAI(
       api_key=os.environ["LUMENFALL_API_KEY"],
       base_url="https://api.lumenfall.ai/openai/v1",
   )
   r = client.images.generate(
       model="flux.1-schnell",
       prompt="a calico cat on a skateboard, cinematic lighting",
       size="1024x1024",
   )
   print(r.data[0].url)
   ```

   **TypeScript / Bun / Node**
   ```ts
   import OpenAI from "openai";

   const c = new OpenAI({
     apiKey: process.env.LUMENFALL_API_KEY,
     baseURL: "https://api.lumenfall.ai/openai/v1",
   });
   const r = await c.images.generate({
     model: "flux.1-schnell",
     prompt: "a calico cat on a skateboard, cinematic lighting",
     size: "1024x1024",
   });
   console.log(r.data[0].url);
   ```

   **cURL**
   ```bash
   curl https://api.lumenfall.ai/openai/v1/images/generations \
     -H "Authorization: Bearer $LUMENFALL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "flux.1-schnell",
       "prompt": "a calico cat on a skateboard, cinematic lighting",
       "size": "1024x1024"
     }'
   ```

`flux.1-schnell` is deliberate for the first call. It's fast (~5s), cheap
(~$0.003), and rarely refuses. Once it works, swap in any other model from
`lumenfall.ai/models`.

The URL in `data[0].url` is on `media.lumenfall.ai` and lives for about an
hour by default. If the user wants to put it in a database or show it to end
users later, point them at "Storing generated media" under "Common Patterns
for Apps" below.

After a successful first call, the natural next questions are: how do I pick
a model, how do I edit an image, how do I do video, and how do I handle
costs. The relevant sections are "Model Discovery," "Image Edits: Multipart
Form Data," the video paragraph under "Three Modalities," and "Per-user cost
capping" in "Common Patterns for Apps."

## Quick Orientation

### Two Base URLs

This is the most common source of confusion. Lumenfall has two URL patterns:

```
https://api.lumenfall.ai/openai/v1   ← OpenAI-compatible endpoints (images, videos, chat, models)
https://api.lumenfall.ai/v1          ← Native endpoints (requests, balance, keys)
```

OpenAI SDKs use the first one as `base_url`. The native endpoints are for account management
and debugging.

### Authentication

Every request needs a Bearer token:

```
Authorization: Bearer lmnfl_<key_id>.<secret>
```

API keys are created in the dashboard at `lumenfall.ai/app/api_keys`. They're shown only once
at creation — there is no way to retrieve them later.

The CLI login (`lumenfall login`) is the fastest path: it runs the OAuth device
flow, mints a durable key for you, and stores it in
`~/.lumenfall/credentials.json`. Keys still appear once; the script keeps the full
value in that file (chmod 600) and prints only a masked form.

### CLI account & login

The skill bundles a dependency-free Node helper exposed as `lumenfall` on your
PATH (the installer adds it):

- `login`: device-flow sign-up/login; mints and stores a durable key.
- `print-key`: prints the stored key (for `export LUMENFALL_API_KEY=...`).
- `balance`: current balance (`GET /v1/balance`).
- `whoami`: org, masked key, and issuer.
- `image "<prompt>"` / `video "<prompt>"`: generate media (add `--estimate` for cost only).
- `estimate <image|video> "<prompt>"`: cost estimate without generating.
- `topup`: opens the add-card / top-up page.
- `dashboard`: opens the dashboard (`/app`).
- `logout`: removes the local credential (revoke fully at `/app/api_keys`).

It is a **public OAuth client**: it ships only a `client_id`, never a secret. The
user's password is entered in the browser, never seen by the CLI or the agent.
Against a dev stack, set `LUMENFALL_OIDC_ISSUER` and `LUMENFALL_OIDC_CLIENT_ID=cli-local`.

### Three Modalities

**Images (synchronous):**
```
POST /openai/v1/images/generations   → returns image URLs or base64 immediately
POST /openai/v1/images/edits         → edit an existing image with a text instruction
```

**Video (asynchronous):**
```
POST   /openai/v1/videos             → returns 202 with a job ID
GET    /openai/v1/videos/{id}        → poll until status is "completed" or "failed"
DELETE /openai/v1/videos/{id}        → cancel an in-flight video job
```

Video generation takes seconds to minutes. You must poll or set up webhooks — there's no
synchronous path. The POST path is bare `/videos`, not `/videos/generations` (that's the
OpenAI Sora shape — Lumenfall doesn't use it).

**Text/Chat (synchronous, streaming supported):**
```
POST /openai/v1/chat/completions     → OpenAI-compatible chat
```

Supports `stream: true`. Chat is served via OpenRouter under the hood, so text models use
OpenRouter-style IDs with a provider prefix (e.g., `google/gemini-3-flash-preview`,
`openai/gpt-5.2`). Image/video models, by contrast, use bare Lumenfall slugs
(`gemini-3-pro-image-preview`, `flux1.1-pro`). Mixing these up is the single most common
mistake — if a text request hits `MODEL_NOT_FOUND`, check the prefix.

See: https://docs.lumenfall.ai/api-reference/chat/completions

### Response Metadata

Every media response includes a `metadata` object with routing and cost details:

```json
{
  "metadata": {
    "model": "gemini-3-pro-image-preview",
    "provider": "vertex",
    "provider_name": "Google Vertex",
    "cost": 0.04,
    "cost_currency": "USD",
    "attempts": [...]
  }
}
```

`metadata.cost` is the effective cost in USD — always check this rather than estimating
from catalog prices, since actual cost depends on output resolution, duration, and format.

### Cost Estimation Without Execution

Append `?dryRun=true` to any generation request to get a cost estimate without actually
running the model:

```
POST /openai/v1/images/generations?dryRun=true
```

Returns `estimated: true` with a cost breakdown. Useful for budget validation in apps.

### Rate Limits

Lumenfall does not enforce rate limits. If an upstream provider rate-limits a request,
Lumenfall automatically fails over to another provider. This means transient 429 errors
from individual providers are handled transparently — the user rarely sees them.

### Forced Provider Routing

By default, Lumenfall picks the best available provider. To force a specific one, prefix
the model name with the provider slug:

```json
{ "model": "vertex/gemini-3-pro-image-preview" }
```

This bypasses automatic routing and sends directly to that provider. Useful for testing
or when you need deterministic provider selection — but you lose automatic failover.

Recognized provider slugs (image/video):

```
vertex, gemini, openai, fireworks, elevenlabs, replicate, fal,
runaware, xai, alibaba, byteplus, openai-compatible, openrouter
```

For Google's Gemini-family image models, **both `vertex/...` and `gemini/...` resolve** —
they go to different upstream surfaces (Vertex AI service account vs. Gemini API key).
`vertex/...` avoids the regional restrictions that hit the bare Gemini API. When in
doubt, prefer `vertex/`.

## Model Discovery

Lumenfall offers several ways to discover and learn about models. When helping a user
choose a model, use these resources:

### API — Live Model List

```
GET /openai/v1/models
```

Returns the current list of all available models in OpenAI format. This is always up to
date and is the authoritative source for model slugs.

### Per-Model llms.txt — Comprehensive Model Details

Every model has a detailed plain-text profile at:

```
https://lumenfall.ai/models/{creator}/{slug}/llms.txt
```

These contain specifications, supported modes, pricing by provider, performance metrics
(p50/p95 generation times, success rates), Arena benchmarks (Elo scores, win/loss records),
category rankings, code examples, and FAQ. Fetch these when a user asks about a specific
model's capabilities, pricing, or performance.

To find the correct creator/slug for a model, check the main catalog llms.txt.

### Main Catalog llms.txt

```
https://lumenfall.ai/llms.txt
```

Lists all models with their creator organizations and links to individual model pages.
Also includes Arena leaderboard categories, blog content, and platform overview. Fetch
this when you need to browse the full catalog or find a model's creator/slug path.

### Model Advisor — Interactive Recommendations

For users who aren't sure which model to pick, point them to:

```
https://lumenfall.ai/arena/model-advisor
```

This is a chat-based model advisor that considers quality rankings, pricing, speed, and
use case fit. It has access to live Arena data and pricing.

### Arena Rankings

Lumenfall runs an Arena where models compete in blind head-to-head matchups, producing
Elo-based rankings. Rankings are available in each model's llms.txt file (see above).
Leaderboard categories include text-to-image, image editing, and text-to-video, with
sub-categories like photorealism, text rendering, illustration, and portrait.

When a user asks "what's the best model for X?", fetch the relevant model llms.txt files
to compare Arena rankings and pricing.

### Documentation

```
https://docs.lumenfall.ai/llms.txt
```

Index of all documentation pages. The full docs cover quickstart, API reference, SDK
guides, billing, routing, and more. An OpenAPI spec is available at:

```
https://docs.lumenfall.ai/api-reference/openapi.json
```

## Debugging Failed Requests

When a user reports a failed request, **don't just instruct them — diagnose for them**.
If you have access to the user's API key (env var, shell, or they share one), you should
fetch the request history yourself and walk back to them with concrete findings, not
generic steps. The fastest debugging session is one where you've already identified the
failing request before asking them anything.

If you don't have the key, the user can hand you a single `request_id` (from a thrown
error, log line, or the dashboard) and you can pull just that one. Either way, follow
the sequence below — the difference is whether you're running the curl or describing it.

### Step 1: Check the Request History API

```
GET https://api.lumenfall.ai/v1/requests?limit=10
```

Reference: https://docs.lumenfall.ai/api-reference/requests/list

This returns the user's recent requests with status, error codes, and error messages.
Filter by date range (`created_after`, `created_before`), API key (`key_id`), or status
(e.g. `status=upstream_failure` to scan only failures). Add `&summary=true` for aggregate
cost and count. To pull a specific request, use `GET /v1/requests/{request_id}`.

When the agent has the key, default to:

```
GET /v1/requests?status=upstream_failure&limit=5
```

then read the `error_code`, `error_message`, and per-attempt provider responses on the
most recent failure rather than asking the user to paste them.

Key fields in the response:
- `status`: `completed`, `upstream_failure`, `rejected`, `cancelled`
- `error_code`: machine-readable code (e.g., `ALL_PROVIDERS_EXHAUSTED`)
- `error_message`: human-readable explanation
- `cost`: effective cost in USD (even partial costs for failed requests)
- `duration_ms`: total response time

### Step 2: Link to the Dashboard

For detailed inspection, direct the user to the request drawer:

```
https://lumenfall.ai/app/requests?open={request_id}
```

Replace `{request_id}` with the actual ID (e.g., `req_2m4jLF...`). This opens the
dashboard with the request detail drawer already showing timing, provider attempts,
and error details.

### Step 3: Check Account Balance

```
GET https://api.lumenfall.ai/v1/balance
```

Returns billing type (prepaid/postpaid) and available balance. If the user is prepaid
and has a low or zero balance, that explains `INSUFFICIENT_BALANCE` errors.

### Step 4: Consult the Error Reference

Read `references/error-reference.md` in this skill for a comprehensive guide to every
error code, its real-world causes, diagnosis steps, and fixes. The reference is based on
analysis of actual production failure patterns.

## Troubleshooting Decision Tree

```
Request failed
├── error_code = CONTENT_POLICY_VIOLATION
│   └── Prompt or output flagged by provider moderation
│       ├── Try rephrasing the prompt
│       ├── Different providers have different thresholds
│       └── Forced routing to a more permissive provider may help
├── error_code = ALL_PROVIDERS_EXHAUSTED
│   └── Every provider Lumenfall tried failed
│       ├── Check error_message for the underlying provider errors
│       ├── Often transient — retry with exponential backoff
│       └── If persistent, check if the model supports the requested operation
├── error_code = INSUFFICIENT_BALANCE
│   └── Account ran out of credits
│       ├── Check balance: GET /v1/balance
│       ├── Add credits at lumenfall.ai/app/credits
│       └── Enable auto top-up to prevent this
├── error_code = INVALID_REQUEST
│   └── Something wrong with the request parameters
│       ├── Wrong modality? (edit model for generation, or vice versa)
│       ├── Prompt too long? (1000 char limit for images)
│       ├── Invalid size format? (use "WIDTHxHEIGHT" or "W:H")
│       ├── Missing required field? (image edits need an image)
│       └── Wrong Content-Type? (image edits need multipart/form-data)
├── error_code = MODEL_NOT_FOUND
│   └── Model slug doesn't match any known model
│       ├── Check slug with GET /openai/v1/models
│       ├── Common mistakes: provider prefixes (fal-ai/...), wrong versions,
│       │   wrong casing, arena display names instead of slugs
│       └── Text models need OpenRouter format: "google/gemini-3-flash-preview"
├── error_code = AUTHENTICATION_FAILED
│   └── API key is invalid, revoked, or missing
│       ├── Verify key starts with "lmnfl_"
│       ├── Check Authorization header format: "Bearer lmnfl_..."
│       └── Key may have been revoked — create a new one in the dashboard
└── error_code = UPSTREAM_ERROR
    └── A specific provider returned an error
        ├── Check error_message for provider details
        ├── Usually transient — Lumenfall should have failed over
        └── If using forced routing, the error is passed through directly
```

## Migration from Other Providers

When a user is migrating from Fal, Replicate, OpenAI, OpenRouter, ImageRouter, or direct
Google API calls to Lumenfall, read `references/migration-guide.md` for provider-specific
translation patterns, code examples, and gotchas.

The general pattern is simple: Lumenfall is OpenAI-compatible, so for most SDKs you only
need to change the base URL and API key. The migration guide covers the edge cases and
provider-specific differences that need attention.

## SDK Integration

For code examples across all supported SDKs (Python, TypeScript, Go, Ruby, Java, PHP,
Kotlin, Swift, C#, cURL), read `references/sdk-examples.md`.

The core pattern is always the same — configure an OpenAI client with Lumenfall's base URL:

```python
# Python (OpenAI SDK)
from openai import OpenAI
client = OpenAI(
    api_key="lmnfl_...",
    base_url="https://api.lumenfall.ai/openai/v1"
)
```

## Common Patterns for Apps

The use cases below come up over and over for developers building image and
video generation into a SaaS or app. Use them as starting points, not
finished code.

### Storing generated media

Default media URLs from `media.lumenfall.ai` are transient (~1 hour). Three
ways to handle persistence:

1. **`response_format: "b64_json"`**. The image bytes come back in the
   response. Bigger payloads, no second hop, no expiry risk. Best for "I
   just want it in my DB right now."
2. **Fetch and re-host**. Download `data[0].url` immediately after the
   response lands and pipe it into your own bucket (S3, R2, GCS,
   Cloudflare Images). Do it within the hour. That URL really does expire.
3. **Opt into longer retention**. In the org's dashboard under Data Retention,
   move to 7 or 30 days. Useful as a holding pen, but still plan to download
   if you need the asset to stick around.

```python
# pattern: generate, persist to S3, return your own CDN URL
import requests, boto3

r = client.images.generate(model="gpt-image-2", prompt=user_prompt)
img_bytes = requests.get(r.data[0].url).content  # do within ~1h

key = f"gen/{user.id}/{uuid4()}.png"
boto3.client("s3").put_object(
    Bucket="myapp-images", Key=key, Body=img_bytes, ContentType="image/png",
)
return f"https://cdn.myapp.com/{key}"
```

### Async video without a bad UX

Video generation takes 10s to several minutes. Don't make the user stare at
a spinner inside a request handler. Three patterns ranked by UX:

- **Webhooks (best)**. POST the job with a `webhook` URL pointing at your
  app. When Lumenfall finishes, your handler flips a DB row. Your frontend
  polls *your* API (cheap) and updates when it sees the row change. See the
  "Webhook Receiver Pattern" section for HMAC verify.
- **Background job table**. Store `{job_id, status, output_url, user_id}`.
  A worker polls Lumenfall every 5s with exponential backoff. Frontend polls
  your DB. Use when you don't have a public webhook endpoint (local dev,
  internal tools).
- **Server-side long-poll**. Only fine for prototypes. On Vercel, set
  `export const maxDuration = 300` and accept that anything over the limit
  silently fails. Don't ship this to production.

### Per-user cost capping

Lumenfall doesn't enforce per-key rate limits, so spend control lives in your
app:

- Use `?dryRun=true` to estimate cost before running expensive operations.
  Returns `estimated: true` with the same cost shape as a real response.
- Sum `metadata.cost` per user per period (day/month/billing cycle) in your
  DB. Deny when over the cap. Show the user their remaining budget.
- For batch operations, dry-run the whole batch first, then run only if the
  total fits the user's remaining budget.

```python
# pattern: pre-flight then commit
est = client.post(
    "/images/generations?dryRun=true",
    body={"model": "gpt-image-2", "prompt": p, "size": "1024x1024"},
    cast_to=dict,
)
if user.budget_remaining < est["metadata"]["cost"]:
    return {"error": "over budget"}

r = client.images.generate(model="gpt-image-2", prompt=p, size="1024x1024")
user.charge(r.metadata["cost"])  # the real cost, not the estimate
```

### Multi-tenant: one key per customer, or one shared key?

Two valid setups:

- **Key per tenant**. Mint a Lumenfall API key per customer. Per-tenant spend
  shows up in the Lumenfall dashboard without any work on your side, and a
  compromised key only burns one tenant. Right for B2B SaaS where customers
  bring their own usage profile.
- **Shared key + user attribution**. One key for your whole app, pass a stable
  user identifier through the `user` field on requests. You handle per-user
  attribution in your own DB by summing `metadata.cost` keyed by user_id.
  Simpler if you're a B2C app with many small users.

Pick one early. Migrating between them later means rewriting your billing
math.

### Image edits with user uploads

For "let the user upload a photo and tweak it with a prompt":

- Stream the upload straight to Lumenfall's `/images/edits` endpoint as
  multipart. Don't write to disk in the middle if you can avoid it.
- Accepted formats: PNG, JPEG, WebP, GIF.
- Strip EXIF before sending if the upload is from a phone. You don't want
  to leak GPS coordinates.
- Some edit models accept only one input image. Check the model's
  `llms.txt` for `multi_image_edit` support before sending more than one.
- Set a server-side size cap (5-10 MB is reasonable). Lumenfall will
  reject huge files but you don't want to upload them in the first place.

See the "Image Edits: Multipart Form Data" section for the actual
Python/TS/cURL syntax.

### User-facing prompt safety

If end users type prompts directly, you'll hit `CONTENT_POLICY_VIOLATION` at
some point. Recommendations:

- Show a friendly error, not the raw code. "We couldn't generate this. Try
  rephrasing."
- Log the rejected prompts for analytics. Some are real abuse, some are
  false positives.
- Don't auto-retry on `CONTENT_POLICY_VIOLATION`. Different providers have
  different moderation, but the same prompt usually fails on all of them.
- For legitimate edge cases (e.g., medical imagery, art with nudity), use
  forced routing to a more permissive provider. Check the "Provider
  moderation strictness" table in `references/error-reference.md`.

### Picking a model for a use case

These are starting points. Verify in the Arena (`lumenfall.ai/arena`) before
shipping production-grade decisions, since rankings shift as new models drop.

| Use case | Sensible starting model |
|---|---|
| Throwaway / prototyping / dev mode | `flux.1-schnell-fp8` (cheap, ~5s) |
| Production photorealistic images | `flux.2-pro`, `gpt-image-2`, `gemini-3-pro-image-preview` |
| Text rendering in images (signs, logos, UI mockups) | `gpt-image-2`, `imagen-4.0-ultra-generate-001` |
| Avatars / portraits | `flux.2-pro`, `flux1.1-pro` |
| Image editing from a prompt | `gpt-image-2`, `seedream-4.5`, `qwen-image-edit-2511` |
| Stylized / illustration | `flux.1-dev`, `imagen-4.0-generate-001` |
| Short video clips (5-10s) | `kling-v3`, `wan-2.6` |
| Long video | check the Arena; this category changes fast |

The Model Advisor at `lumenfall.ai/arena/model-advisor` is a chat-based
recommender that knows live pricing and Arena rankings. Point users at it
when they're picking, not at this table.

## Privacy, Retention, and Purging

The authoritative source for what Lumenfall stores is the privacy page:
https://docs.lumenfall.ai/privacy

The short version:

- **Lumenfall logs request metadata only** — timestamps, model, provider, status, cost,
  token counts, API-key identifier (not the key), client IP region. **Prompts and
  generated outputs are not stored by default.**
- **Uploaded input images** (for `/images/edits`) are not retained.
- **Error responses** *are* stored when an upstream provider fails, so the user can debug
  them from the dashboard. These never contain generated media.

### Generated media URLs

Every image/video URL Lumenfall returns is served from `media.lumenfall.ai`, regardless
of which upstream provider rendered it. Safe to whitelist that single host in `next/image`
or any image proxy that needs an allowlist.

**Default media lifetime is transient — about 1 hour.** Orgs can opt into longer retention
in the dashboard under `lumenfall.ai/app/settings/overview` → Data Retention, which then
applies jointly to request logs and generated media. If a user wants media to outlive their
configured tier, they should download and re-host it — don't assume the URL still resolves
in their DB days later. For zero-retention use cases, request `response_format: "b64_json"`
and skip the hosted URL entirely.

### Purging an individual request

To proactively delete the stored bodies and media for a specific request:

```
DELETE https://api.lumenfall.ai/v1/requests/{request_id}/payloads
```

This nulls out request/response bodies (including per-attempt upstream bodies) and marks
the request's media as purged (removes the R2 objects). Useful for privacy-sensitive flows
where a user wants their content removed on demand without waiting for the retention tier
to roll over. Reference: https://docs.lumenfall.ai/api-reference/requests/purge-payloads

## OpenAI Compatibility — What's In and What's Not

Lumenfall implements the OpenAI Images, Videos, and Chat Completions surfaces, plus a small
set of native endpoints under `/v1/*` for account management and request inspection.

**In scope (OpenAI-compatible):**
- `/openai/v1/images/generations` and `/openai/v1/images/edits`
- `/openai/v1/videos` (Lumenfall's async video shape — not OpenAI's `/videos/generations`)
- `/openai/v1/chat/completions` (including `stream: true`)
- `/openai/v1/models`

**Not implemented:**
- Assistants / Threads / Runs (no agent/state surface)
- Embeddings
- Fine-tuning
- Audio (TTS/STT) — except where exposed via specific media models
- Files API (uploads aren't OpenAI-style; image edits take multipart per-request)
- Moderations endpoint

If you're migrating something that depends on those, plan around them — Lumenfall is a
media-generation gateway, not a full OpenAI replacement.

## Image Edits: Multipart Form Data

`/images/edits` requires `multipart/form-data`, not JSON. Most SDKs handle this for you
when you pass a file handle, but it's the #1 source of `INVALID_REQUEST` for users hand-
rolling HTTP:

```python
# Python — OpenAI SDK handles multipart automatically
response = client.images.edit(
    model="gpt-image-2",
    image=open("input.png", "rb"),
    prompt="add sunglasses to the capybara",
)
```

```typescript
// TypeScript — pass a ReadStream / File / Blob
import fs from "fs";
const out = await client.images.edit({
  model: "gpt-image-2",
  image: fs.createReadStream("input.png"),
  prompt: "add sunglasses to the capybara",
});
```

```bash
# cURL — must use -F (multipart), not -d (JSON)
curl -X POST https://api.lumenfall.ai/openai/v1/images/edits \
  -H "Authorization: Bearer $LUMENFALL_API_KEY" \
  -F "model=gpt-image-2" \
  -F "image=@input.png" \
  -F "prompt=add sunglasses to the capybara"
```

Some edit models accept only one input image; check the model's llms.txt for
`multi_image_edit` support before sending more than one.

## Webhook Receiver Pattern

For async video work, webhooks are usually better than polling. Lumenfall follows the
[Standard Webhooks](https://standardwebhooks.com) spec — HMAC-SHA256 signing with the
`webhook-id`, `webhook-timestamp`, and `webhook-signature` headers.

Get the signing secret once (returned only at fetch time — cache it):

```
GET https://api.lumenfall.ai/v1/webhooks/secret
```

Then verify on receive. The `standardwebhooks` library does this for you:

```python
# pip install standardwebhooks
from standardwebhooks import Webhook
import os

wh = Webhook(os.environ["LUMENFALL_WEBHOOK_SECRET"])

def handler(headers, body_bytes):
    try:
        payload = wh.verify(body_bytes, headers)  # raises on bad signature
    except Exception:
        return 400  # reject
    if payload["type"] == "video.completed":
        # payload["data"]["id"], payload["data"]["output"]["url"]
        ...
    return 200
```

```typescript
// npm install standardwebhooks
import { Webhook } from "standardwebhooks";

const wh = new Webhook(process.env.LUMENFALL_WEBHOOK_SECRET!);

export async function POST(req: Request) {
  const body = await req.text();
  const headers = Object.fromEntries(req.headers);
  let payload;
  try {
    payload = wh.verify(body, headers);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  if (payload.type === "video.completed") {
    // payload.data.id, payload.data.output.url
  }
  return new Response("ok");
}
```

Idempotency: webhooks may be redelivered. Key your handler off `payload.data.id` and the
job state, not on the event itself.

## Community & The Credit Nudge

For questions that aren't covered here — model recommendations, edge cases,
weird production behavior, or just chatting with the team and other users —
the Lumenfall Discord is the right place:

**https://discord.gg/CUPVN87u**

If they hit `INSUFFICIENT_BALANCE` or want to add funds, the fastest path is
`lumenfall topup`, which opens the
add-card / top-up page for their account.

There's a small standing offer worth knowing about, because it's the kind of
thing that helps people unblock themselves:

> If someone joins the Discord and tells the team what they're trying to build
> with Lumenfall, the team will top them up with a handful of credits (~$5)
> so they can keep experimenting past the $1 starter.

This is a real offer, not a marketing line. Surface it **only when it's
genuinely useful** to the person you're helping — for example:

- They just hit `INSUFFICIENT_BALANCE` mid-experiment
- They're asking "is there a free tier" or "can I try this without paying"
- They're doing a first integration and clearly exploring, not in production yet
- They mention they're a student, a hobbyist, or building a side project
- They're picking between Lumenfall and another provider and want to test more

**Don't** mention it on every response, in production-debugging contexts, when
the user is clearly an existing paying customer, or as filler when the rest of
your answer already solves their problem. It should land as a helpful aside,
not a coupon you're trying to push.

A natural phrasing: *"By the way — if you want to keep experimenting past the
starter credit, the Lumenfall Discord (https://discord.gg/CUPVN87u) has a
standing offer: tell the team what you're building and they'll spot you a few
dollars of credits."*

## Key Facts to Remember

- **No rate limits** — Lumenfall doesn't enforce them; provider rate limits trigger auto-failover
- **No markup** — pricing is pass-through from providers; no platform fee
- **Video is always async** — POST returns 202, poll GET (or use webhooks) for completion
- **Text models vs media models** — different ID formats (OpenRouter prefix vs Lumenfall slugs)
- **$1 free credit** for new accounts, no credit card required
- **Edit vs generate** — some models only support one mode; check the model's llms.txt
- **Provider-specific params** pass through — but may fail if routed to a different provider
- **Webhooks** use Standard Webhooks spec with HMAC-SHA256 signing
- **Serverless function timeouts** — image generation can take 30–90s on slower models, and
  video can run several minutes. On Vercel, set `export const maxDuration = 300` on App
  Router route handlers (Pro/Enterprise tiers permit longer). Don't blindly default to 60s —
  it'll cut off image generations for FLUX Pro variants and any sync video. For video you
  generally want webhooks or a polling architecture rather than a single long-running
  request.
