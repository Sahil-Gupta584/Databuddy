import { chQuery, convertClickhouseDateToJs } from "@databuddy/db";
import { referrers } from "@databuddy/shared/lists/referrers";

export interface AnalyticsStep {
	step_number: number;
	name: string;
	type: "PAGE_VIEW" | "EVENT";
	target: string;
}

export interface StepErrorInsight {
	message: string;
	error_type: string;
	count: number;
}

export interface StepAnalytics {
	step_number: number;
	step_name: string;
	users: number;
	total_users: number;
	conversion_rate: number;
	dropoffs: number;
	dropoff_rate: number;
	avg_time_to_complete: number;
	error_count: number;
	error_rate: number;
	top_errors: StepErrorInsight[];
}

export interface FunnelTimeSeriesPoint {
	date: string;
	users: number;
	conversions: number;
	conversion_rate: number;
	dropoffs: number;
	avg_time: number;
}

export interface FunnelAnalytics {
	overall_conversion_rate: number;
	total_users_entered: number;
	total_users_completed: number;
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	biggest_dropoff_step: number;
	biggest_dropoff_rate: number;
	steps_analytics: StepAnalytics[];
	time_series?: FunnelTimeSeriesPoint[];
	error_insights: {
		total_errors: number;
		sessions_with_errors: number;
		dropoffs_with_errors: number;
		error_correlation_rate: number;
	};
}

export interface ReferrerAnalytics {
	referrer: string;
	referrer_parsed: { name: string; type: string; domain: string };
	total_users: number;
	completed_users: number;
	conversion_rate: number;
}

export type ClickhouseQueryParamValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly string[]
	| readonly number[];

export type ClickhouseQueryParams = Record<string, ClickhouseQueryParamValue>;

interface Filter {
	field: string;
	operator: string;
	value: string | readonly string[];
}
interface ParsedReferrer {
	name: string;
	type: string;
	domain: string;
}

// Helpers
const ESCAPE_BACKSLASH_REGEX = /\\/g;
const ESCAPE_LIKE_WILDCARDS_REGEX = /[%_]/g;
const WWW_PREFIX_REGEX = /^www\./;

const escapeClickhouseString = (value: string): string =>
	value
		.replace(ESCAPE_BACKSLASH_REGEX, "\\\\")
		.replace(ESCAPE_LIKE_WILDCARDS_REGEX, "\\$&");

const formatDuration = (seconds: number): string => {
	if (!seconds || seconds <= 0) {
		return "—";
	}
	if (seconds < 60) {
		return `${Math.round(seconds)}s`;
	}
	if (seconds < 3600) {
		const m = Math.floor(seconds / 60);
		const s = Math.round(seconds % 60);
		return s > 0 ? `${m}m ${s}s` : `${m}m`;
	}
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const avg = (arr: number[]): number =>
	arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

const pct = (num: number, denom: number): number =>
	denom > 0 ? Math.round((num / denom) * 10_000) / 100 : 0;

/** ClickHouse JSON often returns UInt64 as string; coercing avoids NaN and string concat bugs. */
function toFiniteNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "bigint") {
		const n = Number(value);
		return Number.isFinite(n) ? n : fallback;
	}
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * DateTime64 columns arrive as ISO-like strings from ClickHouse JSON; only Int* types are
 * coerced to numbers in chQuery (see packages/db/src/clickhouse/client.ts).
 * Seconds since Unix epoch for funnel step ordering and daily buckets.
 */
function parseClickhouseTimestampSeconds(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "bigint") {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}
	if (typeof value === "string" && value.length > 0) {
		const ms = convertClickhouseDateToJs(value).getTime();
		return Number.isFinite(ms) ? ms / 1000 : 0;
	}
	return 0;
}

