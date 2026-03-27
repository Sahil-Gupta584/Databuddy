import { auth } from "@databuddy/auth";
import {
	analyticsInsights,
	and,
	annotations,
	db,
	desc,
	eq,
	gte,
	inArray,
	insightUserFeedback,
	isNull,
	member,
	websites,
} from "@databuddy/db";
import { getRedisCache } from "@databuddy/redis";
import { generateText, Output } from "ai";
import dayjs from "dayjs";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import { z } from "zod";
import { models } from "../ai/config/models";
import { storeAnalyticsSummary } from "../lib/supermemory";
import { mergeWideEvent } from "../lib/tracing";
import { executeQuery } from "../query";

const CACHE_TTL = 900;
const CACHE_KEY_PREFIX = "ai-insights";
const TIMEOUT_MS = 60_000;
const QUERY_FETCH_TIMEOUT_MS = 45_000;
const MAX_WEBSITES = 5;
const CONCURRENCY = 3;
const GENERATION_COOLDOWN_HOURS = 6;
const RECENT_INSIGHTS_LOOKBACK_DAYS = 14;
const RECENT_INSIGHTS_PROMPT_LIMIT = 12;

const PATH_SEGMENT_ALNUM = /^[a-zA-Z0-9_-]+$/;
const DIGIT_CLASS = /\d/;
const LETTER_CLASS = /[a-zA-Z]/;
const LOWER_CLASS = /[a-z]/;
const UPPER_CLASS = /[A-Z]/;
const DASH_UNDERSCORE_SPLIT = /[-_]/g;

const insightSchema = z.object({
	title: z
		.string()
		.describe(
			"Brief headline under 60 chars with the key number. Never paste raw URL paths that contain opaque ID segments (long random slugs). Use human labels from Top Pages 'Human label' (e.g. 'Demo page', 'Pricing page', 'Home') instead of paths like /demo/xYz12…"
		),
	description: z
		.string()
		.describe(
			"2-4 complete sentences with specific numbers from BOTH periods; end with a full stop. Do not truncate mid-sentence or end with '...'. Name pages using human labels when the path has opaque IDs. Explain cause only when grounded in the data or annotations."
		),
	suggestion: z
		.string()
		.describe(
			"One or two sentences tied to THIS product's data only: cite concrete figures already in the summary, pages, errors, or referrers (e.g. two page paths, two visitor counts, or bounce/session metrics from the data). Do not give generic marketing platitudes or hypothetical tactics; if you recommend a CTA or experiment, anchor it to numbers you stated above. Bad: vague 'social proof' or 'limited-time offer' without data. Good: references actual pageviews, visitors, or rates from the prompt."
		),
	severity: z.enum(["critical", "warning", "info"]),
	sentiment: z
		.enum(["positive", "neutral", "negative"])
		.describe(
			"positive = improving metric, neutral = stable, negative = declining or broken"
		),
	priority: z
		.number()
		.min(1)
		.max(10)
		.describe(
			"1-10 from actionability × business impact, NOT raw % magnitude. User-facing errors, conversion/session drops, or reliability issues outrank vanity traffic spikes. A 5% drop in a meaningful engagement metric can score higher than a 70% visitor increase with no conversion context. Reserve 8-10 for issues that hurt users or revenue signals in the data."
		),
	type: z.enum([
		"error_spike",
		"new_errors",
		"vitals_degraded",
		"custom_event_spike",
		"traffic_drop",
		"traffic_spike",
		"bounce_rate_change",
		"engagement_change",
		"referrer_change",
		"page_trend",
		"positive_trend",
		"performance",
		"uptime_issue",
	]),
	changePercent: z
		.number()
		.optional()
		.describe("Percentage change between periods, e.g. -15.5 for a 15.5% drop"),
});

const insightsOutputSchema = z.object({
	insights: z
		.array(insightSchema)
		.max(3)
		.describe(
			"1-3 insights ranked by actionability × business impact. When the week is mostly positive, at least one insight MUST still call out a material risk or watch (e.g. session duration down, bounce up, single-channel dependency, volatile referrer, error count up in absolute terms) if those signals appear in the data—do not only celebrate wins. Skip repeating a narrative already listed under recently reported insights unless the change is materially new."
		),
});

type ParsedInsight = z.infer<typeof insightSchema>;

interface WebsiteInsight extends ParsedInsight {
	id: string;
	websiteId: string;
	websiteName: string | null;
	websiteDomain: string;
	link: string;
}

