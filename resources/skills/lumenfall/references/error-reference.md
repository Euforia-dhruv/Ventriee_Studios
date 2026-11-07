# Lumenfall Error Reference

This reference covers the most common errors developers encounter when using the Lumenfall
API, based on real production data. For each error, you'll find what it means, why it
happens, how to diagnose it, and how to fix it.

## Error Response Format

All Lumenfall errors follow this structure:

```json
{
  "error": {
    "message": "Human-readable description of what went wrong",
    "type": "error_category",
    "code": "MACHINE_READABLE_CODE"
  }
}
```

Use `code` for programmatic handling. Display `message` to end users.

---

## 1. CONTENT_POLICY_VIOLATION (HTTP 400)

**What it means:** The prompt, input image, or generated output was flagged by the upstream
provider's content moderation system.

**Why it happens:** Each provider runs its own content moderation. Thresholds vary
significantly — a prompt that works on one provider may be rejected by another. This is
the single most common error, accounting for over half of all failures.

**Models most affected:** grok-imagine-image, grok-imagine-video, flux.1-schnell-fp8,
and models routed through providers with stricter moderation (fal, Replicate).

**How to diagnose:**
1. Check `error.message` — it often includes the flagged category (e.g., "sexual", "violence")
2. Review the prompt for content that might trigger moderation
3. If using image editing, the input image itself may be flagged

**How to fix:**
- Rephrase the prompt to avoid triggering moderation
- Try forced routing to a provider with different moderation thresholds:
  `"model": "vertex/gemini-3-pro-image-preview"`
- If the content is legitimate, some providers are more permissive than others — check
  which provider flagged it via the request drawer at
  `lumenfall.ai/app/requests?open={request_id}`

---

## 2. ALL_PROVIDERS_EXHAUSTED (HTTP 502)

**What it means:** Lumenfall tried every available provider for the requested model and
all of them failed.

**Why it happens:** This is a cascading failure. Common underlying causes include:
- All providers having transient issues simultaneously
- The model parameters being incompatible with available providers
- Content moderation rejecting the prompt across all providers
- Provider quota exhaustion or outages

**How to diagnose:**
1. Check `error.message` — it describes what the last provider reported
2. Query the requests API: `GET /v1/requests?limit=1` to see the full attempt chain
3. Open the request drawer to inspect each provider attempt individually

**How to fix:**
- **If transient:** Retry with exponential backoff. Provider issues usually resolve quickly
  as Lumenfall continuously monitors provider health and routes around degraded ones.
- **If content-related:** The prompt may be triggering moderation on every provider.
  Rephrase and retry.
- **If persistent for a specific model:** The model may have limited provider availability.
  Try a different model or check the model's llms.txt for available providers.

---

## 3. INSUFFICIENT_BALANCE (HTTP 402)

**What it means:** The account's prepaid balance is too low to cover the estimated cost
of the request.

**Why it happens:** Prepaid accounts must have enough credits before each request. The
most commonly affected model is gemini-3.1-flash-image-preview, simply because it's
the most popular model — users burn through credits quickly.

**How to diagnose:**
```
GET https://api.lumenfall.ai/v1/balance
```
Returns the current balance and billing type.

**How to fix:**
- Add credits at `lumenfall.ai/app/credits`
- Enable auto top-up in billing settings to prevent this from recurring
- Use `?dryRun=true` to estimate costs before committing to expensive operations
- Postpaid (invoice) billing is available by request for higher-volume users

**If this is someone exploring or doing a first integration:** mention the
Discord credit nudge — tell them to drop by https://discord.gg/CUPVN87u, share
what they're building, and the team will spot them a handful of credits ($5)
to keep experimenting. See the "Community & The Credit Nudge" section in
`SKILL.md` for when to surface this vs. when not to.

---

## 4. INVALID_REQUEST — Edit vs. Generate Confusion (HTTP 400)

**What it means:** The request used the wrong endpoint for the model's capabilities.

**Why it happens:** Some models only support text-to-image generation, others only support
image editing, and some support both. Sending a text-to-image request to an edit-only model
(or vice versa) produces this error. This is the most common form of INVALID_REQUEST.

**Common cases:**
- Sending generation requests to edit-only models: `qwen-image-edit-2511`, `p-image-edit`,
  `riverflow-2-max-preview`, `riverflow-2-fast-preview`
- Sending edit requests to generation-only models: `flux.1-schnell-fp8`, `flux.1-dev`,
  `imagen-4.0-ultra-generate-001`, `stable-diffusion-3.5-large`, `lucid-origin`