const parseReferrer = (ref: string): ParsedReferrer => {
	if (!ref || ref === "Direct" || ref.toLowerCase() === "(direct)") {
		return { name: "Direct", type: "direct", domain: "" };
	}

	try {
		const url = new URL(ref.includes("://") ? ref : `https://${ref}`);
		const host = url.hostname.replace(WWW_PREFIX_REGEX, "").toLowerCase();
		const known = referrers[url.hostname] || referrers[host];

		return known
			? { name: known.name, type: known.type, domain: host }
			: { name: host, type: "referrer", domain: host };
	} catch {
		return { name: ref, type: "referrer", domain: "" };
	}
};

// Filter building
const FIELDS = new Set([
	"event_name",
	"path",
	"referrer",
	"user_agent",
	"country",
	"city",
	"device_type",
	"browser_name",
	"os_name",
	"screen_resolution",
	"language",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
]);

const OPS = new Set([
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"starts_with",
	"ends_with",
	"in",
	"not_in",
	"is_null",
	"is_not_null",
]);

const buildFilterSQL = (
	filters: Filter[],
	params: ClickhouseQueryParams
): string => {
	const parts: string[] = [];

	for (let i = 0; i < filters.length; i++) {
		const { field, operator, value } = filters[i];
		if (!(FIELDS.has(field) && OPS.has(operator))) {
			continue;
		}

		const key = `f${i}`;

		if (operator === "is_null") {
			parts.push(`${field} IS NULL`);
			continue;
		}

		if (operator === "is_not_null") {
			parts.push(`${field} IS NOT NULL`);
			continue;
		}

		// Preserve historical behavior: if value is an array, treat it as IN/NOT IN.
		// (Even if the operator isn't "in", the old code defaulted to NOT IN.)
		if (Array.isArray(value)) {
			params[key] = value;
			parts.push(
				`${field} ${operator === "in" ? "IN" : "NOT IN"} {${key}:Array(String)}`
			);
			continue;
		}

		if (typeof value !== "string") {
			continue;
		}

		switch (operator) {
			default: {
				const escaped = escapeClickhouseString(value);

				if (operator === "contains" || operator === "not_contains") {
					params[key] = `%${escaped}%`;
					parts.push(
						`${field} ${operator === "contains" ? "LIKE" : "NOT LIKE"} {${key}:String}`
					);
					break;
				}

				if (operator === "starts_with") {
					params[key] = `${escaped}%`;
					parts.push(`${field} LIKE {${key}:String}`);
					break;
				}

				if (operator === "ends_with") {
					params[key] = `%${escaped}`;
					parts.push(`${field} LIKE {${key}:String}`);
					break;
				}

				params[key] = escaped;
				parts.push(
					`${field} ${operator === "equals" ? "=" : "!="} {${key}:String}`
				);
				break;
			}
		}
	}

	return parts.length > 0 ? ` AND ${parts.join(" AND ")}` : "";
};

// Query building
const buildTimeRangeWhere = (timeColumn: "time" | "timestamp") =>
	`${timeColumn} >= parseDateTimeBestEffort({startDate:String})
		AND ${timeColumn} <= parseDateTimeBestEffort({endDate:String})`;

const buildBaseWhere = (
	timeColumn: "time" | "timestamp"
) => `client_id = {websiteId:String}
		AND ${buildTimeRangeWhere(timeColumn)}`;