interface InsightsPayload {
	insights: WebsiteInsight[];
	source: "ai" | "fallback";
}

interface PeriodData {
	summary: Record<string, unknown>[];
	topPages: Record<string, unknown>[];
	errorSummary: Record<string, unknown>[];
	topReferrers: Record<string, unknown>[];
}

interface WeekOverWeekPeriod {
	current: { from: string; to: string };
	previous: { from: string; to: string };
}

interface OrgWebsiteRow {
	id: string;
	name: string | null;
	domain: string;
}

function humanizeMetricKey(key: string): string {
	return key.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetricValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "number") {
		return Number.isInteger(value) ? String(value) : value.toFixed(2);
	}
	if (typeof value === "boolean") {
		return value ? "yes" : "no";
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}

function formatObjectLine(record: Record<string, unknown>): string {
	return Object.entries(record)
		.filter(([, v]) => v !== null && v !== undefined)
		.map(([k, v]) => `${humanizeMetricKey(k)}: ${formatMetricValue(v)}`)
		.join(" | ");
}

function formatRowsBlock(
	rows: Record<string, unknown>[],
	sectionTitle: string
): string {
	if (rows.length === 0) {
		return "";
	}
	const lines = rows.map((row) => formatObjectLine(row));
	return `### ${sectionTitle}\n${lines.join("\n")}`;
}

function isOpaquePathSegment(segment: string): boolean {
	if (segment.length < 8) {
		return false;
	}
	if (!PATH_SEGMENT_ALNUM.test(segment)) {
		return false;
	}
	const hasDigit = DIGIT_CLASS.test(segment);
	const hasLetter = LETTER_CLASS.test(segment);
	if (segment.length >= 16) {
		return hasLetter || hasDigit;
	}
	return hasDigit || (LOWER_CLASS.test(segment) && UPPER_CLASS.test(segment));
}

function titleCasePathWords(segment: string): string {
	return segment
		.replaceAll(DASH_UNDERSCORE_SPLIT, " ")
		.split(" ")
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(" ");
}

/** Readable page name for titles; raw path may still appear in data rows for accuracy. */
function humanizePagePathForPrompt(rawPath: string): string {
	const path = rawPath.trim() || "/";
	if (path === "/" || path === "") {
		return "Home";
	}
	const segments = path.split("/").filter(Boolean);
	const last = segments.at(-1) ?? "";
	if (isOpaquePathSegment(last) && segments.length >= 2) {
		const parent = segments.at(-2) ?? "";
		if (parent && !isOpaquePathSegment(parent)) {
			return `${titleCasePathWords(parent)} page`;
		}
		return "Page";
	}
	if (isOpaquePathSegment(last)) {
		return "Page";
	}
	return `${titleCasePathWords(last)} page`;
}

function formatTopPagesBlock(rows: Record<string, unknown>[]): string {
	if (rows.length === 0) {
		return "";
	}
	const lines = rows.map((row) => {
		const rawName =
			typeof row.name === "string" ? row.name : String(row.name ?? "");
		const human = humanizePagePathForPrompt(rawName);
		const base = formatObjectLine(row);
		return `${base} | Human label (use in titles, not raw paths with IDs): ${human}`;
	});
	return `### Top Pages\n${lines.join("\n")}`;
}

function directionKeyFromParts(
	changePercent: number | null | undefined,
	sentiment: ParsedInsight["sentiment"]
): "up" | "down" | "flat" {
	if (
		changePercent !== null &&
		changePercent !== undefined &&
		changePercent !== 0
	) {
		return changePercent > 0 ? "up" : "down";
	}
	if (sentiment === "positive") {
		return "up";
	}
	if (sentiment === "negative") {
		return "down";
	}
	return "flat";
}

function insightDedupeKey(
	websiteId: string,
	type: ParsedInsight["type"],
	sentiment: ParsedInsight["sentiment"],
	changePercent: number | null | undefined
): string {
	const dir = directionKeyFromParts(changePercent, sentiment);
	return `${websiteId}|${type}|${dir}`;
}

