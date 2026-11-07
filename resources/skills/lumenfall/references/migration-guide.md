# Migration Guide — Moving to Lumenfall

This guide shows how to migrate from common AI media providers to Lumenfall. The core
idea is always the same: Lumenfall is OpenAI-compatible, so you change the base URL and
API key, then adjust model names. Each section below covers provider-specific differences.

## General Migration Pattern

Almost every migration follows this pattern:

1. Replace the base URL with `https://api.lumenfall.ai/openai/v1`
2. Replace the API key with your Lumenfall key (`lmnfl_...`)
3. Replace provider-specific model IDs with Lumenfall slugs
4. Adjust response parsing if the provider used a non-OpenAI format

If you're already using an OpenAI SDK, steps 1 and 2 are often all you need.

---

## From Fal.ai

### Key Differences

| Aspect | Fal.ai | Lumenfall |
|---|---|---|
| Base URL | `queue.fal.run/{model-id}` | `api.lumenfall.ai/openai/v1` |
| Auth | `Key $FAL_KEY` | `Bearer lmnfl_...` |
| Model ID | In URL path: `fal-ai/flux/schnell` | In request body: `flux.1-schnell` |
| Image response | `result.images[].url` | `response.data[].url` |
| Async | Queue with poll/SSE/webhook | Synchronous (images), async poll (video) |
| SDK | `@fal-ai/client` / `fal_client` | Any OpenAI SDK |

### Before (Fal Python SDK)

```python
import fal_client

result = fal_client.subscribe(
    "fal-ai/flux/schnell",
    arguments={
        "prompt": "a capybara wearing a top hat",
        "image_size": "landscape_16_9",
        "num_images": 2,
    },
)
for image in result["images"]:
    print(image["url"])
```

### After (OpenAI Python SDK → Lumenfall)

```python
from openai import OpenAI

client = OpenAI(
    api_key="lmnfl_...",
    base_url="https://api.lumenfall.ai/openai/v1",
)

response = client.images.generate(
    model="flux.1-schnell",
    prompt="a capybara wearing a top hat",
    size="1792x1024",  # closest to 16:9
    n=2,
)
for image in response.data:
    print(image.url)
```

### Before (Fal JavaScript SDK)

```javascript
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/flux/schnell", {
  input: {
    prompt: "a capybara wearing a top hat",
    image_size: "landscape_16_9",
    num_images: 2,
  },
});
result.data.images.forEach((img) => console.log(img.url));
```

### After (OpenAI TypeScript SDK → Lumenfall)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "lmnfl_...",
  baseURL: "https://api.lumenfall.ai/openai/v1",
});

const response = await client.images.generate({
  model: "flux.1-schnell",
  prompt: "a capybara wearing a top hat",
  size: "1792x1024",
  n: 2,
});
response.data.forEach((img) => console.log(img.url));
```

### Migration Notes

- **Async → sync:** Fal uses a queue-based async model for everything. Lumenfall image
  generation is synchronous — you get the result immediately. No polling needed for images.
- **Image size format:** Fal uses named presets (`landscape_16_9`). Lumenfall accepts
  `WIDTHxHEIGHT` (e.g., `1792x1024`) or aspect ratios (`16:9`). Lumenfall normalizes
  these automatically per provider.
- **Model names:** Strip the `fal-ai/` prefix and use Lumenfall slugs. Check the model
  catalog at `lumenfall.ai/llms.txt` for exact slugs.
- **Webhooks:** If you used Fal webhooks, Lumenfall also supports webhooks (Standard
  Webhooks spec) for async operations like video generation.

---

## From Replicate

### Key Differences

| Aspect | Replicate | Lumenfall |
|---|---|---|
| Base URL | `api.replicate.com/v1` | `api.lumenfall.ai/openai/v1` |
| Auth | `Bearer r8_...` | `Bearer lmnfl_...` |
| Model ID | `{owner}/{model}` or version hash | Lumenfall slug (e.g., `flux.1-schnell`) |
| Image response | `output[]` (array of URLs) | `response.data[].url` |
| Async | Always async (poll predictions) | Synchronous (images), async (video) |
| Output lifetime | URLs expire after 1 hour | Media on `media.lumenfall.ai`; default is transient (~1 hour). Orgs can opt into longer retention tiers in dashboard settings. |

### Before (Replicate Python SDK)

```python
import replicate

output = replicate.run(
    "black-forest-labs/flux-schnell",
    input={
        "prompt": "a capybara wearing a top hat",
        "num_outputs": 2,
    },
)
for url in output:
    print(url)
```

### After (OpenAI Python SDK → Lumenfall)

```python
from openai import OpenAI

client = OpenAI(
    api_key="lmnfl_...",
    base_url="https://api.lumenfall.ai/openai/v1",
)

response = client.images.generate(
    model="flux.1-schnell",
    prompt="a capybara wearing a top hat",
    n=2,
)
for image in response.data:
    print(image.url)