const buildStepQuery = (
	step: AnalyticsStep,
	idx: number,
	filterSQL: string,
	params: ClickhouseQueryParams,
	includeReferrer = false
): string => {
	params[`n${idx}`] = step.name;
	params[`t${idx}`] = step.target;

	const refCol = includeReferrer ? ", any(referrer) as ref" : "";
	const base = buildBaseWhere("time");

	if (step.type === "PAGE_VIEW") {
		const escapedTarget = escapeClickhouseString(step.target);
		params[`t${idx}l`] = `%${escapedTarget}%`;
		return `SELECT ${idx + 1} as step, {n${idx}:String} as name, anonymous_id as vid, MIN(time) as ts${refCol}
			FROM analytics.events
			WHERE ${base} AND event_name = 'screen_view'
				AND (path = {t${idx}:String} OR path LIKE {t${idx}l:String})${filterSQL}
			GROUP BY vid`;
	}

	// EVENT: query both analytics.events (track) and analytics.custom_events (api/server)
	const refJoin = includeReferrer
		? `LEFT JOIN (
			SELECT anonymous_id as vid, argMin(referrer, time) as vref
			FROM analytics.events WHERE ${base} AND event_name = 'screen_view' AND referrer != ''
			GROUP BY vid
		) r ON e.vid = r.vid`
		: "";

	return `SELECT ${idx + 1} as step, {n${idx}:String} as name, e.vid as vid, MIN(ts) as ts${includeReferrer ? ", COALESCE(r.vref, '') as ref" : ""}
		FROM (
			SELECT anonymous_id as vid, time as ts FROM analytics.events
			WHERE ${base} AND event_name = {t${idx}:String}${filterSQL}
			UNION ALL
			SELECT COALESCE(anonymous_id, session_id, '') as vid, timestamp as ts FROM analytics.custom_events
			WHERE (owner_id = {websiteId:String} OR website_id = {websiteId:String})
				AND ${buildTimeRangeWhere("timestamp")}
				AND event_name = {t${idx}:String}
				AND coalesce(anonymous_id, session_id, '') != ''
		) e ${refJoin}
		GROUP BY e.vid${includeReferrer ? ", r.vref" : ""}`;
};

interface ErrorRow {
	path: string;
	vid: string;
	error_type: string;
	message: string;
	error_count: number;
}

const buildStepSubquery = (
	step: AnalyticsStep,
	paramKey: string,
	params: ClickhouseQueryParams
): string => {
	params[paramKey] = step.target;
	if (step.type === "PAGE_VIEW") {
		return `SELECT DISTINCT anonymous_id FROM analytics.events
			WHERE client_id = {websiteId:String}
			AND time >= parseDateTimeBestEffort({startDate:String})
			AND time <= parseDateTimeBestEffort({endDate:String})
			AND event_name = 'screen_view'
			AND path = {${paramKey}:String}`;
	}
	return `(SELECT DISTINCT anonymous_id FROM analytics.events
		WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND event_name = {${paramKey}:String}
		UNION ALL
		SELECT DISTINCT COALESCE(anonymous_id, session_id, '') FROM analytics.custom_events
		WHERE (owner_id = {websiteId:String} OR website_id = {websiteId:String})
		AND timestamp >= parseDateTimeBestEffort({startDate:String})
		AND timestamp <= parseDateTimeBestEffort({endDate:String})
		AND event_name = {${paramKey}:String}
		AND COALESCE(anonymous_id, session_id, '') != '')`;
};