async function fetchInsightDedupeKeys(
	organizationId: string
): Promise<Set<string>> {
	const cutoff = dayjs().subtract(GENERATION_COOLDOWN_HOURS, "hour").toDate();
	const rows = await db
		.select({
			websiteId: analyticsInsights.websiteId,
			type: analyticsInsights.type,
			sentiment: analyticsInsights.sentiment,
			changePercent: analyticsInsights.changePercent,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				gte(analyticsInsights.createdAt, cutoff)
			)
		);
	const keys = new Set<string>();
	for (const r of rows) {
		keys.add(
			insightDedupeKey(
				r.websiteId,
				r.type as ParsedInsight["type"],
				r.sentiment as ParsedInsight["sentiment"],
				r.changePercent
			)
		);
	}
	return keys;
}

function runQueryWithTimeout<T>(
	label: string,
	fn: () => Promise<T>
): Promise<T> {
	return Promise.race([
		fn(),
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`${label} timed out`));
			}, QUERY_FETCH_TIMEOUT_MS);
		}),
	]);
}

function getWeekOverWeekPeriod(): WeekOverWeekPeriod {
	const now = dayjs();
	return {
		current: {
			from: now.subtract(7, "day").format("YYYY-MM-DD"),
			to: now.format("YYYY-MM-DD"),
		},
		previous: {
			from: now.subtract(14, "day").format("YYYY-MM-DD"),
			to: now.subtract(7, "day").format("YYYY-MM-DD"),
		},
	};
}

async function fetchPeriodData(
	websiteId: string,
	domain: string,
	from: string,
	to: string,
	timezone: string
): Promise<PeriodData> {
	const base = { projectId: websiteId, from, to, timezone };

	const safe = async (
		label: string,
		run: () => Promise<Record<string, unknown>[]>
	): Promise<Record<string, unknown>[]> => {
		try {
			const value = await runQueryWithTimeout(label, run);
			return Array.isArray(value) ? value : [];
		} catch (error) {
			useLogger().warn("Insights period query failed or timed out", {
				insights: { websiteId, label, error },
			});
			return [];
		}
	};

	const [summary, topPages, errorSummary, topReferrers] = await Promise.all([
		safe("summary_metrics", () =>
			executeQuery({ ...base, type: "summary_metrics" }, domain, timezone)
		),
		safe("top_pages", () =>
			executeQuery({ ...base, type: "top_pages", limit: 10 }, domain, timezone)
		),
		safe("error_summary", () =>
			executeQuery({ ...base, type: "error_summary" }, domain, timezone)
		),
		safe("top_referrers", () =>
			executeQuery(
				{ ...base, type: "top_referrers", limit: 10 },
				domain,
				timezone
			)
		),
	]);

	return {
		summary,
		topPages,
		errorSummary,
		topReferrers,
	};
}

function formatDataForPrompt(
	current: PeriodData,
	previous: PeriodData,
	currentRange: { from: string; to: string },
	previousRange: { from: string; to: string }
): string {
	const sections: string[] = [];

	sections.push(
		`## Current Period (${currentRange.from} to ${currentRange.to})`
	);
	sections.push(formatRowsBlock(current.summary, "Summary"));
	if (current.topPages.length > 0) {
		sections.push(formatTopPagesBlock(current.topPages));
	}
	if (current.errorSummary.length > 0) {
		sections.push(formatRowsBlock(current.errorSummary, "Errors"));
	}
	if (current.topReferrers.length > 0) {
		sections.push(formatRowsBlock(current.topReferrers, "Top Referrers"));
	}

	sections.push(
		`\n## Previous Period (${previousRange.from} to ${previousRange.to})`
	);
	sections.push(formatRowsBlock(previous.summary, "Summary"));
	if (previous.topPages.length > 0) {
		sections.push(formatTopPagesBlock(previous.topPages));
	}
	if (previous.errorSummary.length > 0) {
		sections.push(formatRowsBlock(previous.errorSummary, "Errors"));
	}
	if (previous.topReferrers.length > 0) {
		sections.push(formatRowsBlock(previous.topReferrers, "Top Referrers"));
	}

	return sections.filter(Boolean).join("\n\n");
}

async function fetchRecentAnnotations(websiteId: string): Promise<string> {
	const since = dayjs().subtract(14, "day").toDate();

	const rows = await db
		.select({
			text: annotations.text,
			xValue: annotations.xValue,
			tags: annotations.tags,
		})
		.from(annotations)
		.where(
			and(
				eq(annotations.websiteId, websiteId),
				gte(annotations.xValue, since),
				isNull(annotations.deletedAt)
			)
		)
		.orderBy(annotations.xValue)
		.limit(20);

	if (rows.length === 0) {
		return "";
	}

	const lines = rows.map((r) => {
		const date = dayjs(r.xValue).format("YYYY-MM-DD");
		const tags = r.tags?.length ? ` [${r.tags.join(", ")}]` : "";
		return `- ${date}: ${r.text}${tags}`;
	});

	return `\n\nUser annotations (known events that may explain changes):\n${lines.join("\n")}`;
}