**Error message pattern:**
```
Model 'qwen-image-edit-2511' does not support text-to-image. Supported modes: image-edit
Model 'flux.1-schnell-fp8' does not support image editing
```

**How to fix:**
- Check the model's supported modes in its llms.txt:
  `lumenfall.ai/models/{creator}/{slug}/llms.txt`
- Use `/images/generations` for text-to-image models
- Use `/images/edits` for image editing models
- Models that support both will accept either endpoint

---

## 5. MODEL_NOT_FOUND (HTTP 404)

**What it means:** The model slug in the request doesn't match any model in Lumenfall's catalog.

**Why it happens:** Developers use the wrong identifier format. Common patterns:

| Mistake | What they sent | Correct format |
|---|---|---|
| Provider-native ID | `fal-ai/flux-1-schnell` | `flux.1-schnell` |
| Fireworks path | `accounts/fireworks/models/flux-1-schnell-fp8/text_to_image` | `flux.1-schnell-fp8` |
| Wrong version | `wan-2.7` | `wan-2.6` |
| Wrong casing | `GPT-IMAGE-1.5` | `gpt-image-1.5` |
| Arena display name | `nano-banana-2` | `gemini-3.1-flash-image-preview` |
| Provider prefix in slug | `xai/grok-imagine-image` | `grok-imagine-image` |
| Non-existent model | `gemini-banana` | Check the catalog |

**How to diagnose:**
- Lumenfall often suggests alternatives: `"Did you mean 'wan-2.6'?"`
- List all models: `GET /openai/v1/models`

**How to fix:**
- Use exact Lumenfall slugs — find them at `lumenfall.ai/llms.txt` or via the models API
- Text models use OpenRouter format: `google/gemini-3-flash-preview` (with provider prefix)
- Image/video models use Lumenfall slugs: `gemini-3-pro-image-preview` (no provider prefix)
- Model slugs are always lowercase

---

## 6. INVALID_REQUEST — Prompt Too Long (HTTP 400)

**What it means:** The prompt exceeds the maximum character limit.

**Error message:** `Too big: expected string to have <=1000 characters`

**Why it happens:** Image generation prompts are limited to 1000 characters. Developers
coming from text/chat APIs (where prompts can be thousands of tokens) often hit this.
Video models may have different limits (e.g., kling-v3 allows up to 2500 characters).

**How to fix:**
- Shorten the prompt to under 1000 characters for image generation
- Focus on the most important visual descriptors — image models are generally good at
  interpreting concise prompts
- If using a video model, check the specific limit in its llms.txt

---

## 7. Gemini Empty Responses (manifests as ALL_PROVIDERS_EXHAUSTED)

**What it means:** Google's Gemini models sometimes return a successful HTTP response but
with no image data. Lumenfall treats this as a failure and tries the next provider.

**Why it happens:** Gemini may decline to generate for various reasons (safety, inability
to render the prompt) without returning an explicit error code. The response comes back
with a `NO_IMAGE`, `IMAGE_SAFETY`, or `IMAGE_OTHER` finish reason but no actual image.

**How to diagnose:**
- The error message in `ALL_PROVIDERS_EXHAUSTED` will mention "returned NO_IMAGE without
  image output" or similar
- Open the request drawer to see the individual provider attempts

**How to fix:**
- Retry — this is often intermittent
- Try a different prompt phrasing
- Use a non-Gemini model if it's consistently failing
- If you've forced routing to Gemini (`vertex/...` or `gemini/...`), remove the prefix
  to let Lumenfall try other providers

---

## 8. Provider Timeouts (manifests as ALL_PROVIDERS_EXHAUSTED)

**What it means:** The upstream provider took too long to respond.

**Why it happens:** Some models and providers are inherently slow. Expected generation
times vary dramatically:

| Model | Typical P95 Time |
|---|---|
| flux.1-schnell-fp8 | ~5 seconds |
| gpt-image-1.5 | ~78 seconds |
| gemini-3.1-flash-image-preview | ~2 minutes |
| seedream-4.5 | ~2 minutes |
| flux.1-kontext-pro | ~7 minutes |

Provider-side timeouts (HTTP 524) hit fal, Fireworks, and Vertex most often.

**How to fix:**
- Set appropriate client-side timeouts — don't use a 30-second timeout for models that
  routinely take 2+ minutes
- For very slow models, consider using the video-style async pattern if available
- If a specific provider keeps timing out, forced routing to a different one may help

---

## 9. Provider Quota / Rate Limits (manifests as ALL_PROVIDERS_EXHAUSTED)

**What it means:** The upstream provider's rate limit or quota was hit.

**Why it happens:** This is usually a Lumenfall-side issue — Lumenfall's own API keys with
a provider may temporarily exhaust quota. Google Vertex is the most commonly affected.