const queryFunnelErrors = async (
	steps: AnalyticsStep[],
	hasVisitors: boolean,
	params: ClickhouseQueryParams
): Promise<{
	errorsByPath: Map<string, ErrorRow[]>;
	sessionsWithErrors: Set<string>;
	totalErrors: number;
	dropoffsWithErrors: number;
}> => {
	const empty = {
		errorsByPath: new Map<string, ErrorRow[]>(),
		sessionsWithErrors: new Set<string>(),
		totalErrors: 0,
		dropoffsWithErrors: 0,
	};

	const firstStep = steps[0];
	if (!(hasVisitors && firstStep)) {
		return empty;
	}

	const firstStepSubquery = buildStepSubquery(
		firstStep,
		"firstStepTarget",
		params
	);

	const lastStep = steps.at(-1);
	const hasMultipleSteps = lastStep && steps.length > 1;
	const lastStepSubquery = hasMultipleSteps
		? buildStepSubquery(lastStep, "lastStepTarget", params)
		: null;

	const errorQuery = `SELECT
		path,
		anonymous_id as vid,
		error_type,
		any(message) as message,
		count() as error_count
	FROM analytics.error_spans
	WHERE client_id = {websiteId:String}
		AND timestamp >= parseDateTimeBestEffort({startDate:String})
		AND timestamp <= parseDateTimeBestEffort({endDate:String})
		AND anonymous_id IN (${firstStepSubquery})
	GROUP BY path, anonymous_id, error_type
	ORDER BY error_count DESC
	LIMIT 1000`;

	const dropoffQuery = lastStepSubquery
		? `SELECT count(DISTINCT anonymous_id) as count
		   FROM analytics.error_spans
		   WHERE client_id = {websiteId:String}
			AND timestamp >= parseDateTimeBestEffort({startDate:String})
			AND timestamp <= parseDateTimeBestEffort({endDate:String})
			AND anonymous_id IN (${firstStepSubquery})
			AND anonymous_id NOT IN (${lastStepSubquery})`
		: null;

	const [errorRows, dropoffResult] = await Promise.all([
		chQuery<ErrorRow>(errorQuery, params),
		dropoffQuery
			? chQuery<{ count: number }>(dropoffQuery, params)
			: Promise.resolve([]),
	]);

	const errorsByPath = new Map<string, ErrorRow[]>();
	const sessionsWithErrors = new Set<string>();
	let totalErrors = 0;

	for (const row of errorRows) {
		const count = toFiniteNumber(row.error_count, 0);
		const normalized: ErrorRow = {
			path: String(row.path ?? ""),
			vid: String(row.vid ?? ""),
			error_type: String(row.error_type ?? ""),
			message: String(row.message ?? ""),
			error_count: count,
		};

		sessionsWithErrors.add(normalized.vid);
		totalErrors += count;

		const existing = errorsByPath.get(normalized.path);
		if (existing) {
			existing.push(normalized);
		} else {
			errorsByPath.set(normalized.path, [normalized]);
		}
	}

	const dropoffsWithErrors = toFiniteNumber(dropoffResult[0]?.count, 0);

	return { errorsByPath, sessionsWithErrors, totalErrors, dropoffsWithErrors };
};

export const queryLinkVisitorIds = async (
	linkId: string,
	params: ClickhouseQueryParams
): Promise<Set<string>> => {
	const refParams = { ...params, linkRefPattern: `%ref=${linkId}%` };
	const rows = await chQuery<{ vid: string }>(
		`SELECT DISTINCT anonymous_id as vid
		 FROM analytics.events
		 WHERE client_id = {websiteId:String}
			AND ${buildTimeRangeWhere("time")}
			AND url LIKE {linkRefPattern:String}`,
		refParams
	);
	return new Set(rows.map((r) => String(r.vid ?? "")));
};

