---
name: databuddy-integration
description: Help users integrate Databuddy into their own products. Use when the user wants to install or use Databuddy's SDK, React or Vue component, tracker helpers, Node SDK, server-side feature flags, REST API, event tracking endpoint, or LLM observability package.
---

# Databuddy Integration

Use this skill for people adopting Databuddy in their own app or backend. Optimize for the public integration surface, not the internal monorepo.

## Start By Choosing The Surface

- Browser analytics in React or Next.js: `@databuddy/sdk/react`
- Browser analytics in Vue: `@databuddy/sdk/vue`
- Browser analytics in plain HTML or vanilla JS: CDN script `https://cdn.databuddy.cc/databuddy.js`
- Tracker helpers for custom events in the browser: `@databuddy/sdk`
- Server-side event tracking: `@databuddy/sdk/node`
- Server-side feature flags: `createServerFlagsManager` from `@databuddy/sdk/node`
- LLM observability: `@databuddy/ai`
- Analytics querying or event ingestion over HTTP: Databuddy REST/API endpoints

Read [public-surfaces.md](./references/public-surfaces.md) when you need framework-specific routing, env vars, or endpoint details.
Read [event-design.md](./references/event-design.md) when the user asks what custom events to add, which properties are useful, how to keep events actionable, or how to avoid noisy/high-cardinality tracking.

## Workflow

1. Identify whether the user is integrating Databuddy in the browser, on the server, via REST API, or for LLM observability.
2. Prefer the highest-level supported API:
   - React/Vue component before custom script wiring
   - Node SDK before hand-rolled HTTP calls
   - `@databuddy/ai` before custom `/llm` instrumentation
3. Ask for or infer the minimum required credentials:
   - `clientId` for browser tracking and flags
   - `DATABUDDY_API_KEY` for server-side tracking, API access, and LLM observability
4. Give copy-pasteable setup with the correct env vars and endpoint defaults.
5. Include verification steps so the user can confirm events or API responses are working.

## Core Public Defaults

- Browser/event ingestion base URL: `https://basket.databuddy.cc`
- LLM tracking endpoint: `https://basket.databuddy.cc/llm`
- Query API base URL: `https://api.databuddy.cc/v1`
- Feature flag API base URL: `https://api.databuddy.cc`
- Tracker script URL: `https://cdn.databuddy.cc/databuddy.js`

## Credentials

- Browser SDKs usually need a `clientId`
- React SDK can auto-detect `NEXT_PUBLIC_DATABUDDY_CLIENT_ID`
- Vue examples commonly use `VITE_DATABUDDY_CLIENT_ID`
- Server SDKs and REST APIs use `DATABUDDY_API_KEY`
- Server-side website scoping may also use `DATABUDDY_WEBSITE_ID` or a per-event `websiteId`

## Decision Rules

### React / Next.js

- Use `@databuddy/sdk/react`
- Put `<Databuddy />` near the app root
- Use tracker helpers from `@databuddy/sdk` for custom events

### Vue

- Use `@databuddy/sdk/vue`
- Translate props to kebab-case in templates

### Vanilla JS

- Use the CDN script when the app does not need a package install
- Configure behavior with `data-*` attributes

### Server / Backend

- Use `@databuddy/sdk/node`
- Prefer `apiKey` auth
- Call `flush()` before exit in serverless or short-lived runtimes

### Feature Flags

- Client-side flags in React use the SDK's flags helpers
- Server-side flag evaluation uses `createServerFlagsManager` from `@databuddy/sdk/node` with `clientId` (commonly `DATABUDDY_CLIENT_ID`)
- Flags are fetched from the main API host under `/public/v1/flags` (default base `https://api.databuddy.cc`), not from basket
- Feature flags need a website `clientId`, not API key-only auth

### REST API

- Auth: `x-api-key: dbdy_...` (preferred), or `Authorization: Bearer dbdy_...`
- Query analytics from `https://api.databuddy.cc/v1`
- Send events to `https://basket.databuddy.cc`

### LLM Observability

- Use `@databuddy/ai` for OpenAI, Anthropic, or Vercel AI SDK integrations
- Use `DATABUDDY_API_KEY`
- Only fall back to raw transport logic when the user needs a custom pipeline

## Event Design Rules

- Track user intent, value moments, and operational outcomes, not every click by default
- Prefer a small number of stable event names with useful low-cardinality properties
- Use `snake_case` for event names and property keys
- Do not track PII or secrets in event properties
- Avoid high-cardinality raw values unless they are essential for a specific workflow
- If the user asks what to instrument, propose a minimal event taxonomy first instead of dumping many events into the app

## Verification

- Browser SDK:
  - verify the Databuddy script loads
  - verify network requests reach `basket.databuddy.cc`
  - verify the correct `clientId` is configured
- Node SDK:
  - send one test event
  - call `flush()` if batching is enabled
  - confirm no auth or queue errors are logged
- REST API:
  - start with a simple authenticated query such as listing websites
  - then move to scoped analytics queries
- Feature flags:
  - wait for initialization before first read
  - test with a known flag key and user context

## Response Style

- Default to practical integration guidance and working examples
- Avoid internal monorepo details unless the user is debugging Databuddy itself
- If the user says "API", determine whether they mean:
  - analytics query API
  - event ingestion endpoint
  - feature flags API
  - LLM observability endpoint
