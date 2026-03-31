"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	Area,
	ComposedChart,
	Customized,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { ChartStepType } from "@/components/analytics/stat-card";
import { Chart } from "@/components/ui/composables/chart";
import {
	ChartTooltip,
	createTooltipEntries,
	formatTooltipDate,
} from "@/components/ui/chart-tooltip";
import type { ChartQueryOutcome } from "@/lib/chart-query-outcome";
import { cn } from "@/lib/utils";
import { useDynamicDasharray } from "./use-dynamic-dasharray";

interface DataPoint {
	date: string;
	[key: string]: string | number | null | undefined;
}

interface MetricConfig {
	key: string;
	label: string;
	color: string;
	formatValue?: (value: number) => string;
}

interface SimpleMetricsChartProps {
	data: DataPoint[];
	metrics: MetricConfig[];
	title?: string;
	description?: string;
	height?: number;
	isLoading?: boolean;
	className?: string;
	/** When true, the last segment (incomplete period) uses a dashed stroke, matching `MetricsChart` / overview traffic trends. */
	partialLastSegment?: boolean;
	chartStepType?: ChartStepType;
}

const DEFAULT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

interface SimpleChartReadyPayload {
	metrics: Array<MetricConfig & { color: string }>;
	points: DataPoint[];
}

export function SimpleMetricsChart({
	data,
	metrics,
	title,
	description,
	height = 140,
	isLoading = false,
	className,
	partialLastSegment = false,
	chartStepType = "monotone",
}: SimpleMetricsChartProps) {
	const metricsWithColors = useMemo(
		() =>
			metrics.map((m, i) => ({
				...m,
				color: m.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
			})),
		[metrics]
	);

	const dashSplitIndex = useMemo(() => {
		if (!partialLastSegment) {
			return data.length;
		}
		return data.length - 2;
	}, [partialLastSegment, data.length]);

	const curveAdjustment =
		chartStepType === "step" ||
		chartStepType === "stepBefore" ||
		chartStepType === "stepAfter"
			? 0
			: 1;

	const [DasharrayCalculator, lineDasharrays] = useDynamicDasharray({
		chartType: chartStepType,
		curveAdjustment,
		splitIndex: dashSplitIndex,
	});

	const outcome = useMemo((): ChartQueryOutcome<SimpleChartReadyPayload> => {
		if (isLoading) {
			return { status: "loading" };
		}
		if (data.length === 0) {
			return { status: "empty" };
		}
		return {
			status: "ready",
			data: { metrics: metricsWithColors, points: data },
		};
	}, [data, isLoading, metricsWithColors]);

	return (
		<Chart
			className={cn("gap-0 overflow-hidden border bg-card py-0", className)}
		>
			<Chart.Content<SimpleChartReadyPayload>
				emptyProps={{
					description: "No samples in this range.",
					icon: <ChartLineIcon weight="duotone" />,
					title: "No data",
				}}
				loading={<Chart.DefaultLoading height={height} />}
				outcome={outcome}
			>
				{({ metrics: series, points }) => {
					const hasVariation =
						points.length > 1 &&
						series.some((m: MetricConfig & { color: string }) => {
							const values = points
								.map((d: DataPoint) => d[m.key])
								.filter((v): v is number => v != null);
							const first = values[0];
							return (
								values.length > 1 &&
								first !== undefined &&
								values.some((v) => v !== first)
							);
						});

					return (
						<>
							<Chart.Plot>
								{hasVariation ? (
									<ResponsiveContainer height={height} width="100%">
										<ComposedChart
											data={points}
											margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
										>
											<defs>
												{series.map((metric) => (
													<linearGradient
														id={`gradient-${metric.key}`}
														key={metric.key}
														x1="0"
														x2="0"
														y1="0"
														y2="1"
													>
														<stop
															offset="0%"
															stopColor={metric.color}
															stopOpacity={0.4}
														/>
														<stop
															offset="100%"
															stopColor={metric.color}
															stopOpacity={0}
														/>
													</linearGradient>
												))}
											</defs>

											<XAxis
												axisLine={false}
												dataKey="date"
												tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
												tickLine={false}
											/>
											<YAxis domain={["dataMin", "dataMax"]} hide />

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
															series
														)}
														formatLabelAction={formatTooltipDate}
														label={label}
													/>
												)}
												cursor={{
													stroke: "var(--color-chart-1)",
													strokeOpacity: 0.3,
												}}
											/>

											{series.map((metric) => (
												<Area
													activeDot={{
														r: 2.5,
														fill: metric.color,
														stroke: "var(--color-background)",
														strokeWidth: 1.5,
													}}
													dataKey={metric.key}
													dot={false}
													fill={`url(#gradient-${metric.key})`}
													key={metric.key}
													name={metric.label}
													stroke={metric.color}
													strokeDasharray={
														lineDasharrays.find(
															(line) => line.name === metric.key
														)?.strokeDasharray || "0 0"
													}
													strokeWidth={1.5}
													type={chartStepType}
												/>
											))}
											<Customized component={DasharrayCalculator} />
										</ComposedChart>
									</ResponsiveContainer>
								) : (
									<div className="flex items-center px-4" style={{ height }}>
										<div className="h-px w-full bg-chart-1/30" />
									</div>
								)}
							</Chart.Plot>

							<Chart.Footer>
								<div className="min-w-0 flex-1">
									{title ? (
										<p className="truncate font-semibold text-sm leading-tight">
											{title}
										</p>
									) : null}
									{description ? (
										<p className="truncate text-muted-foreground text-xs">
											{description}
										</p>
									) : null}
								</div>
								<div className="flex shrink-0 flex-wrap justify-end gap-1">
									{series.map((metric) => (
										<div
											className="flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5"
											key={metric.key}
										>
											<div
												className="size-1.5 rounded-full"
												style={{ backgroundColor: metric.color }}
											/>
											<span className="text-[10px] text-muted-foreground">
												{metric.label}
											</span>
										</div>
									))}
								</div>
							</Chart.Footer>
						</>
					);
				}}
			</Chart.Content>
		</Chart>
	);
}
