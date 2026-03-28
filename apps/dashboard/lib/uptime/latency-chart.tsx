"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	ChartTooltip,
	createTooltipEntries,
} from "@/components/ui/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";

interface LatencyDataPoint {
	date: string;
	avg_response_time?: number;
	p50_response_time?: number;
	p95_response_time?: number;
}

interface LatencyChartProps {
	data: LatencyDataPoint[];
	isLoading?: boolean;
	storageKey: string;
}

const METRICS: Array<{
	key: string;
	label: string;
	color: string;
	formatValue: (v: number) => string;
}> = [
	{
		key: "p95_response_time",
		label: "p95",
		color: "var(--color-chart-4)",
		formatValue: (v) => formatMs(v),
	},
	{
		key: "avg_response_time",
		label: "Avg",
		color: "var(--color-chart-1)",
		formatValue: (v) => formatMs(v),
	},
];

function formatMs(ms: number): string {
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	return `${Math.round(ms)}ms`;
}

function detectGranularity(data: ChartDataPoint[]): "hourly" | "daily" {
	if (data.length < 2) {
		return "daily";
	}
	const first = new Date(data.at(0)?.date ?? "").getTime();
	const second = new Date(data.at(1)?.date ?? "").getTime();
	const diffHours = (second - first) / (1000 * 60 * 60);
	return diffHours < 20 ? "hourly" : "daily";
}

function formatTickDate(
	dateStr: string,
	granularity: "hourly" | "daily"
): string {
	try {
		const d = new Date(dateStr);
		if (granularity === "hourly") {
			return d.toLocaleString("en-US", {
				hour: "numeric",
				minute: "2-digit",
			});
		}
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	} catch {
		return dateStr;
	}
}

function formatTooltipLabel(
	dateStr: string,
	granularity: "hourly" | "daily"
): string {
	try {
		const d = new Date(dateStr);
		if (granularity === "hourly") {
			return d.toLocaleString("en-US", {
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
			});
		}
		return d.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
		});
	} catch {
		return dateStr;
	}
}

interface ChartDataPoint {
	date: string;
	avg_response_time: number | null;
	p95_response_time: number | null;
}

function toChartData(data: LatencyDataPoint[]): ChartDataPoint[] {
	return data
		.filter((d) => d.avg_response_time != null || d.p95_response_time != null)
		.map((d) => ({
			date: d.date,
			avg_response_time:
				d.avg_response_time == null
					? null
					: Math.round(d.avg_response_time * 100) / 100,
			p95_response_time:
				d.p95_response_time == null
					? null
					: Math.round(d.p95_response_time * 100) / 100,
		}));
}

function computeSummary(chartData: ChartDataPoint[]) {
	if (chartData.length === 0) {
		return { current: null, avg: null, p95: null };
	}

	const latest = chartData.at(-1);
	const avgValues = chartData
		.map((d) => d.avg_response_time)
		.filter((v): v is number => v != null);

	return {
		current: latest?.avg_response_time ?? null,
		avg:
			avgValues.length > 0
				? avgValues.reduce((a, b) => a + b, 0) / avgValues.length
				: null,
		p95: latest?.p95_response_time ?? null,
	};
}

