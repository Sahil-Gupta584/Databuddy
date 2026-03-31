"use client";

import { ChartLineIcon } from "@phosphor-icons/react/dist/ssr/ChartLine";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr/Warning";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useMemo } from "react";
import { MetricsChartWithAnnotations } from "@/components/charts/metrics-chart-with-annotations";
import type { ChartDataRow } from "@/components/charts/metrics-constants";
import { SectionBrandOverlay } from "@/components/logo/section-brand-overlay";
import { Chart } from "@/components/ui/composables/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { chartQueryOutcome } from "@/lib/chart-query-outcome";
import type { DateRange } from "../../../utils/types";

interface TrafficTrendsChartProps {
	websiteId: string;
	dateRange: DateRange;
	chartData: ChartDataRow[];
	dateDiff: number;
	isError: boolean;
	isLoading: boolean;
	isMobile: boolean;
	onRangeSelect: (range: { startDate: Date; endDate: Date }) => void;
}

export function TrafficTrendsChart({
	websiteId,
	dateRange,
	chartData,
	dateDiff,
	isError,
	isLoading,
	isMobile,
	onRangeSelect,
}: TrafficTrendsChartProps) {
	const outcome = useMemo(
		() =>
			chartQueryOutcome({
				data: chartData,
				isError,
				isPending: isLoading,
				isSuccess: !(isLoading || isError),
			}),
		[chartData, isError, isLoading]
	);

	const plotHeight = isMobile ? 250 : 350;
	/** Matches `MetricsChart` plot wrapper (`height + 20`). */
	const plotRegionHeight = plotHeight + 20;

	return (
		<Chart className="gap-0 border-sidebar-border bg-sidebar py-0">
			<Chart.Header
				className="border-sidebar-border/60 px-3 py-2.5 sm:items-center sm:px-4 sm:py-3"
				description={
					<>
						<p className="text-xs sm:text-sm">
							{dateRange.granularity === "hourly" ? "Hourly" : "Daily"} traffic
							data
						</p>
						{dateRange.granularity === "hourly" && dateDiff > 7 ? (
							<div className="mt-1 flex items-start gap-1 text-amber-600 text-xs">
								<WarningIcon
									className="mt-0.5 shrink-0"
									size={14}
									weight="fill"
								/>
								<span className="leading-relaxed">
									Large date ranges may affect performance
								</span>
							</div>
						) : null}
					</>
				}
				descriptionClassName="text-sidebar-foreground/70"
				title="Traffic Trends"
				titleClassName="font-semibold text-base text-sidebar-foreground sm:text-lg"
			>
				<SectionBrandOverlay layout="inline" />
			</Chart.Header>
			<Chart.Content<ChartDataRow[]>
				emptyProps={{
					description:
						"Your analytics data will appear here as visitors interact with your website",
					icon: <ChartLineIcon className="size-12" weight="duotone" />,
					title: "No data available",
				}}
				errorProps={{
					description: "We couldn’t load traffic data. Try again in a moment.",
					icon: <WarningCircleIcon className="size-12" weight="duotone" />,
					title: "Something went wrong",
					variant: "error",
				}}
				loading={
					<div className="overflow-x-auto">
						<div
							aria-hidden
							className="relative w-full"
							style={{ height: plotRegionHeight }}
						>
							<Skeleton className="absolute inset-0 rounded-none bg-sidebar-foreground/10" />
						</div>
					</div>
				}
				outcome={outcome}
			>
				{(series) => (
					<div className="overflow-x-auto">
						<MetricsChartWithAnnotations
							className="rounded-none border-0"
							data={series}
							dateRange={{
								startDate: new Date(dateRange.start_date),
								endDate: new Date(dateRange.end_date),
								granularity: (dateRange.granularity ?? "daily") as
									| "hourly"
									| "daily"
									| "weekly"
									| "monthly",
							}}
							embedded
							height={plotHeight}
							isLoading={false}
							onRangeSelect={onRangeSelect}
							websiteId={websiteId}
						/>
					</div>
				)}
			</Chart.Content>
		</Chart>
	);
}