**Why users rarely see this:** Lumenfall automatically fails over to another provider when
one is rate-limited. The user only sees an error if ALL providers for that model are
simultaneously rate-limited or unavailable.

**How to fix:**
- Retry after a brief delay — quota usually refreshes quickly
- Try a different model that has more provider diversity
- If persistent, contact Lumenfall support

---

## 10. Unsupported Parameters Passed Through (manifests as UPSTREAM_ERROR or ALL_PROVIDERS_EXHAUSTED)

**What it means:** A request parameter that works with some providers doesn't work with the
provider that ultimately handled the request.

**Why it happens:** Lumenfall normalizes common parameters (size, response_format, n, etc.)
across providers. But some OpenAI-specific parameters like `quality: "hd"` or `style: "vivid"`
aren't understood by all providers. If Lumenfall routes the request to a provider that doesn't
support that parameter, it may fail.

**Common cases:**
- `quality: "hd"` / `quality: "standard"` — legacy DALL-E values. Lumenfall maps these
  internally to OpenAI's gpt-image-1/2 enum (`high` / `medium`), but other providers
  (Gemini/Vertex, etc.) don't understand the parameter at all.
- `style: "vivid"` or `style: "natural"` — DALL-E 3 / gpt-image-1 only; not understood
  by Gemini/Vertex or most other providers.

**How to fix:**
- Remove provider-specific parameters if you want maximum routing flexibility
- Use forced routing (`openai/gpt-image-2`) when sending provider-specific parameters
- Stick to the documented common parameters: `prompt`, `model`, `size`, `n`, `response_format`

---

## 11. Video Async Workflow Issues

**What it means:** Various issues specific to video generation's asynchronous workflow.

**Common problems:**

**Not polling:** Video generation returns HTTP 202 with a job object. The video is NOT
ready yet — you must poll `GET /openai/v1/videos/{id}` until `status` is `completed`
or `failed`.

**Prompt too long:** Video models have their own limits. kling-v3 allows max 2500 characters.

**Lower success rate:** Video generation has a ~56% success rate vs ~77% for images.
Content moderation and provider availability are the main causes. Build retry logic.

**How to fix:**
- Implement polling with exponential backoff (start at 2s, max 30s)
- Set up webhooks for production use instead of polling
- Check model-specific limits in the model's llms.txt
- Handle `failed` status gracefully — video models fail more often than image models

---

## 12. Multiple Input Images Not Supported

**What it means:** The edit request included multiple input images, but the model only
accepts one.

**Error message:** `does not support multiple input images`

**How to fix:**
- Send only one image in the edit request
- Check the model's llms.txt for supported input formats

---

## 13. Invalid Image File for Editing

**What it means:** The image file sent for editing is corrupted, in an unsupported format,
or otherwise invalid.

**Error message:** `Invalid image file provided`

**How to fix:**
- Ensure the image is a valid PNG, JPEG, WebP, or GIF
- Check that the file isn't corrupted or truncated
- For the `/images/edits` endpoint, use `multipart/form-data` Content-Type, not JSON
- Verify the image size isn't too large for the target provider

---

## 14. Location Restrictions

**What it means:** Google Gemini API access is restricted by geographic region. If a user
or their server is in an unsupported region and forces Gemini routing, requests fail.

**Error message:** `User location is not supported for API use`

**Why users rarely see this:** Lumenfall's automatic routing handles this by failing over
to another provider. The error only surfaces when using forced routing
(`gemini/gemini-3-pro-image-preview`).

**How to fix:**
- Remove forced provider routing to let Lumenfall auto-select an available provider
- If you need Gemini specifically, use Vertex routing instead (`vertex/...`) which uses
  service accounts not subject to the same regional restrictions

---

## 15. Provider-Specific Content Moderation Thresholds

**What it means:** Different providers have significantly different content moderation
sensitivity. The same prompt may succeed on one provider and fail on another.

**Why it matters:** Since Lumenfall routes to different providers, a prompt that worked
yesterday might fail today if routed to a stricter provider.

**Provider moderation strictness (approximate, from production data):**
- **Stricter:** fal.ai, Replicate, xAI/Grok, OpenAI
- **Moderate:** Google (Gemini/Vertex), ByteDance
- **More permissive:** Fireworks, Alibaba, Runware

**How to handle this in your application:**
- Build retry logic that handles CONTENT_POLICY_VIOLATION gracefully
- If a specific prompt consistently fails, try forced routing to a less strict provider
- Never assume a prompt that works once will always work — provider routing is dynamic
- Surface helpful error messages to your end users instead of raw error codes