export function LatencyChart({
	data,
	isLoading = false,
	storageKey,
}: LatencyChartProps) {
	const [isOpen, setIsOpen] = usePersistentState(storageKey, false);
	const chartData = useMemo(() => toChartData(data), [data]);
	const summary = useMemo(() => computeSummary(chartData), [chartData]);

	return (
		<div>
			<button
				className="flex w-full cursor-pointer items-center gap-3 border-t px-4 py-2.5 text-left hover:bg-accent/40 sm:px-6"
				onClick={() => setIsOpen((prev) => !prev)}
				type="button"
			>
				<span className="text-balance font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Response Time
				</span>

				{!isLoading && summary.avg != null && (
					<span className="flex items-center gap-3 text-muted-foreground text-xs tabular-nums">
						<span className="flex items-center gap-1">
							<span
								className="inline-block size-1.5 rounded-full"
								style={{
									backgroundColor: "var(--color-chart-1)",
								}}
							/>
							{formatMs(summary.avg)}
						</span>
						{summary.p95 != null && (
							<span className="flex items-center gap-1">
								<span
									className="inline-block size-1.5 rounded-full"
									style={{
										backgroundColor: "var(--color-chart-4)",
									}}
								/>
								{formatMs(summary.p95)}
							</span>
						)}
					</span>
				)}

				<CaretDownIcon
					className={cn(
						"ml-auto size-3 shrink-0 text-muted-foreground transition-transform duration-150",
						isOpen && "rotate-180"
					)}
					weight="fill"
				/>
			</button>

			<AnimatePresence initial={false}>
				{isOpen && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
					>
						<div className="px-4 pt-1 pb-4 sm:px-6">
							{isLoading ? (
								<Skeleton className="h-36 w-full rounded" />
							) : chartData.length === 0 ? (
								<div className="flex h-28 items-center justify-center">
									<span className="text-muted-foreground text-xs">
										No response time data
									</span>
								</div>
							) : (
								<LatencyAreaChart data={chartData} />
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function LatencyAreaChart({ data }: { data: ChartDataPoint[] }) {
	const granularity = useMemo(() => detectGranularity(data), [data]);

	const hasVariation = METRICS.some((m) => {
		const values = data
			.map((d) => d[m.key as keyof ChartDataPoint])
			.filter((v) => v != null) as number[];
		return values.length > 1 && values.some((v) => v !== values.at(0));
	});

	if (!hasVariation) {
		return (
			<div className="flex h-28 items-center">
				<div className="h-px w-full bg-chart-1/30" />
			</div>
		);
	}

	return (
		<div>
			<ResponsiveContainer height={144} width="100%">
				<AreaChart
					data={data}
					margin={{ top: 4, right: 0, left: -12, bottom: 0 }}
				>
					<defs>
						{METRICS.map((m) => (
							<linearGradient
								id={`latency-g-${m.key}`}
								key={m.key}
								x1="0"
								x2="0"
								y1="0"
								y2="1"
							>
								<stop offset="0%" stopColor={m.color} stopOpacity={0.12} />
								<stop offset="95%" stopColor={m.color} stopOpacity={0} />
							</linearGradient>
						))}
					</defs>

					<CartesianGrid
						stroke="var(--border)"
						strokeOpacity={0.4}
						vertical={false}
					/>

					<XAxis
						axisLine={false}
						dataKey="date"
						interval="preserveStartEnd"
						minTickGap={40}
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickFormatter={(v: string) => formatTickDate(v, granularity)}
						tickLine={false}
						tickMargin={8}
					/>

					<YAxis
						axisLine={false}
						domain={["dataMin", "auto"]}
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickFormatter={formatMs}
						tickLine={false}
						width={52}
					/>

					<Tooltip
						content={({ active, payload, label }) => (
							<ChartTooltip
								active={active}
								entries={createTooltipEntries(
									payload as Array<{
										dataKey: string;
										value: number;
										color: string;
									}>,
									METRICS
								)}
								formatLabelAction={(l) => formatTooltipLabel(l, granularity)}
								label={label}
							/>
						)}
						cursor={{
							stroke: "var(--border)",
							strokeDasharray: "3 3",
						}}
					/>

					{METRICS.map((m) => (
						<Area
							activeDot={{
								r: 2,
								fill: m.color,
								stroke: "var(--color-background)",
								strokeWidth: 1.5,
							}}
							connectNulls
							dataKey={m.key}
							dot={false}
							fill={`url(#latency-g-${m.key})`}
							key={m.key}
							name={m.label}
							stroke={m.color}
							strokeWidth={1.5}
							type="monotone"
						/>
					))}
				</AreaChart>
			</ResponsiveContainer>

			<div className="mt-2 flex items-center justify-end gap-3">
				{METRICS.map((m) => (
					<span
						className="flex items-center gap-1 text-[10px] text-muted-foreground"
						key={m.key}
					>
						<span
							className="inline-block size-1.5 rounded-full"
							style={{ backgroundColor: m.color }}
						/>
						{m.label}
					</span>
				))}
			</div>
		</div>
	);
}