// Main funnel analytics
export const processFunnelAnalytics = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams,
	visitorFilter?: Set<string>
): Promise<FunnelAnalytics> => {
	const filterSQL = buildFilterSQL(filters, params);
	const stepQueries = steps.map((s, i) =>
		buildStepQuery(s, i, filterSQL, params)
	);

	const rawRows = await chQuery<{
		step: number;
		name: string;
		vid: string;
		ts: number;
	}>(
		`WITH events AS (${stepQueries.join("\nUNION ALL\n")})
			SELECT DISTINCT step, name, vid, ts FROM events ORDER BY vid, ts`,
		params
	);

	const rows = rawRows.map((r) => ({
		step: toFiniteNumber(r.step, 0),
		name: String(r.name ?? ""),
		vid: String(r.vid ?? ""),
		ts: parseClickhouseTimestampSeconds(r.ts),
	}));

	const allVisitors = groupByVisitor(rows);

	// Apply visitor filter if provided (e.g. link attribution)
	const visitors = visitorFilter
		? new Map([...allVisitors].filter(([vid]) => visitorFilter.has(vid)))
		: allVisitors;
	const counts = countStepCompletions(visitors);
	const totalSteps = steps.length;
	const totalUsers = counts.get(1)?.size || 0;

	// Get all visitor IDs in the funnel
	const allFunnelVids = new Set(visitors.keys());

	// Query errors for funnel sessions
	const { errorsByPath, sessionsWithErrors, totalErrors } =
		await queryFunnelErrors(steps, allFunnelVids, params);

	// Calculate step timings, track drop-offs per step, and bucket by entry day
	const completionTimes: number[] = [];
	const stepTimes = new Map<number, number[]>();
	const dropoffsByStep = new Map<number, Set<string>>();
	const dailyBuckets = new Map<
		string,
		{ users: number; conversions: number; completionTimes: number[] }
	>();

	for (const [vid, stepList] of visitors) {
		let expected = 1;
		let firstTime = 0;
		let prevTime = 0;
		let lastCompletedStep = 0;
		let entryDate = "";

		for (const s of stepList) {
			if (s.step === expected) {
				if (expected === 1) {
					firstTime = prevTime = s.time;
					entryDate = new Date(s.time * 1000).toISOString().slice(0, 10);
				} else {
					let arr = stepTimes.get(expected);
					if (!arr) {
						arr = [];
						stepTimes.set(expected, arr);
					}
					arr.push(s.time - prevTime);
					prevTime = s.time;
				}
				if (expected === totalSteps) {
					completionTimes.push(s.time - firstTime);
				}
				lastCompletedStep = expected;
				expected += 1;
			}
		}

		// Track which step they dropped off at
		if (lastCompletedStep > 0 && lastCompletedStep < totalSteps) {
			const dropStep = lastCompletedStep + 1;
			let set = dropoffsByStep.get(dropStep);
			if (!set) {
				set = new Set();
				dropoffsByStep.set(dropStep, set);
			}
			set.add(vid);
		}

		// Bucket by entry day for time-series
		if (entryDate) {
			let bucket = dailyBuckets.get(entryDate);
			if (!bucket) {
				bucket = { users: 0, conversions: 0, completionTimes: [] };
				dailyBuckets.set(entryDate, bucket);
			}
			bucket.users++;
			if (lastCompletedStep === totalSteps) {
				bucket.conversions++;
				const totalTime = stepList.filter((s) => s.step === totalSteps).at(0);
				if (totalTime) {
					bucket.completionTimes.push(totalTime.time - firstTime);
				}
			}
		}
	}

	// Calculate drop-offs with errors (correlation)
	let dropoffsWithErrors = 0;
	let totalDropoffs = 0;

	for (const [, dropVids] of dropoffsByStep) {
		for (const vid of dropVids) {
			totalDropoffs++;
			if (sessionsWithErrors.has(vid)) {
				dropoffsWithErrors++;
			}
		}
	}

	const avgTime = avg(completionTimes);

	// Build step analytics with error insights
	const stepsAnalytics: StepAnalytics[] = steps.map((s, i) => {
		const stepNum = i + 1;
		const users = counts.get(stepNum)?.size || 0;
		const prev = i > 0 ? counts.get(i)?.size || 0 : users;
		const drops = i > 0 ? prev - users : 0;

		// Get errors for this step's path
		const stepErrors = errorsByPath.get(s.target) ?? [];
		const stepErrorCount = stepErrors.reduce(
			(sum, e) => sum + toFiniteNumber(e.error_count, 0),
			0
		);
		const usersWithErrors = new Set(stepErrors.map((e) => e.vid)).size;

		// Aggregate top errors by type
		const errorsByType = new Map<
			string,
			{ message: string; count: number; type: string }
		>();
		for (const e of stepErrors) {
			const ec = toFiniteNumber(e.error_count, 0);
			const existing = errorsByType.get(e.error_type);
			if (existing) {
				existing.count += ec;
			} else {
				errorsByType.set(e.error_type, {
					message: e.message,
					count: ec,
					type: e.error_type,
				});
			}
		}

		const topErrors = [...errorsByType.values()]
			.sort((a, b) => b.count - a.count)
			.slice(0, 3)
			.map((e) => ({
				message: e.message,
				error_type: e.type,
				count: toFiniteNumber(e.count, 0),
			}));

		return {
			step_number: stepNum,
			step_name: s.name,
			users,
			total_users: totalUsers,
			conversion_rate: i > 0 ? pct(users, prev) : 100,
			dropoffs: drops,
			dropoff_rate: i > 0 ? pct(drops, prev) : 0,
			avg_time_to_complete: avg(stepTimes.get(stepNum) ?? []),
			error_count: stepErrorCount,
			error_rate: pct(usersWithErrors, users),
			top_errors: topErrors,
		};
	});

	const lastStep = stepsAnalytics.at(-1);
	const biggestDropoff =
		stepsAnalytics.length > 1
			? stepsAnalytics
					.slice(1)
					.reduce((max, s) => (s.dropoff_rate > max.dropoff_rate ? s : max))
			: stepsAnalytics[0];

	// Build time-series from daily buckets
	const timeSeries: FunnelTimeSeriesPoint[] = [...dailyBuckets.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, bucket]) => ({
			date,
			users: bucket.users,
			conversions: bucket.conversions,
			conversion_rate: pct(bucket.conversions, bucket.users),
			dropoffs: bucket.users - bucket.conversions,
			avg_time: avg(bucket.completionTimes),
		}));

	return {
		overall_conversion_rate: pct(lastStep?.users || 0, totalUsers),
		total_users_entered: totalUsers,
		total_users_completed: lastStep?.users || 0,
		avg_completion_time: avgTime,
		avg_completion_time_formatted: formatDuration(avgTime),
		biggest_dropoff_step: biggestDropoff?.step_number || 1,
		biggest_dropoff_rate: biggestDropoff?.dropoff_rate || 0,
		steps_analytics: stepsAnalytics,
		time_series: timeSeries.length > 0 ? timeSeries : undefined,
		error_insights: {
			total_errors: totalErrors,
			sessions_with_errors: sessionsWithErrors.size,
			dropoffs_with_errors: dropoffsWithErrors,
			error_correlation_rate: pct(dropoffsWithErrors, totalDropoffs),
		},
	};
};

