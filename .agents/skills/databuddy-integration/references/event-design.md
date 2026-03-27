# Databuddy Event Design

Use this file when the user asks:

- what custom events they should add
- which properties are worth tracking
- how to avoid useless or noisy analytics
- how to keep event names and properties query-friendly

This guidance is for external Databuddy users instrumenting their own product.

## Core Principle

Track decisions, milestones, and outcomes. Do not track every UI twitch just because it is easy.

Good analytics answers questions like:

- Where do users convert?
- Which features create repeat usage?
- Where do workflows fail?
- Which plans, channels, or entry points perform better?
- Which backend actions succeed, fail, or take too long?

If an event will not help answer a product, growth, support, or reliability question, it usually should not exist.

## What To Track

### Good Event Categories

- acquisition and onboarding
  - `signup_started`
  - `signup_completed`
  - `onboarding_completed`
- monetization
  - `checkout_started`
  - `purchase_completed`
  - `subscription_started`
  - `subscription_canceled`
- feature adoption
  - `feature_used`
  - `report_exported`
  - `integration_connected`
- funnel progression
  - `trial_started`
  - `invite_sent`
  - `project_created`
- operational backend signals
  - `api_call_succeeded`
  - `webhook_processed`
  - `job_failed`

### Usually Not Worth Tracking

- every generic button click with no business meaning
- mouse hovers, scroll events, and keystrokes by default
- events that only duplicate existing page view or auto-captured behavior
- highly local implementation details that will churn often
- values nobody will segment or alert on later

## Event Naming

Use stable `snake_case` names that describe a meaningful action or outcome.

Good:

```ts
track("signup_completed");
track("purchase_completed");
track("feature_used");
track("report_exported");
```

Avoid:

```ts
track("signupCompleted");
track("ButtonClick");
track("clicked_button_123");
track("modal");
```

Guidelines:

- Prefer past-tense outcome names for completed actions: `purchase_completed`
- Use verb-oriented names for user intent: `checkout_started`
- Reuse one event name with properties instead of creating dozens of near-duplicates

Prefer:

```ts
track("feature_used", {
  feature: "export",
  format: "csv",
});
```

Over:

```ts
track("csv_export_clicked");
track("xlsx_export_clicked");
track("pdf_export_clicked");
```

## Property Design

Properties should help segment and explain the event. Keep them small, stable, and interpretable.

Useful properties:

- plan or tier
- source or channel
- feature
- variant
- step
- method
- status
- currency
- revenue or value
- page or route pattern
- environment

Example:

```ts
track("signup_completed", {
  method: "google",
  plan: "pro",
  source: "landing_page",
});
```

## Low Cardinality Rules

Low cardinality means a field only takes a limited, reusable set of values. That makes breakdowns and filters much more useful.

Good low-cardinality properties:

- `plan: "free" | "pro" | "enterprise"`
- `method: "email" | "google" | "github"`
- `source: "landing_page" | "pricing" | "invite"`
- `status: "success" | "error"`

Higher-cardinality values should be used carefully:

- raw URL paths with IDs
- email addresses
- full names
- order IDs
- UUIDs
- free-form search text
- stack traces
- timestamps as properties

Rule of thumb:

- if a property could have thousands or millions of unique values, do not add it by default
- if you need it for debugging, prefer sending it only on a narrow class of backend or error events
- if the value can be bucketed or normalized, do that first

Prefer:

```ts
track("page_viewed", {
  page_type: "product",
  section: "pricing",
});
```

Over:

```ts
track("page_viewed", {
  path: "/products/9a84f457-7f19-4bc7-a5e9-6c8c9dc4a521?coupon=SPRING25",
});
```

## PII And Sensitive Data

Do not track:

- email addresses
- full names
- phone numbers
- street addresses
- payment card details
- auth tokens, API keys, or secrets

Usually avoid even if technically possible:

- exact search queries containing user-provided text
- full exception stacks on broad client-side events
- large JSON blobs or request payloads

Prefer coarse, non-sensitive summaries:

```ts
track("search_performed", {
  results_count: 18,
  category: "templates",
});
```

Instead of:

```ts
track("search_performed", {
  query: "john smith payroll complaint",
});
```

## Browser Event Patterns

### Good Browser Events

- signup CTA clicked
- pricing plan selected
- onboarding completed
- export started or completed
- invite sent
- checkout started
- purchase completed

### Use `trackAttributes` Sparingly

`trackAttributes` is useful for declarative instrumentation, but it can create noise if applied indiscriminately.

Use it for:

- a few important CTAs
- onboarding steps
- feature entry points

Do not use it as a blanket substitute for thinking about event design.

## Backend Event Patterns

Track backend events when the server is the source of truth or the browser cannot observe the outcome reliably.

Good examples:

```ts
await client.track({
  name: "webhook_processed",
  properties: {
    provider: "stripe",
    status: "success",
    event_type: "invoice.paid",
  },
});
```

```ts
await client.track({
  name: "job_failed",
  properties: {
    job: "nightly_export",
    stage: "upload",
    error_type: "timeout",
  },
});
```

Prefer categorized fields like `error_type`, `provider`, `stage`, or `status` over raw logs and exception dumps.

## Minimal Event Taxonomy Template

When the user asks what to instrument, start with a minimal set like this:

### SaaS product

- `signup_started`
- `signup_completed`
- `trial_started`
- `project_created`
- `invite_sent`
- `feature_used`
- `checkout_started`
- `purchase_completed`

### Content or marketing site

- `newsletter_signup`
- `demo_requested`
- `cta_clicked`
- `contact_submitted`
- `pricing_viewed`

### API or backend product

- `api_key_created`
- `request_succeeded`
- `request_failed`
- `webhook_processed`
- `integration_connected`

Then add properties like:

- `plan`
- `source`
- `feature`
- `method`
- `status`
- `variant`

## Review Checklist

Before recommending an event, check:

- does this answer a real business or product question?
- is the event name stable and clear?
- are the properties low-cardinality enough to segment usefully?
- are we avoiding PII and secrets?
- is this duplicating an existing auto-captured event?
- could a smaller taxonomy answer the same question?

## Repo References

Relevant public docs already present in Databuddy:

- [`apps/docs/content/docs/sdk/tracker.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/sdk/tracker.mdx)
- [`apps/docs/content/docs/hooks.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/hooks.mdx)
- [`apps/docs/content/docs/api/events.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/api/events.mdx)
- [`apps/docs/content/docs/getting-started.mdx`](/Users/iza/Dev/Databuddy/apps/docs/content/docs/getting-started.mdx)
