"use client";

import {
	CheckCircleIcon,
	MinusCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateOnly, fromNow, localDayjs } from "@/lib/time";
import { cn } from "@/lib/utils";

interface DailyData {
	date: string;
	uptime_percentage: number;
}

interface MonitorRowProps {
	name: string;
	domain: string;
	currentStatus: "up" | "down" | "unknown";
	uptimePercentage: number;
	dailyData: DailyData[];
	lastCheckedAt: string | null;
}

const DAYS = 90;

interface HeatmapDay {
	date: Date;
	dateStr: string;
	hasData: boolean;
	uptime: number;
}

function getUptimeColor(day: HeatmapDay): string {
	if (!day.hasData) {
		return "bg-secondary";
	}
	if (day.uptime >= 99.9) {
		return "bg-emerald-500 hover:bg-emerald-600";
	}
	if (day.uptime >= 98) {
		return "bg-emerald-400 hover:bg-emerald-500";
	}
	if (day.uptime >= 95) {
		return "bg-emerald-300 hover:bg-emerald-400";
	}
	if (day.uptime >= 90) {
		return "bg-amber-400 hover:bg-amber-500";
	}
	return "bg-red-500 hover:bg-red-600";
}

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
	name,
	domain,
	currentStatus,
	uptimePercentage,
	dailyData,
	lastCheckedAt,
}: MonitorRowProps) {
	const heatmapData = useMemo(() => {
		const result: HeatmapDay[] = [];
		const today = localDayjs().endOf("day");

		for (let i = DAYS - 1; i >= 0; i--) {
			const date = today.subtract(i, "day");
			const dateStr = date.format("YYYY-MM-DD");

			const dayData = dailyData.find(
				(d) => localDayjs(d.date).format("YYYY-MM-DD") === dateStr
			);

			result.push({
				date: date.toDate(),
				dateStr,
				hasData: !!dayData,
				uptime: dayData?.uptime_percentage ?? 0,
			});
		}
		return result;
	}, [dailyData]);

	const statusConfig = STATUS_ICON[currentStatus];

	return (
		<div className="rounded border bg-card">
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
				<div className="flex h-8 w-full gap-px sm:gap-[2px]">
					{heatmapData.map((day) => (
						<Tooltip key={day.dateStr}>
							<TooltipTrigger asChild>
								<div
									className={cn(
										"h-full flex-1 rounded-sm transition-colors",
										getUptimeColor(day)
									)}
								/>
							</TooltipTrigger>
							<TooltipContent>
								<div className="space-y-1 text-xs">
									<p className="font-semibold">{formatDateOnly(day.date)}</p>
									{day.hasData ? (
										<p>Uptime: {day.uptime.toFixed(2)}%</p>
									) : (
										<p className="text-muted-foreground">No data recorded</p>
									)}
								</div>
							</TooltipContent>
						</Tooltip>
					))}
				</div>
				<div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
					<span>{DAYS} days ago</span>
					<span>Today</span>
				</div>
			</div>
		</div>
	);
}