export const processGoalAnalytics = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams,
	totalWebsiteUsers: number
): Promise<FunnelAnalytics> => {
	const filterSQL = buildFilterSQL(filters, params);
	const step = steps[0];

	const sql = `WITH events AS (${buildStepQuery(step, 0, filterSQL, params)})
		 SELECT DISTINCT step, vid, ts FROM events`;
	const rows = await chQuery<{ step: number; vid: string; ts: number }>(
		sql,
		params
	);

	const goalVids = new Set(rows.map((r) => r.vid));
	const completions = goalVids.size;

	// Query errors for goal sessions
	const { errorsByPath, sessionsWithErrors, totalErrors } =
		await queryFunnelErrors(steps, goalVids, params);

	// Get errors for this goal's path
	const stepErrors = errorsByPath.get(step.target) ?? [];
	const stepErrorCount = stepErrors.reduce((sum, e) => sum + e.error_count, 0);
	const usersWithErrors = new Set(stepErrors.map((e) => e.vid)).size;

	// Aggregate top errors by type
	const errorsByType = new Map<
		string,
		{ message: string; count: number; type: string }
	>();
	for (const e of stepErrors) {
		const existing = errorsByType.get(e.error_type);
		if (existing) {
			existing.count += e.error_count;
		} else {
			errorsByType.set(e.error_type, {
				message: e.message,
				count: e.error_count,
				type: e.error_type,
			});
		}
	}

	const topErrors = [...errorsByType.values()]
		.sort((a, b) => b.count - a.count)
		.slice(0, 3)
		.map((e) => ({
			message: e.message,
			error_type: e.type,
			count: e.count,
		}));

	return {
		overall_conversion_rate: pct(completions, totalWebsiteUsers),
		total_users_entered: totalWebsiteUsers,
		total_users_completed: completions,
		avg_completion_time: 0,
		avg_completion_time_formatted: "—",
		biggest_dropoff_step: 1,
		biggest_dropoff_rate: 0,
		steps_analytics: [
			{
				step_number: 1,
				step_name: step.name,
				users: completions,
				total_users: totalWebsiteUsers,
				conversion_rate: pct(completions, totalWebsiteUsers),
				dropoffs: 0,
				dropoff_rate: 0,
				avg_time_to_complete: 0,
				error_count: stepErrorCount,
				error_rate: pct(usersWithErrors, completions),
				top_errors: topErrors,
			},
		],
		error_insights: {
			total_errors: totalErrors,
			sessions_with_errors: sessionsWithErrors.size,
			dropoffs_with_errors: 0,
			error_correlation_rate: 0,
		},
	};
};