```

### Migration Notes

- **Async → sync:** Replicate's `run()` hides polling but is still async underneath.
  Lumenfall image generation returns immediately — no predictions to poll.
- **Output URL lifetime is similar by default.** Replicate URLs expire after ~1 hour;
  Lumenfall's media URLs default to transient (also ~1 hour) and are served from
  `media.lumenfall.ai`. Orgs can opt into longer retention via dashboard settings
  (`lumenfall.ai/app/settings/overview` → Data Retention). Download and re-host if you
  need the asset to outlive the configured tier. See https://docs.lumenfall.ai/privacy
  for the authoritative retention policy.
- **Model names:** Replicate uses `owner/model-name` format. Lumenfall uses flat slugs.
  Common mappings:
  - `black-forest-labs/flux-schnell` → `flux.1-schnell`
  - `black-forest-labs/flux-1.1-pro` → `flux1.1-pro`
  - Check `lumenfall.ai/llms.txt` for exact slugs
- **Input parameters:** Replicate passes model-specific params in `input`. Lumenfall uses
  OpenAI-standard params (`prompt`, `size`, `n`, `response_format`). Provider-specific
  params can be passed but may not work if Lumenfall routes to a different provider.

---

## From Direct OpenAI

### Key Differences

| Aspect | OpenAI Direct | Lumenfall |
|---|---|---|
| Base URL | `api.openai.com/v1` | `api.lumenfall.ai/openai/v1` |
| Auth | `Bearer sk-...` | `Bearer lmnfl_...` |
| Model ID | `gpt-image-1`, `gpt-image-2`, `dall-e-3` | Same slugs (`gpt-image-2`, etc.) or any other Lumenfall model |
| Response format | OpenAI standard | Same (OpenAI-compatible) |

### Before (Direct OpenAI)

```python
from openai import OpenAI

client = OpenAI(api_key="sk-...")

response = client.images.generate(
    model="gpt-image-2",
    prompt="a capybara wearing a top hat",
    size="1024x1024",
)
print(response.data[0].url)
```

### After (Lumenfall)

```python
from openai import OpenAI

client = OpenAI(
    api_key="lmnfl_...",
    base_url="https://api.lumenfall.ai/openai/v1",
)

response = client.images.generate(
    model="gpt-image-2",  # same model name, or try any other model
    prompt="a capybara wearing a top hat",
    size="1024x1024",
)
print(response.data[0].url)
```

### Migration Notes

- **Two-line change:** Just set `base_url` and swap the API key. The API is identical.
- **Same model names work:** OpenAI image slugs like `gpt-image-1`, `gpt-image-1.5`,
  `gpt-image-2`, and `dall-e-3` work directly on Lumenfall.
- **Extra models:** After migrating, you can use any Lumenfall model — not just OpenAI ones.
  Try `flux.2-max`, `gemini-3-pro-image-preview` (Nano Banana Pro), or `seedream-4.5`.
- **OpenAI-specific params:** Parameters like `quality: "hd"` and `style: "vivid"` work
  when routed to OpenAI but may cause issues if Lumenfall routes to a different provider.
  Remove them for maximum routing flexibility, or force OpenAI routing:
  `"model": "openai/gpt-image-2"`.
- **Cost visibility:** Unlike direct OpenAI, Lumenfall returns `metadata.cost` in every
  response showing the exact cost. Direct OpenAI doesn't provide per-request cost.

---

## From OpenRouter

### Key Differences

| Aspect | OpenRouter | Lumenfall |
|---|---|---|
| Base URL | `openrouter.ai/api/v1` | `api.lumenfall.ai/openai/v1` |
| Auth | `Bearer $OPENROUTER_API_KEY` | `Bearer lmnfl_...` |
| Text model IDs | `openai/gpt-5.2` | Same format for text: `openai/gpt-5.2` |
| Image generation | Via `/chat/completions` + `modalities` | Via `/images/generations` |
| Image response | Base64 in message content | `data[].url` or `data[].b64_json` |

### Before (OpenRouter — image generation via chat)

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-or-...",
    base_url="https://openrouter.ai/api/v1",
)

response = client.chat.completions.create(
    model="google/gemini-2.5-flash-image",
    messages=[{"role": "user", "content": "Generate a capybara wearing a top hat"}],
    extra_body={"modalities": ["image", "text"]},
)
# Image is embedded as base64 in the message content
```

### After (Lumenfall — dedicated image endpoint)

```python
from openai import OpenAI

client = OpenAI(
    api_key="lmnfl_...",
    base_url="https://api.lumenfall.ai/openai/v1",
)

response = client.images.generate(
    model="gemini-3-pro-image-preview",
    prompt="a capybara wearing a top hat",
    size="1024x1024",
)
print(response.data[0].url)
```

### Migration Notes