async function fetchRecentInsightsForPrompt(
	organizationId: string,
	websiteId: string
): Promise<string> {
	const since = dayjs().subtract(RECENT_INSIGHTS_LOOKBACK_DAYS, "day").toDate();

	const rows = await db
		.select({
			title: analyticsInsights.title,
			type: analyticsInsights.type,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				eq(analyticsInsights.websiteId, websiteId),
				gte(analyticsInsights.createdAt, since)
			)
		)
		.orderBy(desc(analyticsInsights.createdAt))
		.limit(RECENT_INSIGHTS_PROMPT_LIMIT);

	if (rows.length === 0) {
		return "";
	}

	const lines = rows.map(
		(r) =>
			`- [${r.type}] ${r.title} (${dayjs(r.createdAt).format("YYYY-MM-DD")})`
	);

	return `\n\n## Recently reported insights for this website (avoid repeating the same narrative unless something materially changed)\n${lines.join("\n")}`;
}

function formatOrgWebsitesContext(
	orgSites: OrgWebsiteRow[],
	currentWebsiteId: string
): string {
	if (orgSites.length <= 1) {
		return "";
	}
	const sorted = [...orgSites].sort((a, b) =>
		a.domain.localeCompare(b.domain, "en")
	);
	const lines = sorted.map((s) => {
		const label = s.name?.trim() ? s.name.trim() : s.domain;
		const marker =
			s.id === currentWebsiteId
				? " — **metrics below are for this site only**"
				: "";
		return `- ${label} (${s.domain})${marker}`;
	});
	return `## Organization websites (same account, separate analytics)
Each row is a different tracked property (e.g. marketing site vs app vs docs). The week-over-week metrics in this message apply only to the site marked "metrics below". Do not blend numbers across rows. If referrers include another domain from this list, treat it as cross-property traffic (e.g. landing → product) and name both sides clearly.

${lines.join("\n")}

`;
}

const INSIGHTS_SYSTEM_PROMPT = `You are an analytics insights engine. Your job is to find the 1-3 most significant findings from week-over-week website data, written like an analyst: descriptive where needed, but every insight MUST include a prescriptive "so what / now what" in the suggestion field.

Priority scoring (priority 1-10):
- Score by actionability × business impact, NOT by how large the percentage move is. Traffic spikes without conversion or outcome context are lower priority than errors, session/engagement collapses, or clear negative trends affecting users.
- Operational health (errors, reliability) often matters more than vanity traffic growth. A moderate error-rate improvement during high traffic can be high value.
- Do not assign 8-10 to pure volume spikes unless the data also shows a linked risk or opportunity worth acting on.

Significance thresholds (for what to mention):
- Traffic (pageviews/visitors/sessions): <5% change = only mention if nothing else notable. 5-15% = worth noting. >15% = significant. >30% = notable volume change.
- Errors: new error types = always report. Error rate up >0.5% = warning. Error rate up >2% = critical.
- Bounce rate: change >5 percentage points = notable.
- Pages: new page entering top 10 or page dropping out = notable. Individual page change >25% = significant.
- Referrers: new source appearing or major source declining >20% = notable.

Anti-redundancy:
- If the user message includes a "Recently reported insights" section, treat those as already surfaced. Do NOT output a new insight that tells the same story (same underlying signal and direction) unless the narrative would be materially different (e.g. new root cause, reversal, or threshold crossed). Prefer novel angles or omit.

Data boundaries:
- Only use metrics present in the summary, pages, errors, and referrers sections. Do not invent funnel conversion rates, MRR, revenue, cohort retention, or signup counts unless they appear in the data.
- If conversion or goal data appears in summary_metrics, you may connect traffic to outcomes. If absent, do not fabricate funnel or revenue insights.

Multi-property organizations:
- When the user message includes "Organization websites", each bullet is a separate site in the same account. Titles and descriptions MUST name which property (domain or product label from the list) the insight applies to—do not assume the reader knows which site is "app" vs marketing.
- Referrers that appear as another domain in that list are cross-site traffic: explain the relationship (e.g. www → app) instead of treating them like generic external referrers.

Suggestion field (required quality):
- Must answer "what should we do next?" in one or two sentences grounded in the actual metrics shown (repeat or reference specific counts, rates, or page labels from the data). This is an analytics product—avoid generic marketing coaching ("social proof", "limited-time offer") unless you tie it to a concrete gap in the numbers (e.g. two paths' visitor counts, bounce rate, session duration).
- Bad: "Monitor traffic", "Keep an eye on this", "Consider reviewing analytics", vague growth tactics without figures.
- Good: tie to pages, channels, CTAs, error classes, or experiments using numbers already in the prompt.

Titles and page paths:
- Never put raw URL paths with opaque ID segments in the title (no long random slugs). Use the Human label from Top Pages (e.g. "Demo page", "Pricing page").

Balanced weeks (mostly positive metrics):
- Still surface at least one insight that highlights a downside risk or watch item when the data supports it: e.g. median session duration down, bounce up, errors up in absolute count, heavy reliance on one volatile referrer or channel. If you only report wins when those signals exist, you are failing the user.

Rules:
- Every insight MUST include specific numbers from both periods where applicable.
- If annotations explain a change, mention it but still report the data.
- If everything is stable, return ONE positive/neutral insight (e.g. "Steady at 2,400 weekly visitors") with a light suggestion if appropriate.
- Never fabricate or round numbers beyond what's in the data`;

