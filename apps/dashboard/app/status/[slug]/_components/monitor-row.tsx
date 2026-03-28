"use client";

import {
	CheckCircleIcon,
	MinusCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { formatDateOnly, fromNow } from "@/lib/time";
import { buildUptimeHeatmapDays } from "@/lib/uptime/heatmap-days";
import { UptimeHeatmapStrip } from "@/lib/uptime/heatmap-strip";
import { LatencyChartChunkPlaceholder } from "@/lib/uptime/latency-chart-chunk-placeholder";
import { cn } from "@/lib/utils";

const LatencyChart = dynamic(
	() =>
		import("@/lib/uptime/latency-chart").then((m) => ({
			default: m.LatencyChart,
		})),
	{
		ssr: false,
		loading: () => <LatencyChartChunkPlaceholder />,
	}
);

interface DailyData {
	date: string;
	uptime_percentage: number;
	avg_response_time?: number;
	p95_response_time?: number;
}

interface MonitorRowProps {
	id: string;
	name: string;
	domain: string;
	currentStatus: "up" | "down" | "unknown";
	uptimePercentage: number;
	dailyData: DailyData[];
	lastCheckedAt: string | null;
}

const DAYS = 90;

const STATUS_ICON = {
	up: {
		Icon: CheckCircleIcon,
		className: "text-emerald-500",
		label: "Operational",
	},
	down: { Icon: XCircleIcon, className: "text-red-500", label: "Down" },
	unknown: {
		Icon: MinusCircleIcon,
		className: "text-muted-foreground",
		label: "Unknown",
	},
} as const;

export function MonitorRow({
	id,
	name,
	domain,
	currentStatus,
	uptimePercentage,
	dailyData,
	lastCheckedAt,
}: MonitorRowProps) {
	const heatmapData = useMemo(
		() => buildUptimeHeatmapDays(dailyData, DAYS),
		[dailyData]
	);

	const hasLatencyData = useMemo(
		() =>
			dailyData.some(
				(d) => d.avg_response_time != null || d.p95_response_time != null
			),
		[dailyData]
	);

	const statusConfig = STATUS_ICON[currentStatus];

	return (
		<div className="overflow-hidden rounded border bg-card">
			<div className="flex items-center justify-between px-4 pt-4 pb-3">
				<div className="flex items-center gap-2.5 overflow-hidden">
					<statusConfig.Icon
						className={cn("size-5 shrink-0", statusConfig.className)}
						weight="fill"
					/>
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">{name}</p>
						<p className="truncate text-muted-foreground text-xs">{domain}</p>
					</div>
				</div>
				<div className="shrink-0 text-right">
					<p className="font-medium font-mono text-sm tabular-nums">
						{uptimePercentage.toFixed(2)}%
					</p>
					{lastCheckedAt ? (
						<p className="text-muted-foreground text-xs">
							{fromNow(lastCheckedAt)}
						</p>
					) : null}
				</div>
			</div>

			<div className="px-4 pb-4">
				<UptimeHeatmapStrip
					days={heatmapData}
					emptyLabel="No data recorded"
					getDateLabel={(d) => formatDateOnly(d)}
					interactive
					isActive
					stripClassName="flex h-8 w-full gap-px sm:gap-[2px]"
				/>
				<div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
					<span>{DAYS} days ago</span>
					<span>Today</span>
				</div>
			</div>

			{hasLatencyData && (
				<LatencyChart data={dailyData} storageKey={`status-latency-${id}`} />
			)}
		</div>
	);
}
