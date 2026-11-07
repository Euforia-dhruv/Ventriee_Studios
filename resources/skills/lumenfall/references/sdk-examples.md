# Lumenfall SDK Integration Examples

Lumenfall is OpenAI-compatible — any SDK that works with OpenAI's API works with Lumenfall
by changing the base URL and API key. No proprietary SDK needed.

## Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    api_key="lmnfl_...",
    base_url="https://api.lumenfall.ai/openai/v1",
)

# Image generation
response = client.images.generate(
    model="gemini-3-pro-image-preview",
    prompt="a capybara in a hot spring",
    size="1024x1024",
    n=1,
)
print(response.data[0].url)

# Image editing
response = client.images.edit(
    model="gpt-image-2",
    image=open("input.png", "rb"),
    prompt="add sunglasses to the capybara",
)
print(response.data[0].url)

# Video generation (async)
video = client.post(
    "/videos",
    body={"model": "wan-2.6", "prompt": "a capybara swimming"},
    cast_to=dict,
)
# Poll until complete
import time
while True:
    status = client.get(f"/videos/{video['id']}", cast_to=dict)
    if status["status"] in ("completed", "failed"):
        break
    time.sleep(5)
print(status["output"]["url"])

# Chat completion
response = client.chat.completions.create(
    model="google/gemini-3-flash-preview",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)

# Chat completion (streaming)
stream = client.chat.completions.create(
    model="google/gemini-3-flash-preview",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Environment Variable Shortcut

```bash
export OPENAI_API_KEY="lmnfl_..."
export OPENAI_BASE_URL="https://api.lumenfall.ai/openai/v1"
```

```python
# No need to pass api_key or base_url — the SDK reads from env
client = OpenAI()
```

---

## TypeScript / JavaScript (OpenAI SDK)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "lmnfl_...",
  baseURL: "https://api.lumenfall.ai/openai/v1",
});

// Image generation
const response = await client.images.generate({
  model: "gemini-3-pro-image-preview",
  prompt: "a capybara in a hot spring",
  size: "1024x1024",
  n: 1,
});
console.log(response.data[0].url);

// Image editing
import fs from "fs";
const editResponse = await client.images.edit({
  model: "gpt-image-2",
  image: fs.createReadStream("input.png"),
  prompt: "add sunglasses to the capybara",
});
console.log(editResponse.data[0].url);

// Video generation (async)
const video = await client.post("/videos", {
  body: { model: "wan-2.6", prompt: "a capybara swimming" },
});
// Poll until complete
let status;
do {
  await new Promise((r) => setTimeout(r, 5000));
  status = await client.get(`/videos/${video.id}`);
} while (!["completed", "failed"].includes(status.status));
console.log(status.output.url);