// Referrer analytics
export const processFunnelAnalyticsByReferrer = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams
): Promise<{ referrer_analytics: ReferrerAnalytics[] }> => {
	const filterSQL = buildFilterSQL(filters, params);
	const stepQueries = steps.map((s, i) =>
		buildStepQuery(s, i, filterSQL, params, true)
	);

	const rawRefRows = await chQuery<{
		step: number;
		vid: string;
		ts: number;
		ref: string;
	}>(
		`WITH events AS (${stepQueries.join("\nUNION ALL\n")})
		 SELECT DISTINCT step, vid, ts, ref FROM events ORDER BY vid, ts`,
		params
	);

	const rows = rawRefRows.map((r) => ({
		step: toFiniteNumber(r.step, 0),
		vid: String(r.vid ?? ""),
		ts: parseClickhouseTimestampSeconds(r.ts),
		ref: String(r.ref ?? ""),
	}));

	const visitors = groupByVisitor(rows);
	const totalSteps = steps.length;

	// Group visitors by referrer
	const groups = new Map<
		string,
		{ parsed: ReturnType<typeof parseReferrer>; vids: Set<string> }
	>();

	for (const [vid, stepList] of visitors) {
		if (stepList.length === 0) {
			continue;
		}

		const ref = stepList[0].referrer || "Direct";
		const parsed = parseReferrer(ref);
		const key = parsed.domain || "direct";

		let group = groups.get(key);
		if (!group) {
			group = { parsed, vids: new Set() };
			groups.set(key, group);
		}
		group.vids.add(vid);
	}

	// Calculate per-referrer conversions
	const analytics: ReferrerAnalytics[] = [];

	for (const [key, { parsed, vids }] of groups) {
		const counts = countStepCompletions(visitors, vids);
		const total = counts.get(1)?.size || 0;
		const completed = counts.get(totalSteps)?.size || 0;
		const rate = pct(completed, total);

		if (total <= 1) {
			continue;
		}

		analytics.push({
			referrer: key,
			referrer_parsed: parsed,
			total_users: total,
			completed_users: completed,
			conversion_rate: rate,
		});
	}

	return {
		referrer_analytics: analytics.sort((a, b) => b.total_users - a.total_users),
	};
};

// Get total unique visitors for a website in date range
export const getTotalWebsiteUsers = async (
	websiteId: string,
	startDate: string,
	endDate: string
): Promise<number> => {
	const [result] = await chQuery<{ count: number }>(
		`SELECT COUNT(DISTINCT anonymous_id) as count FROM analytics.events
		 WHERE client_id = {websiteId:String}
			AND time >= parseDateTimeBestEffort({startDate:String})
			AND time <= parseDateTimeBestEffort({endDate:String})
			AND event_name = 'screen_view'`,
		{ websiteId, startDate, endDate: `${endDate} 23:59:59` }
	);
	return result?.count ?? 0;
};

// Re-export for backwards compatibility
export const buildFilterConditions = (
	filters: Filter[],
	_prefix: string,
	params: ClickhouseQueryParams
): { conditions: string; errors: string[] } => ({
	conditions: buildFilterSQL(filters, params),
	errors: [],
});
