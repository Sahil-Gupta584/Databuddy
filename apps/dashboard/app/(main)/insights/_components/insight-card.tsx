"use client";

import {
	ArrowRightIcon,
	BugIcon,
	CaretDownIcon,
	ChartLineUpIcon,
	CopyIcon,
	DotsThreeIcon,
	GaugeIcon,
	LightningIcon,
	LinkIcon,
	RocketIcon,
	SparkleIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
	TrendDownIcon,
	TrendUpIcon,
	WarningCircleIcon,
	XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { toast } from "sonner";
import type { InsightFeedbackVote } from "@/app/(main)/insights/lib/insight-feedback-vote";
import {
	buildInsightCopyText,
	buildInsightShareUrl,
	extractInsightPathHint,
	formatComparisonWindow,
	formatInsightFreshness,
} from "@/app/(main)/insights/lib/insight-meta";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	Insight,
	InsightSentiment,
	InsightType,
} from "@/lib/insight-types";
import { cn } from "@/lib/utils";

const TYPE_STYLES: Record<
	InsightType,
	{ icon: ReactNode; color: string; bg: string }
> = {
	error_spike: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	new_errors: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	vitals_degraded: {
		icon: <GaugeIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	custom_event_spike: {
		icon: <LightningIcon className="size-4" weight="fill" />,
		color: "text-blue-500",
		bg: "bg-blue-500/10",
	},
	traffic_drop: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	traffic_spike: {
		icon: <TrendUpIcon className="size-4" weight="fill" />,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
	},
	bounce_rate_change: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	engagement_change: {
		icon: <ChartLineUpIcon className="size-4" weight="duotone" />,
		color: "text-blue-500",
		bg: "bg-blue-500/10",
	},
	referrer_change: {
		icon: <ChartLineUpIcon className="size-4" weight="duotone" />,
		color: "text-violet-500",
		bg: "bg-violet-500/10",
	},
	page_trend: {
		icon: <ChartLineUpIcon className="size-4" weight="duotone" />,
		color: "text-blue-500",
		bg: "bg-blue-500/10",
	},
	positive_trend: {
		icon: <TrendUpIcon className="size-4" weight="fill" />,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
	},
	performance: {
		icon: <RocketIcon className="size-4" weight="duotone" />,
		color: "text-violet-500",
		bg: "bg-violet-500/10",
	},
	uptime_issue: {
		icon: <WarningCircleIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
};

const SENTIMENT_STYLES: Record<
	InsightSentiment,
	{ label: string; color: string }
> = {
	positive: { label: "Positive", color: "text-emerald-600" },
	neutral: { label: "Neutral", color: "text-muted-foreground" },
	negative: { label: "Needs attention", color: "text-red-500" },
};

function buildDiagnosticPrompt(insight: Insight): string {
	const parts = [
		`Diagnose this issue on ${insight.websiteName ?? insight.websiteDomain}:`,
		`"${insight.title}"`,
		"",
		`Context: ${insight.description}`,
	];

	if (insight.changePercent !== undefined && insight.changePercent > 0) {
		parts.push(
			`Change: ${insight.sentiment === "negative" ? "-" : "+"}${insight.changePercent}%`
		);
	}

	const windowLine = formatComparisonWindow(insight);
	if (windowLine) {
		parts.push("", `Comparison window: ${windowLine}`);
	}

	const pathHint = extractInsightPathHint(insight);
	if (pathHint) {
		parts.push(
			"",
			`Focus on page path ${pathHint} in analytics when relevant.`
		);
	}

	parts.push(
		"",
		"Investigate the root cause using this site's analytics for the comparison window above, and provide a clear explanation of what's happening and specific steps to fix or improve it."
	);

	return parts.join("\n");
}

export interface InsightCardProps {
	insight: Insight;
	expanded: boolean;
	onToggleAction: () => void;
	onDismissAction?: () => void;
	feedbackVote?: InsightFeedbackVote | null;
	onFeedbackAction?: (vote: InsightFeedbackVote | null) => void;
}

export function InsightCard({
	insight,
	expanded,
	onToggleAction,
	onDismissAction,
	feedbackVote,
	onFeedbackAction,
}: InsightCardProps) {
	const typeStyle = TYPE_STYLES[insight.type];
	const sentimentStyle = SENTIMENT_STYLES[insight.sentiment];
	const freshnessLine = formatInsightFreshness(insight);

	const agentHref = useMemo(() => {
		const chatId = crypto.randomUUID();
		const prompt = encodeURIComponent(buildDiagnosticPrompt(insight));
		return `/websites/${insight.websiteId}/agent/${chatId}?prompt=${prompt}`;
	}, [insight]);

	const pathHint = useMemo(() => extractInsightPathHint(insight), [insight]);

	const analyticsHref = useMemo(() => {
		if (pathHint) {
			return `/websites/${insight.websiteId}/events/stream?path=${encodeURIComponent(pathHint)}`;
		}
		return insight.link;
	}, [insight.websiteId, insight.link, pathHint]);

	const analyticsLabel = pathHint ? "View events" : "Overview";

	const copySummaryAction = async () => {
		try {
			await navigator.clipboard.writeText(buildInsightCopyText(insight));
			toast.success("Copied insight to clipboard");
		} catch {
			toast.error("Could not copy");
		}
	};

	const copyLinkAction = async () => {
		const url = buildInsightShareUrl(insight.id);
		if (!url) {
			return;
		}
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Copied link to this insight");
		} catch {
			toast.error("Could not copy link");
		}
	};

	return (
		<div
			className={cn(
				"group scroll-mt-24 border-b transition-colors",
				expanded ? "bg-accent/20" : "hover:bg-accent/40"
			)}
			id={`insight-${insight.id}`}
		>
			<div
				className="flex cursor-pointer items-start gap-3 px-4 py-3 sm:px-6"
				onClick={onToggleAction}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onToggleAction();
					}
				}}
				role="button"
				tabIndex={0}
			>
				<div
					className={cn(
						"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded",
						typeStyle.bg,
						typeStyle.color
					)}
				>
					{typeStyle.icon}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<p className="truncate font-medium text-foreground text-sm">
							{insight.title}
						</p>
						<div className="flex shrink-0 items-center gap-1.5">
							{onDismissAction && (
								<button
									aria-label="Dismiss insight"
									className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
									onClick={(e) => {
										e.stopPropagation();
										onDismissAction();
									}}
									type="button"
								>
									<XIcon className="size-3" weight="bold" />
								</button>
							)}
							<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
								{insight.priority}/10
							</span>
							<CaretDownIcon
								className={cn(
									"size-3 text-muted-foreground transition-transform",
									expanded && "rotate-180"
								)}
								weight="fill"
							/>
						</div>
					</div>
					<div className="mt-0.5 flex items-center gap-1.5 text-xs">
						<span className="truncate text-muted-foreground">
							{insight.websiteName ?? insight.websiteDomain}
						</span>
						<span className="text-muted-foreground/30">&middot;</span>
						<span className={sentimentStyle.color}>{sentimentStyle.label}</span>
						{insight.changePercent !== undefined &&
							insight.changePercent > 0 && (
								<>
									<span className="text-muted-foreground/30">&middot;</span>
									<span
										className={cn(
											"tabular-nums",
											insight.sentiment === "negative"
												? "text-red-500"
												: "text-emerald-600"
										)}
									>
										{insight.sentiment === "negative" ? "-" : "+"}
										{insight.changePercent}%
									</span>
								</>
							)}
						<span className="text-muted-foreground/30">&middot;</span>
						<span className="text-muted-foreground">{freshnessLine}</span>
					</div>
					{!expanded && (
						<p className="mt-1 line-clamp-1 text-muted-foreground text-xs">
							{insight.description}
						</p>
					)}
				</div>
			</div>

			{expanded && (
				<div
					className="space-y-2.5 px-4 pb-4 pl-14 sm:pl-15"
					onClick={onToggleAction}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onToggleAction();
						}
					}}
					role="button"
					tabIndex={-1}
				>
					<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
						{insight.description}
					</p>

					<div className="flex items-start gap-2 rounded bg-accent/60 px-2.5 py-2">
						<SparkleIcon
							className="mt-px size-3 shrink-0 text-primary"
							weight="duotone"
						/>
						<p className="text-pretty text-foreground text-xs leading-relaxed">
							{insight.suggestion}
						</p>
					</div>

					<div
						className="flex items-center gap-2 pt-0.5"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						role="group"
					>
						<Link
							aria-label="Open AI agent with this insight as context"
							className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
							href={agentHref}
						>
							Ask agent
							<ArrowRightIcon className="size-3" weight="fill" />
						</Link>
						<button
							className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-accent"
							onClick={copySummaryAction}
							type="button"
						>
							<CopyIcon aria-hidden className="size-3.5" weight="duotone" />
							Copy
						</button>
						<Link
							aria-label={
								pathHint
									? `View live events filtered to ${pathHint}`
									: "Open website overview"
							}
							className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
							href={analyticsHref}
						>
							{analyticsLabel}
						</Link>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									aria-label="More actions"
									className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									type="button"
								>
									<DotsThreeIcon className="size-4" weight="bold" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-40">
								<DropdownMenuItem onClick={copyLinkAction}>
									<LinkIcon className="size-4" weight="duotone" />
									Copy link
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						{onFeedbackAction && (
							<div className="ml-auto flex items-center gap-1.5">
								<span className="text-muted-foreground text-xs">Useful?</span>
								<button
									aria-label="Mark as helpful"
									aria-pressed={feedbackVote === "up"}
									className={cn(
										"flex size-7 items-center justify-center rounded border transition-colors",
										feedbackVote === "up"
											? "border-primary bg-primary/10 text-primary"
											: "text-muted-foreground hover:bg-accent hover:text-foreground"
									)}
									onClick={() =>
										onFeedbackAction(feedbackVote === "up" ? null : "up")
									}
									type="button"
								>
									<ThumbsUpIcon className="size-3.5" weight="duotone" />
								</button>
								<button
									aria-label="Mark as not helpful"
									aria-pressed={feedbackVote === "down"}
									className={cn(
										"flex size-7 items-center justify-center rounded border transition-colors",
										feedbackVote === "down"
											? "border-destructive bg-destructive/10 text-destructive"
											: "text-muted-foreground hover:bg-accent hover:text-foreground"
									)}
									onClick={() =>
										onFeedbackAction(feedbackVote === "down" ? null : "down")
									}
									type="button"
								>
									<ThumbsDownIcon className="size-3.5" weight="duotone" />
								</button>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export function InsightCardSkeleton() {
	return (
		<div className="flex items-start gap-3 border-b px-4 py-3 sm:px-6">
			<Skeleton className="mt-0.5 size-7 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1 space-y-1">
						<Skeleton className="h-4 w-48 rounded" />
						<Skeleton className="h-3 w-32 rounded" />
					</div>
					<Skeleton className="h-4 w-12 rounded" />
				</div>
				<Skeleton className="h-3 w-56 rounded" />
			</div>
		</div>
	);
}