// Chat completion
const chat = await client.chat.completions.create({
  model: "google/gemini-3-flash-preview",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(chat.choices[0].message.content);
```

---

## Vercel AI SDK (TypeScript)

```typescript
import { generateText, generateImage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const lumenfall = createOpenAI({
  apiKey: "lmnfl_...",
  baseURL: "https://api.lumenfall.ai/openai/v1",
});

// Image generation
const { image } = await generateImage({
  model: lumenfall.image("gemini-3-pro-image-preview"),
  prompt: "a capybara in a hot spring",
  size: "1024x1024",
});

// Chat completion
const { text } = await generateText({
  model: lumenfall("google/gemini-3-flash-preview"),
  prompt: "Hello!",
});
```

---

## LiteLLM (Python)

```python
import litellm

# Image generation
response = litellm.image_generation(
    model="openai/gemini-3-pro-image-preview",
    prompt="a capybara in a hot spring",
    api_key="lmnfl_...",
    api_base="https://api.lumenfall.ai/openai/v1",
)
print(response.data[0].url)

# Chat completion
response = litellm.completion(
    model="openai/google/gemini-3-flash-preview",
    messages=[{"role": "user", "content": "Hello!"}],
    api_key="lmnfl_...",
    api_base="https://api.lumenfall.ai/openai/v1",
)
print(response.choices[0].message.content)
```

Note: LiteLLM requires the `openai/` prefix before the model name to signal it should
use the OpenAI-compatible provider.

---

## Ruby (ruby-openai)

```ruby
require "openai"

client = OpenAI::Client.new(
  access_token: "lmnfl_...",
  uri_base: "https://api.lumenfall.ai/openai/v1",
)

# Image generation
response = client.images.generate(
  parameters: {
    model: "gemini-3-pro-image-preview",
    prompt: "a capybara in a hot spring",
    size: "1024x1024",
  }
)
puts response.dig("data", 0, "url")
```

---

## Go (openai-go)

```go
package main

import (
    "context"
    "fmt"
    "github.com/openai/openai-go"
    "github.com/openai/openai-go/option"
)

func main() {
    client := openai.NewClient(
        option.WithAPIKey("lmnfl_..."),
        option.WithBaseURL("https://api.lumenfall.ai/openai/v1"),
    )

    response, err := client.Images.Generate(context.Background(),
        openai.ImageGenerateParams{
            Model:  "gemini-3-pro-image-preview",
            Prompt: "a capybara in a hot spring",
            Size:   openai.ImageGenerateParamsSize1024x1024,
        },
    )
    if err != nil {
        panic(err)
    }
    fmt.Println(response.Data[0].URL)
}
```

---

## cURL / HTTP

```bash
# Image generation
curl -X POST https://api.lumenfall.ai/openai/v1/images/generations \
  -H "Authorization: Bearer lmnfl_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro-image-preview",
    "prompt": "a capybara in a hot spring",
    "size": "1024x1024",
    "n": 1
  }'

# Image editing (multipart)
curl -X POST https://api.lumenfall.ai/openai/v1/images/edits \
  -H "Authorization: Bearer lmnfl_..." \
  -F "model=gpt-image-2" \
  -F "image=@input.png" \
  -F "prompt=add sunglasses to the capybara"

# Video generation
curl -X POST https://api.lumenfall.ai/openai/v1/videos \
  -H "Authorization: Bearer lmnfl_..." \
  -H "Content-Type: application/json" \
  -d '{"model": "wan-2.6", "prompt": "a capybara swimming"}'

# Poll video status
curl https://api.lumenfall.ai/openai/v1/videos/{video_id} \
  -H "Authorization: Bearer lmnfl_..."

# List models
curl https://api.lumenfall.ai/openai/v1/models \
  -H "Authorization: Bearer lmnfl_..."

# Check balance (native endpoint — no /openai prefix)
curl https://api.lumenfall.ai/v1/balance \
  -H "Authorization: Bearer lmnfl_..."

# Request history (native endpoint)
curl "https://api.lumenfall.ai/v1/requests?limit=5&summary=true" \
  -H "Authorization: Bearer lmnfl_..."

# Cost estimation (dry run)
curl -X POST "https://api.lumenfall.ai/openai/v1/images/generations?dryRun=true" \
  -H "Authorization: Bearer lmnfl_..." \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-image-1.5", "prompt": "test", "size": "1024x1024"}'
```

---

## Java (OpenAI Java SDK)

```java
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.*;

OpenAIClient client = OpenAIOkHttpClient.builder()
    .apiKey("lmnfl_...")
    .baseUrl("https://api.lumenfall.ai/openai/v1")
    .build();

ImagesResponse response = client.images().generate(
    ImageGenerateParams.builder()
        .model("gemini-3-pro-image-preview")
        .prompt("a capybara in a hot spring")
        .size(ImageGenerateParams.Size._1024X1024)
        .n(1)
        .build()
);
System.out.println(response.data().get(0).url());
```

---

## PHP (openai-php)

```php
use OpenAI;

$client = OpenAI::factory()
    ->withApiKey('lmnfl_...')
    ->withBaseUri('https://api.lumenfall.ai/openai/v1')
    ->make();

$response = $client->images()->create([
    'model' => 'gemini-3-pro-image-preview',
    'prompt' => 'a capybara in a hot spring',
    'size' => '1024x1024',
    'n' => 1,
]);
echo $response->data[0]->url;
```

---

## C# / .NET

```csharp
using OpenAI;
using OpenAI.Images;

var client = new OpenAIClient(
    new ApiKeyCredential("lmnfl_..."),
    new OpenAIClientOptions { Endpoint = new Uri("https://api.lumenfall.ai/openai/v1") }
);

var imageClient = client.GetImageClient("gemini-3-pro-image-preview");
var result = await imageClient.GenerateImageAsync(
    "a capybara in a hot spring",
    new ImageGenerationOptions { Size = GeneratedImageSize.W1024xH1024 }
);
Console.WriteLine(result.Value.ImageUri);
```

---

## Kotlin (openai-kotlin)

```kotlin
val client = OpenAI(
    OpenAIConfig(
        token = "lmnfl_...",
        host = OpenAIHost(baseUrl = "https://api.lumenfall.ai/openai/v1"),
    )
)

val response = client.imageURL(
    ImageCreation(
        model = ModelId("gemini-3-pro-image-preview"),
        prompt = "a capybara in a hot spring",
        size = ImageSize.is1024x1024,
        n = 1,
    )
)
println(response.first().url)
```

---

## Swift (MacPaw OpenAI)

```swift
import OpenAI

let configuration = OpenAI.Configuration(
    token: "lmnfl_...",
    host: "api.lumenfall.ai",
    path: "/openai/v1"
)
let openAI = OpenAI(configuration: configuration)

let query = ImagesQuery(
    model: "gemini-3-pro-image-preview",
    prompt: "a capybara in a hot spring",
    n: 1,
    size: "1024x1024"
)
let result = try await openAI.images(query: query)
print(result.data.first?.url ?? "no image")
```
