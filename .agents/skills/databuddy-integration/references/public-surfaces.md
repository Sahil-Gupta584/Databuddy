# Databuddy Public Surfaces

Use this file to choose the right package, environment variables, and endpoints for external Databuddy users.

## Package Selection

### `@databuddy/sdk`

Use for:

- browser tracker helpers like `track`, `flush`, `getAnonymousId`, `getSessionId`
- framework-specific browser SDK imports:
  - `@databuddy/sdk/react`
  - `@databuddy/sdk/vue`
  - `@databuddy/sdk/node`

### `@databuddy/ai`

Use for:

- OpenAI SDK observability
- Anthropic SDK observability
- Vercel AI SDK observability

## Environment Variables

### Browser / React / Next.js

```bash
NEXT_PUBLIC_DATABUDDY_CLIENT_ID=your-client-id
```

### Vue

```bash
VITE_DATABUDDY_CLIENT_ID=your-client-id
```

### Server / Node / API / LLM

```bash
DATABUDDY_API_KEY=your-api-key
```

Optional server-side scoping:

```bash
DATABUDDY_WEBSITE_ID=your-website-id
DATABUDDY_API_URL=https://basket.databuddy.cc
```

## Endpoint Defaults

| Surface | Default |
|---|---|
| Event tracking | `https://basket.databuddy.cc` |
| LLM tracking | `https://basket.databuddy.cc/llm` |
| Query API | `https://api.databuddy.cc/v1` |
| Feature flags API | `https://api.databuddy.cc` (paths under `/public/v1/flags/...`) |
| Tracker script | `https://cdn.databuddy.cc/databuddy.js` |

## Framework Routing

### React / Next.js

Primary docs source:

- [`apps/docs/content/docs/sdk/react.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/react.mdx)
- [`apps/docs/content/docs/sdk/configuration.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/configuration.mdx)
- [`apps/docs/content/docs/sdk/tracker.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/tracker.mdx)
- [`apps/docs/content/docs/sdk/feature-flags.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/feature-flags.mdx)

Typical pattern:

```tsx
import { Databuddy } from "@databuddy/sdk/react";

<Databuddy
  clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID!}
  trackWebVitals
  trackErrors
/>
```

For custom events:

```tsx
import { track } from "@databuddy/sdk";

track("signup_clicked", { source: "header" });
```

### Vue

Primary docs source:

- [`apps/docs/content/docs/sdk/vue.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/vue.mdx)
- [`apps/docs/content/docs/sdk/configuration.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/configuration.mdx)

Typical pattern:

```vue
<script setup>
import { Databuddy } from "@databuddy/sdk/vue";
const clientId = import.meta.env.VITE_DATABUDDY_CLIENT_ID;
</script>

<template>
  <Databuddy :client-id="clientId" :track-errors="true" />
</template>
```

### Vanilla JS

Primary docs source:

- [`apps/docs/content/docs/sdk/vanilla-js.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/vanilla-js.mdx)
- [`apps/docs/content/docs/sdk/configuration.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/configuration.mdx)

Typical pattern:

```html
<script
  src="https://cdn.databuddy.cc/databuddy.js"
  data-client-id="your-client-id"
  data-track-web-vitals
  async
></script>
```

### Node SDK

Primary docs source:

- [`apps/docs/content/docs/sdk/node.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/node.mdx)
- [`apps/docs/content/docs/sdk/configuration.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/configuration.mdx)

Typical pattern:

```ts
import { Databuddy } from "@databuddy/sdk/node";

const client = new Databuddy({
  apiKey: process.env.DATABUDDY_API_KEY!,
});

await client.track({
  name: "api_call",
  properties: { endpoint: "/users" },
});

await client.flush();
```

### Server-Side Feature Flags

Primary docs source:

- [`apps/docs/content/docs/sdk/server-flags.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/server-flags.mdx)
- [`apps/docs/content/docs/sdk/feature-flags.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/feature-flags.mdx)

Typical pattern:

```ts
import { createServerFlagsManager } from "@databuddy/sdk/node";

const flags = createServerFlagsManager({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
});

await flags.waitForInit();
const flag = await flags.getFlag("new-feature");
```

### LLM Observability

Primary docs source:

- [`packages/ai/README.md`](/Users/iza/Dev/Databuddy/packages/ai/README.md)

Typical patterns:

```ts
import { OpenAI } from "@databuddy/ai/openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  databuddy: {
    apiKey: process.env.DATABUDDY_API_KEY,
  },
});
```

```ts
import { createTracker } from "@databuddy/ai/vercel";

const { track } = createTracker({
  apiKey: process.env.DATABUDDY_API_KEY,
});
```

## REST API Routing

Primary docs source:

- [`apps/docs/content/docs/api/index.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/api/index.mdx)

### Analytics Query API

- Base URL: `https://api.databuddy.cc/v1`
- Auth: `x-api-key: dbdy_...`, or `Authorization: Bearer dbdy_...`
- Use for querying websites, summary metrics, pages, traffic, countries, custom events, link analytics, and LLM analytics

Minimal example:

```bash
curl -H "x-api-key: dbdy_your_api_key" \
  https://api.databuddy.cc/v1/query/websites
```

### Event Tracking Endpoint

- Base URL: `https://basket.databuddy.cc`
- Use for sending custom events
- Prefer the Node SDK or browser SDK unless the user explicitly wants raw HTTP

### LLM Endpoint

- Base URL: `https://basket.databuddy.cc/llm`
- Prefer `@databuddy/ai` unless the user needs low-level transport control

## Troubleshooting Prompts

If the integration fails, check these first:

- wrong credential type: `clientId` vs `DATABUDDY_API_KEY`
- wrong base URL: `api.databuddy.cc` vs `basket.databuddy.cc`
- missing `flush()` in serverless Node usage
- browser SDK mounted too low in the tree
- `NEXT_PUBLIC_DATABUDDY_CLIENT_ID` or `VITE_DATABUDDY_CLIENT_ID` missing
- feature flags attempted before initialization
