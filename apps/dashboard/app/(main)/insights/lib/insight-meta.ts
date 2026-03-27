import dayjs from "@/lib/dayjs";
import type { Insight } from "@/lib/insight-types";

const PATH_IN_TEXT = /\/[a-zA-Z0-9][a-zA-Z0-9/_-]*/g;

/** Human-readable comparison window when DB persisted period fields exist. */
export function formatComparisonWindow(insight: Insight): string | null {
	const {
		currentPeriodFrom,
		currentPeriodTo,
		previousPeriodFrom,
		previousPeriodTo,
		timezone,
	} = insight;
	if (
		!(
			currentPeriodFrom &&
			currentPeriodTo &&
			previousPeriodFrom &&
			previousPeriodTo
		)
	) {
		return null;
	}
	const tz = timezone ? ` · ${timezone}` : "";
	return `Previous ${previousPeriodFrom}–${previousPeriodTo} vs current ${currentPeriodFrom}–${currentPeriodTo}${tz}`;
}

/** Short line for source + recency. */
export function formatInsightFreshness(insight: Insight): string {
	if (insight.insightSource === "ai") {
		return "Latest analysis";
	}
	if (insight.createdAt) {
		const d = dayjs(insight.createdAt);
		if (d.isValid()) {
			return `From history · ${d.fromNow()}`;
		}
	}
	return "From history";
}

export function buildInsightShareUrl(insightId: string): string {
	if (typeof window === "undefined") {
		return "";
	}
	const url = new URL(window.location.href);
	url.hash = `insight-${insightId}`;
	return url.toString();
}

export function extractInsightPathHint(insight: Insight): string | null {
	const text = `${insight.title}\n${insight.description}\n${insight.suggestion}`;
	const matches = text.match(PATH_IN_TEXT);
	if (!matches?.length) {
		return null;
	}
	const sorted = [...matches].sort((a, b) => b.length - a.length);
	return sorted[0] ?? null;
}

export function buildInsightCopyText(insight: Insight): string {
	const lines = [
		insight.title,
		"",
		`${insight.websiteName ?? insight.websiteDomain}`,
		"",
		insight.description,
		"",
		`Suggestion: ${insight.suggestion}`,
	];
	const windowLine = formatComparisonWindow(insight);
	if (windowLine) {
		lines.push("", windowLine);
	}
	return lines.join("\n");
}