async function analyzeWebsite(
	organizationId: string,
	userId: string,
	websiteId: string,
	domain: string,
	timezone: string,
	period: WeekOverWeekPeriod,
	orgSites: OrgWebsiteRow[]
): Promise<ParsedInsight[]> {
	const currentRange = period.current;
	const previousRange = period.previous;

	const [current, previous, annotationContext, recentInsightsBlock] =
		await Promise.all([
			fetchPeriodData(
				websiteId,
				domain,
				currentRange.from,
				currentRange.to,
				timezone
			),
			fetchPeriodData(
				websiteId,
				domain,
				previousRange.from,
				previousRange.to,
				timezone
			),
			fetchRecentAnnotations(websiteId),
			fetchRecentInsightsForPrompt(organizationId, websiteId),
		]);

	const hasData = current.summary.length > 0 || current.topPages.length > 0;
	if (!hasData) {
		return [];
	}

	const dataSection = formatDataForPrompt(
		current,
		previous,
		currentRange,
		previousRange
	);

	const orgContext = formatOrgWebsitesContext(orgSites, websiteId);
	const prompt = `Analyze this website's week-over-week data and return insights.\n\n${orgContext}${dataSection}${annotationContext}${recentInsightsBlock}`;

	try {
		const result = await generateText({
			model: models.analytics,
			output: Output.object({ schema: insightsOutputSchema }),
			system: INSIGHTS_SYSTEM_PROMPT,
			prompt,
			temperature: 0.2,
			maxOutputTokens: 8192,
			abortSignal: AbortSignal.timeout(TIMEOUT_MS),
			experimental_telemetry: {
				isEnabled: true,
				functionId: "databuddy.insights.analyze_website",
				metadata: {
					source: "insights",
					feature: "smart_insights",
					organizationId,
					userId,
					websiteId,
					websiteDomain: domain,
					timezone,
				},
			},
		});

		if (!result.output) {
			useLogger().warn("No structured output from insights model", {
				insights: { websiteId },
			});
			return [];
		}

		return result.output.insights;
	} catch (error) {
		useLogger().warn("Failed to generate insights", {
			insights: { websiteId, error },
		});
		return [];
	}
}

async function processInBatches<T, R>(
	items: T[],
	action: (item: T) => Promise<R>,
	limit: number
): Promise<R[]> {
	const results: R[] = [];
	let nextIndex = 0;

	async function worker() {
		while (true) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= items.length) {
				break;
			}
			const item = items[index];
			if (item === undefined) {
				break;
			}
			results.push(await action(item));
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => worker())
	);
	return results;
}

