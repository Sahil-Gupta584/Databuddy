---
name: databuddy
description: Work effectively in the Databuddy monorepo. Use when the user asks to build, debug, review, or refactor anything in Databuddy, including the dashboard, api, basket ingest service, links service, docs app, uptime service, SDK, tracker, auth, RPC, database schema, ClickHouse, or shared packages.
---

# Databuddy

Databuddy is a Bun + Turborepo TypeScript monorepo. Start by locating the user request in one product surface, then trace its shared dependencies before editing.

For **external** integrations (SDK, CDN, public APIs), use the **`databuddy-integration`** skill; this skill is for **this repository**.

## Skill maintenance (required)

When a mistake could have been avoided with better repo context (wrong app, package, port, or pattern), or when the user corrects you or asks you to fix something you got wrong, **update this skill** (`SKILL.md` or `references/codebase-map.md`) in the same turn when practical.

Keep additions **minimal**: one bullet, a new `rg` hint, or a routing note—enough that the next session does not repeat it. If the lesson is for SDK/API customers, add it under `.agents/skills/databuddy-integration/` instead.

## Quick Map

- `apps/dashboard`: Next.js app on port `3000` (per-website **agent** chat: `@ai-sdk/react` `useChat` via `contexts/chat-context.tsx` — not the separate `chat-sdk` package; overlapping sends while streaming are queued client-side to mirror a “queue latest” strategy.)
- `apps/api`: Elysia API on port `3001`
- `apps/basket`: ingest and LLM tracking service, Elysia app on port `4000`
- `apps/docs`: Next.js + Fumadocs docs app on port `3005`
- `apps/links`: redirect/link service
- `apps/uptime`: uptime monitoring service
- `packages/db`: Drizzle Postgres schema, client, and ClickHouse helpers
- `packages/rpc`: shared oRPC router, procedures, auth-aware server context
- `packages/auth`: Better Auth setup, permissions, organization access
- `packages/env`: per-app env schemas
- `packages/shared`: shared types, flags, analytics schemas, utilities
- `packages/sdk`: published analytics SDK for React, Vue, and Node
- `packages/tracker`: internal tracker script build and release package
- `packages/ai`, `packages/notifications`, `packages/cache`, `packages/redis`, `packages/services`, `packages/validation`, `packages/api-keys`: shared infra and domain packages

Read [codebase-map.md](./references/codebase-map.md) when you need deeper routing guidance.

## Workflow

1. Identify the runtime surface first: dashboard UI, API, ingest pipeline, docs site, tracker, or shared package.
2. Read the owning package's `package.json`, entrypoint, and direct dependencies before changing code.
3. If the change crosses app boundaries, trace the contract:
   `dashboard -> apps/dashboard/lib/orpc.ts -> packages/rpc -> apps/api`
4. If the change touches analytics ingestion or LLM observability, trace:
   `packages/sdk` or `packages/tracker` -> `apps/basket` -> `packages/db` / ClickHouse
5. If the change touches auth, org permissions, or session-aware server behavior, inspect `packages/auth` and `packages/rpc` together.
6. Validate with the smallest relevant command instead of running the whole monorepo by default.

## Repo Conventions

- Package manager: `bun`
- Task runner: `turbo`
- Formatting/linting: `bun run format`, `bun run lint`
- Root dev orchestration: `bun run dev`
- Dashboard + API together: `bun run dev:dashboard`
- Tests at root currently target `./apps`: `bun run test`
- Database scripts are routed from root into `packages/db`
- Environment schemas live in `packages/env/src/*.ts`; update the matching app schema when adding env vars

## Change Routing

### Dashboard work

- Start in `apps/dashboard`
- Insights merged feed (`use-insights-feed`) collapses history + AI by `insightSignalDedupeKey` in `apps/dashboard/lib/insight-signal-key.ts` so the list is one row per signal (latest wins).
- Theme: `apps/dashboard/app/globals.css`. **`--border` is intentionally subtle**; do not crank it darker for “contrast” unless **iza** asks—prefer text tokens or layout for readability.
- For data loading and mutations, inspect `apps/dashboard/lib/orpc.ts` and the corresponding hooks/components
- Many changes require matching edits in `packages/rpc`

### API and RPC work

- Start in `apps/api/src`
- Shared API contracts and procedure logic live in `packages/rpc`
- Prefer changing shared router logic in `packages/rpc` rather than duplicating validation in the dashboard
- Analytics AI insights: `apps/api/src/routes/insights.ts` — dedupe key is `websiteId|type|direction` (direction from **signed** `changePercent`, not sentiment); within the cooldown window, matching rows are **updated** (same `id`) instead of inserting duplicates. **Do not** show `changePercent` in the UI with sentiment-based sign flips; the stored value is already signed.

### Ingestion and analytics pipeline

- Start in `apps/basket/src`
- Request validation, billing checks, geo/IP parsing, producer logic, and structured errors are important here
- Storage and schema concerns usually continue into `packages/db`

### Database work

- Postgres schema: `packages/db/src/drizzle/schema.ts`
- Relations: `packages/db/src/drizzle/relations.ts`
- Drizzle client: `packages/db/src/client.ts`
- ClickHouse helpers and schema: `packages/db/src/clickhouse/*`
- After schema changes, use the repo db scripts rather than ad hoc commands

### Auth and permissions

- Core auth setup: `packages/auth/src/auth.ts`
- Client auth entrypoint: `packages/auth/src/client/auth-client.ts`
- Permission helpers often flow through `packages/rpc`

### SDK and tracker work

- Published SDK logic: `packages/sdk/src`
- Browser tracker bundle: `packages/tracker/src`
- If the user reports missing analytics events, inspect both the producer side and `apps/basket`

## Verification

- Use targeted package commands when available, for example:
  - `bun run dev:dashboard`
  - `cd apps/api && bun test`
  - `cd packages/sdk && bun test`
  - `cd packages/tracker && bun run test:unit`
- If verification depends on services like Postgres, Redis, ClickHouse, or Redpanda, say so explicitly.

## Search Hints

- Use `rg "createRPCContext|appRouter|sessionProcedure" packages/rpc apps/api`
- Use `rg "NEXT_PUBLIC_API_URL|createEnv|shouldSkipValidation" packages/env apps/dashboard`
- Use `rg "clickHouse|ClickHouse|TABLE_NAMES" packages/db apps/basket apps/api`
- Use `rg "betterAuth|drizzleAdapter|organization" packages/auth packages/rpc apps/dashboard`
- Use `rg "trackRoute|basketRouter|llmRouter|structured-errors" apps/basket`
- Use `rg "insightDedupeKey|collapseInsightsBySignal|insightSignalDedupeKey" apps/api apps/dashboard`