- **Text models:** For chat/text completions, Lumenfall routes through OpenRouter
  internally. The same model IDs work: `google/gemini-3-flash-preview`,
  `openai/gpt-5.2`, etc. Just change the base URL and API key.
- **Image generation is different:** OpenRouter serves images through the chat endpoint
  with `modalities: ["image", "text"]`. Lumenfall has a dedicated `/images/generations`
  endpoint — cleaner and returns standard OpenAI image response format.
- **Image model IDs differ:** OpenRouter uses `google/gemini-2.5-flash-image`. Lumenfall
  uses its own slugs like `gemini-3-pro-image-preview`. Check the catalog.
- **No extra headers needed:** OpenRouter recommends `HTTP-Referer` and `X-Title` headers.
  Lumenfall doesn't use these.

---

## From ImageRouter

### Key Differences

| Aspect | ImageRouter | Lumenfall |
|---|---|---|
| Base URL | `api.imagerouter.io/v1/openai` | `api.lumenfall.ai/openai/v1` |
| Auth | `Bearer $IR_KEY` | `Bearer lmnfl_...` |
| Model ID format | `{provider}/{MODEL-NAME}` | Lumenfall slug (lowercase) |
| Response format | OpenAI-compatible | OpenAI-compatible |

### Before (ImageRouter)

```python
from openai import OpenAI

client = OpenAI(
    api_key="ir-...",
    base_url="https://api.imagerouter.io/v1/openai",
)

response = client.images.generate(
    model="black-forest-labs/FLUX-1.1-pro",
    prompt="a capybara wearing a top hat",
    size="1024x1024",
)
print(response.data[0].url)
```

### After (Lumenfall)

```python
from openai import OpenAI

client = OpenAI(
    api_key="lmnfl_...",
    base_url="https://api.lumenfall.ai/openai/v1",
)

response = client.images.generate(
    model="flux1.1-pro",
    prompt="a capybara wearing a top hat",
    size="1024x1024",
)
print(response.data[0].url)
```

### Migration Notes

- **Very similar APIs:** Both are OpenAI-compatible image APIs. The migration is mostly
  changing the URL, key, and model IDs.
- **Model ID format:** ImageRouter uses `Provider/MODEL-NAME` (mixed case). Lumenfall
  uses lowercase flat slugs. Check `lumenfall.ai/llms.txt` for exact names.
- **Extra features:** Lumenfall adds automatic failover, video generation, chat
  completions, cost estimation (`?dryRun=true`), and request history API — features
  ImageRouter doesn't have.

---

## From Direct Google (Vertex AI / Gemini API)

### Key Differences

| Aspect | Google Direct | Lumenfall |
|---|---|---|
| Auth | Service account / API key | `Bearer lmnfl_...` |
| Endpoint | `generativelanguage.googleapis.com` or Vertex | `api.lumenfall.ai/openai/v1` |
| SDK | `google-genai` / `@google/genai` | Any OpenAI SDK |
| Response | Google-specific format | OpenAI-compatible |
| Image format | Inline base64 in parts | `data[].url` or `data[].b64_json` |

### Before (Google Gemini Python SDK)

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="AIza...")

response = client.models.generate_images(
    model="gemini-3-pro-image-preview",
    prompt="a capybara wearing a top hat",
    config=types.GenerateImagesConfig(number_of_images=2),
)
for image in response.generated_images:
    image.image.save("output.png")
```

### After (OpenAI Python SDK → Lumenfall)

```python
from openai import OpenAI

client = OpenAI(
    api_key="lmnfl_...",
    base_url="https://api.lumenfall.ai/openai/v1",
)

response = client.images.generate(
    model="gemini-3-pro-image-preview",  # same model name
    prompt="a capybara wearing a top hat",
    n=2,
)
for image in response.data:
    print(image.url)
```

### Migration Notes

- **No service account needed:** Replace Google Cloud auth (service accounts, API keys,
  gcloud CLI) with a single Lumenfall Bearer token.
- **Same model names:** Gemini model slugs like `gemini-3-pro-image-preview` work
  directly on Lumenfall.
- **Simpler SDK:** Instead of Google's SDK with its specific types and config objects,
  use any OpenAI-compatible SDK.
- **URLs instead of bytes:** Google returns images as inline bytes. Lumenfall returns
  URLs by default (served from `media.lumenfall.ai`) or base64. Hosted URLs are
  transient (~1 hour) unless the org has opted into a longer retention tier in dashboard
  settings. Use `response_format: "b64_json"` if you'd rather avoid the hosted URL
  entirely. Authoritative policy: https://docs.lumenfall.ai/privacy
- **Automatic failover:** If Google's API has issues, Lumenfall can route to other
  providers that serve the same or similar models. Direct Google integration has no
  fallback.
- **Regional restrictions:** Direct Gemini API has regional restrictions. Lumenfall
  routes through Vertex AI service accounts when needed, avoiding most regional issues.