async function getRecentInsightsFromDb(
	organizationId: string
): Promise<WebsiteInsight[] | null> {
	const cutoff = dayjs().subtract(GENERATION_COOLDOWN_HOURS, "hour").toDate();

	const rows = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			websiteName: websites.name,
			websiteDomain: websites.domain,
			title: analyticsInsights.title,
			description: analyticsInsights.description,
			suggestion: analyticsInsights.suggestion,
			severity: analyticsInsights.severity,
			sentiment: analyticsInsights.sentiment,
			type: analyticsInsights.type,
			priority: analyticsInsights.priority,
			changePercent: analyticsInsights.changePercent,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				gte(analyticsInsights.createdAt, cutoff),
				isNull(websites.deletedAt)
			)
		)
		.orderBy(desc(analyticsInsights.priority))
		.limit(10);

	if (rows.length === 0) {
		return null;
	}

	return rows.map(
		(r): WebsiteInsight => ({
			id: r.id,
			websiteId: r.websiteId,
			websiteName: r.websiteName,
			websiteDomain: r.websiteDomain,
			link: `/websites/${r.websiteId}`,
			title: r.title,
			description: r.description,
			suggestion: r.suggestion,
			severity: r.severity as ParsedInsight["severity"],
			sentiment: r.sentiment as ParsedInsight["sentiment"],
			type: r.type as ParsedInsight["type"],
			priority: r.priority,
			changePercent: r.changePercent ?? undefined,
		})
	);
}

function getRedis() {
	try {
		return getRedisCache();
	} catch {
		return null;
	}
}

async function invalidateInsightsCacheForOrg(
	organizationId: string
): Promise<void> {
	const redis = getRedis();
	if (!redis) {
		return;
	}
	const pattern = `${CACHE_KEY_PREFIX}:${organizationId}:*`;
	let cursor = "0";
	try {
		do {
			const [nextCursor, keys] = (await redis.scan(
				cursor,
				"MATCH",
				pattern,
				"COUNT",
				100
			)) as [string, string[]];
			cursor = nextCursor;
			if (keys.length > 0) {
				await redis.del(...keys);
			}
		} while (cursor !== "0");
	} catch (error) {
		useLogger().info("Insights cache invalidation scan failed (best-effort)", {
			insights: { organizationId, error },
		});
	}
}

export const insights = new Elysia({ prefix: "/v1/insights" })
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		return { user: session?.user ?? null };
	})
	.onBeforeHandle(({ user, set }) => {
		if (!user) {
			mergeWideEvent({ insights_ai_auth: "unauthorized" });
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}
	})
	.get(
		"/history",
		async ({ query, user, set }) => {
			const userId = user?.id;
			if (!userId) {
				return { success: false, error: "User ID required", insights: [] };
			}

			const { organizationId, websiteId: websiteIdFilter } = query;
			const limitParsed = Number.parseInt(query.limit ?? "50", 10);
			const limit = Number.isFinite(limitParsed)
				? Math.min(Math.max(limitParsed, 1), 100)
				: 50;
			const offsetParsed = Number.parseInt(query.offset ?? "0", 10);
			const offset = Number.isFinite(offsetParsed)
				? Math.max(offsetParsed, 0)
				: 0;

			mergeWideEvent({ insights_history_org_id: organizationId });

			const memberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = new Set(memberships.map((m) => m.organizationId));
			if (!orgIds.has(organizationId)) {
				mergeWideEvent({ insights_history_access: "denied" });
				set.status = 403;
				return {
					success: false,
					error: "Access denied to this organization",
					insights: [],
				};
			}

			const whereClause = websiteIdFilter
				? and(
						eq(analyticsInsights.organizationId, organizationId),
						eq(analyticsInsights.websiteId, websiteIdFilter),
						isNull(websites.deletedAt)
					)
				: and(
						eq(analyticsInsights.organizationId, organizationId),
						isNull(websites.deletedAt)
					);

			const rows = await db
				.select({
					id: analyticsInsights.id,
					runId: analyticsInsights.runId,
					websiteId: analyticsInsights.websiteId,
					websiteName: websites.name,
					websiteDomain: websites.domain,
					title: analyticsInsights.title,
					description: analyticsInsights.description,
					suggestion: analyticsInsights.suggestion,
					severity: analyticsInsights.severity,
					sentiment: analyticsInsights.sentiment,
					type: analyticsInsights.type,
					priority: analyticsInsights.priority,
					changePercent: analyticsInsights.changePercent,
					createdAt: analyticsInsights.createdAt,
					currentPeriodFrom: analyticsInsights.currentPeriodFrom,
					currentPeriodTo: analyticsInsights.currentPeriodTo,
					previousPeriodFrom: analyticsInsights.previousPeriodFrom,
					previousPeriodTo: analyticsInsights.previousPeriodTo,
					timezone: analyticsInsights.timezone,
				})
				.from(analyticsInsights)
				.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
				.where(whereClause)
				.orderBy(desc(analyticsInsights.createdAt))
				.limit(limit)
				.offset(offset);

			const insights = rows.map((r) => ({
				id: r.id,
				runId: r.runId,
				websiteId: r.websiteId,
				websiteName: r.websiteName,
				websiteDomain: r.websiteDomain,
				link: `/websites/${r.websiteId}`,
				title: r.title,
				description: r.description,
				suggestion: r.suggestion,
				severity: r.severity,
				sentiment: r.sentiment,
				type: r.type,
				priority: r.priority,
				changePercent: r.changePercent ?? undefined,
				createdAt: r.createdAt.toISOString(),
				currentPeriodFrom: r.currentPeriodFrom,
				currentPeriodTo: r.currentPeriodTo,
				previousPeriodFrom: r.previousPeriodFrom,
				previousPeriodTo: r.previousPeriodTo,
				timezone: r.timezone,
			}));

			return {
				success: true,
				insights,
				hasMore: rows.length === limit,
			};
		},
		{
			query: t.Object({
				organizationId: t.String(),
				limit: t.Optional(t.String()),
				offset: t.Optional(t.String()),
				websiteId: t.Optional(t.String()),
			}),
		}
	)
	.post(
		"/clear",
		async ({ body, user, set }) => {
			const userId = user?.id;
			if (!userId) {
				return { success: false, error: "User ID required", deleted: 0 };
			}

			const { organizationId } = body;
			mergeWideEvent({ insights_clear_org_id: organizationId });

			const memberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = new Set(memberships.map((m) => m.organizationId));
			if (!orgIds.has(organizationId)) {
				set.status = 403;
				return {
					success: false,
					error: "Access denied to this organization",
					deleted: 0,
				};
			}

			const idRows = await db
				.select({ id: analyticsInsights.id })
				.from(analyticsInsights)
				.where(eq(analyticsInsights.organizationId, organizationId));

			const ids = idRows.map((r) => r.id);

			if (ids.length > 0) {
				await db
					.delete(insightUserFeedback)
					.where(
						and(
							eq(insightUserFeedback.organizationId, organizationId),
							inArray(insightUserFeedback.insightId, ids)
						)
					);
				await db
					.delete(analyticsInsights)
					.where(eq(analyticsInsights.organizationId, organizationId));
			}

			await invalidateInsightsCacheForOrg(organizationId);
			mergeWideEvent({ insights_cleared: ids.length });

			return { success: true, deleted: ids.length };
		},
		{
			body: t.Object({
				organizationId: t.String(),
			}),
		}
	)
	.post(
		"/ai",
		async ({ body, user, set }) => {
			const userId = user?.id;
			if (!userId) {
				mergeWideEvent({ insights_ai_error: "missing_user_id" });
				return { success: false, error: "User ID required", insights: [] };
			}

			const { organizationId, timezone = "UTC" } = body;
			mergeWideEvent({
				insights_org_id: organizationId,
				insights_timezone: timezone,
			});

			const redis = getRedis();
			const cacheKey = `${CACHE_KEY_PREFIX}:${organizationId}:${timezone}`;

			if (redis) {
				try {
					const cached = await redis.get(cacheKey);
					if (cached) {
						mergeWideEvent({ insights_cache: "hit" });
						const payload = JSON.parse(cached) as InsightsPayload;
						return { success: true, ...payload };
					}
				} catch (error) {
					useLogger().info(
						"Insights cache read failed; continuing without cache",
						{
							insights: { error },
						}
					);
				}
			}

			mergeWideEvent({ insights_cache: "miss" });

			const memberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = new Set(memberships.map((m) => m.organizationId));
			if (!orgIds.has(organizationId)) {
				mergeWideEvent({ insights_access: "denied" });
				set.status = 403;
				return {
					success: false,
					error: "Access denied to this organization",
					insights: [],
				};
			}

			const recentInsights = await getRecentInsightsFromDb(organizationId);
			if (recentInsights) {
				mergeWideEvent({
					insights_returned: recentInsights.length,
					insights_source: "db_cooldown",
				});
				const payload: InsightsPayload = {
					insights: recentInsights,
					source: "ai",
				};
				if (redis) {
					redis
						.setex(cacheKey, CACHE_TTL, JSON.stringify(payload))
						.catch(() => {});
				}
				return { success: true, ...payload };
			}

			const orgSites = await db.query.websites.findMany({
				where: and(
					eq(websites.organizationId, organizationId),
					isNull(websites.deletedAt)
				),
				columns: { id: true, name: true, domain: true },
			});

			if (orgSites.length === 0) {
				mergeWideEvent({ insights_websites: 0 });
				return { success: true, insights: [], source: "ai" };
			}

			try {
				const period = getWeekOverWeekPeriod();
				const dedupeKeys = await fetchInsightDedupeKeys(organizationId);
				const groups = await processInBatches(
					orgSites.slice(0, MAX_WEBSITES),
					async (site: { id: string; name: string | null; domain: string }) => {
						const results = await analyzeWebsite(
							organizationId,
							userId,
							site.id,
							site.domain,
							timezone,
							period,
							orgSites
						);
						return results.map(
							(insight): WebsiteInsight => ({
								...insight,
								id: crypto.randomUUID(),
								websiteId: site.id,
								websiteName: site.name,
								websiteDomain: site.domain,
								link: `/websites/${site.id}`,
							})
						);
					},
					CONCURRENCY
				);

				const merged = groups.flat().sort((a, b) => b.priority - a.priority);
				const seen = new Set(dedupeKeys);
				const sorted: WebsiteInsight[] = [];
				for (const insight of merged) {
					const key = insightDedupeKey(
						insight.websiteId,
						insight.type,
						insight.sentiment,
						insight.changePercent ?? null
					);
					if (seen.has(key)) {
						continue;
					}
					seen.add(key);
					sorted.push(insight);
					if (sorted.length >= 10) {
						break;
					}
				}

				const runId = crypto.randomUUID();
				let finalInsights: WebsiteInsight[] = sorted;
				if (sorted.length > 0) {
					const rows = sorted.map((insight) => ({
						id: insight.id,
						organizationId,
						websiteId: insight.websiteId,
						runId,
						title: insight.title,
						description: insight.description,
						suggestion: insight.suggestion,
						severity: insight.severity,
						sentiment: insight.sentiment,
						type: insight.type,
						priority: insight.priority,
						changePercent: insight.changePercent ?? null,
						timezone,
						currentPeriodFrom: period.current.from,
						currentPeriodTo: period.current.to,
						previousPeriodFrom: period.previous.from,
						previousPeriodTo: period.previous.to,
					}));

					try {
						await db.insert(analyticsInsights).values(rows);
					} catch (error) {
						useLogger().warn("Failed to persist analytics insights", {
							insights: { organizationId, error },
						});
						finalInsights = [];
						mergeWideEvent({ insights_persist_failed: true });
					}
				}

				for (const site of orgSites.slice(0, MAX_WEBSITES)) {
					const siteInsights = finalInsights.filter(
						(s) => s.websiteId === site.id
					);
					if (siteInsights.length > 0) {
						const summary = siteInsights
							.map(
								(s) =>
									`[${s.severity}] ${s.title}: ${s.description} Suggestion: ${s.suggestion}`
							)
							.join("\n");
						storeAnalyticsSummary(
							`Weekly insights for ${site.domain} (${dayjs().format("YYYY-MM-DD")}):\n${summary}`,
							site.id,
							{ period: "weekly" }
						).catch((error: unknown) => {
							useLogger().warn("Failed to store analytics summary", {
								insights: { websiteId: site.id, error },
							});
						});
					}
				}

				const payload: InsightsPayload = {
					insights: finalInsights,
					source: "ai",
				};

				if (redis && finalInsights.length > 0) {
					redis
						.setex(cacheKey, CACHE_TTL, JSON.stringify(payload))
						.catch(() => {});
				}

				if (redis && finalInsights.length === 0) {
					redis
						.setex(cacheKey, CACHE_TTL / 3, JSON.stringify(payload))
						.catch(() => {});
				}

				mergeWideEvent({
					insights_returned: finalInsights.length,
					insights_source: "ai",
				});
				return { success: true, ...payload };
			} catch (error) {
				mergeWideEvent({ insights_error: true });
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ insights: { organizationId } }
				);
				return { success: false, insights: [], source: "fallback" };
			}
		},
		{
			body: t.Object({
				organizationId: t.String(),
				timezone: t.Optional(t.String()),
			}),
			idleTimeout: 240_000,
		}
	);
