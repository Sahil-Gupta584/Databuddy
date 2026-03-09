"use client";

import {
	ArrowCounterClockwiseIcon,
	ChartLineUpIcon,
	LightningIcon,
	ListBulletsIcon,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import {
	Area,
	CartesianGrid,
	Legend,
	ReferenceArea,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { METRIC_COLORS } from "@/components/charts/metrics-constants";
import { TableEmptyState } from "@/components/table/table-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ResponsiveContainer = dynamic(
	() => import("recharts").then((mod) => mod.ResponsiveContainer),
	{ ssr: false }
);
const AreaChart = dynamic(
	() => import("recharts").then((mod) => mod.AreaChart),
	{ ssr: false }
);

const EVENT_COLORS = [
	"#2E27F5",
	"#40BCF7",
	"#8b5cf6",
	"#f59e0b",
	"#ef4444",
	"#10b981",
	"#ec4899",
	"#06b6d4",
	"#f97316",
	"#22c55e",
	"#a855f7",
	"#14b8a6",
];

const EVENTS_COLOR = METRIC_COLORS.pageviews.primary;
const USERS_COLOR = METRIC_COLORS.visitors.primary;

type ChartMode = "aggregate" | "by-event";

interface EventsTrendChartProps {
	chartData: Array<{ date: string; events: number; users: number }>;
	perEventData?: Record<string, string | number>[];
	eventNames?: string[];
	isFetching?: boolean;
	isLoading?: boolean;
}

function formatYTick(value: number): string {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1)}k`;
	}
	return value.toString();
}

function ChartTooltip({
	active,
	payload,
	label,
	resolveColor,
}: {
	active?: boolean;
	payload?: Array<{
		dataKey: string;
		name: string;
		value: number;
		color: string;
	}>;
	label?: string;
	resolveColor?: (entry: { dataKey: string; color: string }) => string;
}) {
	if (!(active && payload?.length)) {
		return null;
	}

	const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

	return (
		<div className="rounded border bg-popover px-3 py-2 shadow-md">
			<p className="mb-1.5 font-medium text-popover-foreground text-xs">
				{label}
			</p>
			<div className="max-h-48 space-y-1 overflow-y-auto">
				{sorted.map((entry) => (
					<div
						className="flex items-center justify-between gap-4"
						key={entry.dataKey}
					>
						<div className="flex items-center gap-1.5">
							<div
								className="size-2 shrink-0 rounded-full"
								style={{
									backgroundColor: resolveColor
										? resolveColor(entry)
										: entry.color,
								}}
							/>
							<span className="max-w-[140px] truncate text-muted-foreground text-xs">
								{entry.name}
							</span>
						</div>
						<span className="font-medium text-popover-foreground text-xs tabular-nums">
							{(entry.value ?? 0).toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

const AXIS_TICK = { fontSize: 10, fill: "var(--muted-foreground)" };
const GRID_PROPS = {
	stroke: "var(--border)",
	strokeDasharray: "3 3",
	strokeOpacity: 0.5,
	vertical: false,
} as const;

function aggregateColorResolver(entry: { dataKey: string }) {
	return entry.dataKey === "events" ? EVENTS_COLOR : USERS_COLOR;
}

export function EventsTrendChart({
	chartData,
	perEventData = [],
	eventNames = [],
	isFetching,
	isLoading,
}: EventsTrendChartProps) {
	const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
	const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
	const [zoomedData, setZoomedData] = useState<typeof chartData | null>(null);
	const [zoomedPerEventData, setZoomedPerEventData] = useState<
		Record<string, string | number>[] | null
	>(null);
	const [chartMode, setChartMode] = useState<ChartMode>("by-event");
	const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(new Set());

	const hasPerEventData = perEventData.length > 0 && eventNames.length > 0;
	const activeMode = hasPerEventData ? chartMode : "aggregate";

	const isZoomed = zoomedData !== null;
	const displayData = zoomedData ?? chartData;
	const displayPerEventData = zoomedPerEventData ?? perEventData;

	const resetZoom = useCallback(() => {
		setRefAreaLeft(null);
		setRefAreaRight(null);
		setZoomedData(null);
		setZoomedPerEventData(null);
	}, []);

	const handleMouseDown = (e: { activeLabel?: string }) => {
		if (!e?.activeLabel) {
			return;
		}
		setRefAreaLeft(e.activeLabel);
		setRefAreaRight(null);
	};

	const handleMouseMove = (e: { activeLabel?: string }) => {
		if (!(refAreaLeft && e?.activeLabel)) {
			return;
		}
		setRefAreaRight(e.activeLabel);
	};

	const handleMouseUp = () => {
		if (!refAreaLeft) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const rightBoundary = refAreaRight ?? refAreaLeft;
		const source =
			activeMode === "by-event" ? displayPerEventData : displayData;
		const leftIndex = source.findIndex((d) => d.date === refAreaLeft);
		const rightIndex = source.findIndex((d) => d.date === rightBoundary);

		if (leftIndex === -1 || rightIndex === -1) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const [startIndex, endIndex] =
			leftIndex < rightIndex
				? [leftIndex, rightIndex]
				: [rightIndex, leftIndex];

		if (activeMode === "by-event") {
			setZoomedPerEventData(
				displayPerEventData.slice(startIndex, endIndex + 1)
			);
			setZoomedData(chartData.slice(startIndex, endIndex + 1));
		} else {
			setZoomedData(displayData.slice(startIndex, endIndex + 1));
		}

		setRefAreaLeft(null);
		setRefAreaRight(null);
	};

	const toggleEvent = useCallback((eventName: string) => {
		setHiddenEvents((prev) => {
			const next = new Set(prev);
			if (next.has(eventName)) {
				next.delete(eventName);
			} else {
				next.add(eventName);
			}
			return next;
		});
	}, []);

	const visibleEventNames = useMemo(
		() => eventNames.filter((name) => !hiddenEvents.has(name)),
		[eventNames, hiddenEvents]
	);

	const totalEvents = displayData.reduce((sum, d) => sum + d.events, 0);
	const totalUsers = displayData.reduce((sum, d) => sum + d.users, 0);

	if (isLoading) {
		return (
			<div className="flex h-full flex-col rounded border bg-card">
				<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
					<div className="flex size-8 items-center justify-center rounded bg-accent">
						<LightningIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div className="h-4 w-24 animate-pulse rounded bg-muted" />
						<div className="mt-1 h-3 w-32 animate-pulse rounded bg-muted" />
					</div>
				</div>
				<div className="flex-1 p-3 sm:p-4">
					<div className="h-[260px] w-full animate-pulse rounded bg-muted" />
				</div>
			</div>
		);
	}

	if (!chartData.length) {
		return (
			<div className="flex h-full flex-col rounded border bg-card">
				<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
					<div className="flex size-8 items-center justify-center rounded bg-accent">
						<LightningIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold text-foreground text-sm sm:text-base">
							Events Trend
						</h2>
						<p className="text-muted-foreground text-xs">No data available</p>
					</div>
				</div>
				<div className="flex-1 p-3 sm:p-4">
					<TableEmptyState
						description="Event trends will appear here when events are tracked."
						icon={<LightningIcon className="size-6 text-muted-foreground" />}
						title="No event trend data"
					/>
				</div>
			</div>
		);
	}

	const activeData =
		activeMode === "by-event" ? displayPerEventData : displayData;
	const bottomMargin = activeData.length > 5 ? 35 : 5;

	return (
		<div className="flex h-full flex-col rounded border bg-card">
			<div className="flex flex-col items-start justify-between gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-center sm:px-4 sm:py-3">
				<div className="flex items-center gap-3">
					<div className="flex size-8 items-center justify-center rounded bg-primary/10">
						<LightningIcon className="size-4 text-primary" weight="duotone" />
					</div>
					<div className="min-w-0">
						<h2 className="font-semibold text-foreground text-sm sm:text-base">
							Events Trend
						</h2>
						<p className="text-muted-foreground text-xs">
							{activeMode === "by-event"
								? "Events broken down by type"
								: "Event occurrences over time"}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{isFetching && !isLoading && (
						<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<ArrowCounterClockwiseIcon className="size-3 animate-spin" />
							<span>Updating...</span>
						</div>
					)}
					{isZoomed && (
						<Button
							className="h-7 gap-1 px-2 text-xs"
							onClick={resetZoom}
							size="sm"
							variant="outline"
						>
							<ArrowCounterClockwiseIcon className="size-3" weight="bold" />
							Reset
						</Button>
					)}
					{hasPerEventData && (
						<div className="flex items-center rounded border">
							<button
								aria-label="Show aggregate view"
								className={`flex items-center gap-1 rounded-l px-2 py-1 text-xs transition-colors ${activeMode === "aggregate" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
								onClick={() => setChartMode("aggregate")}
								type="button"
							>
								<ChartLineUpIcon className="size-3.5" weight="duotone" />
								<span className="hidden sm:inline">Total</span>
							</button>
							<button
								aria-label="Show per-event breakdown"
								className={`flex items-center gap-1 rounded-r px-2 py-1 text-xs transition-colors ${activeMode === "by-event" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
								onClick={() => setChartMode("by-event")}
								type="button"
							>
								<ListBulletsIcon className="size-3.5" weight="duotone" />
								<span className="hidden sm:inline">By Event</span>
							</button>
						</div>
					)}
					<Badge variant="gray">
						<span className="font-mono text-[10px]">Drag to zoom</span>
					</Badge>
				</div>
			</div>

			{activeMode === "aggregate" && (
				<div className="grid grid-cols-2 gap-3 border-b bg-muted/30 p-3">
					<div className="space-y-0.5">
						<p className="font-mono text-[10px] text-muted-foreground uppercase">
							Total Events
						</p>
						<p className="font-semibold text-foreground text-lg tabular-nums">
							{totalEvents.toLocaleString()}
						</p>
					</div>
					<div className="space-y-0.5">
						<p className="font-mono text-[10px] text-muted-foreground uppercase">
							Unique Users
						</p>
						<p className="font-semibold text-foreground text-lg tabular-nums">
							{totalUsers.toLocaleString()}
						</p>
					</div>
				</div>
			)}

			{activeMode === "by-event" && eventNames.length > 0 && (
				<div className="flex flex-wrap gap-1.5 border-b bg-muted/30 px-3 py-2">
					{eventNames.map((name, idx) => {
						const color = EVENT_COLORS[idx % EVENT_COLORS.length] ?? "#888";
						const isHidden = hiddenEvents.has(name);
						return (
							<button
								aria-label={`Toggle ${name}`}
								className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${isHidden ? "text-muted-foreground/50 line-through" : "text-foreground"} hover:bg-accent/50`}
								key={name}
								onClick={() => toggleEvent(name)}
								type="button"
							>
								<div
									className={`size-2 rounded ${isHidden ? "opacity-30" : ""}`}
									style={{ backgroundColor: color }}
								/>
								<span className="max-w-[120px] truncate">{name}</span>
							</button>
						);
					})}
				</div>
			)}

			<div className="relative flex-1 overflow-hidden p-2">
				<div
					className="relative select-none"
					style={{
						width: "100%",
						height: 260,
						minWidth: 300,
						userSelect: refAreaLeft ? "none" : "auto",
						WebkitUserSelect: refAreaLeft ? "none" : "auto",
					}}
				>
					<ResponsiveContainer height="100%" width="100%">
						<AreaChart
							data={activeData}
							margin={{ top: 10, right: 10, left: 0, bottom: bottomMargin }}
							onMouseDown={handleMouseDown}
							onMouseMove={handleMouseMove}
							onMouseUp={handleMouseUp}
						>
							<defs>
								{activeMode === "by-event"
									? visibleEventNames.map((name, idx) => {
											const color =
												EVENT_COLORS[
													eventNames.indexOf(name) % EVENT_COLORS.length
												] ?? "#888";
											return (
												<linearGradient
													id={`colorEvent-${idx}`}
													key={name}
													x1="0"
													x2="0"
													y1="0"
													y2="1"
												>
													<stop
														offset="5%"
														stopColor={color}
														stopOpacity={0.25}
													/>
													<stop
														offset="95%"
														stopColor={color}
														stopOpacity={0.02}
													/>
												</linearGradient>
											);
										})
									: [
											<linearGradient
												id="colorEvents"
												key="events"
												x1="0"
												x2="0"
												y1="0"
												y2="1"
											>
												<stop
													offset="5%"
													stopColor={EVENTS_COLOR}
													stopOpacity={0.3}
												/>
												<stop
													offset="95%"
													stopColor={EVENTS_COLOR}
													stopOpacity={0.05}
												/>
											</linearGradient>,
											<linearGradient
												id="colorUsers"
												key="users"
												x1="0"
												x2="0"
												y1="0"
												y2="1"
											>
												<stop
													offset="5%"
													stopColor={USERS_COLOR}
													stopOpacity={0.3}
												/>
												<stop
													offset="95%"
													stopColor={USERS_COLOR}
													stopOpacity={0.05}
												/>
											</linearGradient>,
										]}
							</defs>
							<CartesianGrid {...GRID_PROPS} />
							<XAxis
								axisLine={false}
								dataKey="date"
								dy={5}
								tick={AXIS_TICK}
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								tick={AXIS_TICK}
								tickFormatter={formatYTick}
								tickLine={false}
								width={30}
							/>
							<Tooltip
								content={
									activeMode === "by-event" ? (
										<ChartTooltip />
									) : (
										<ChartTooltip resolveColor={aggregateColorResolver} />
									)
								}
								wrapperStyle={{
									outline: "none",
									zIndex: 10,
									pointerEvents: "auto",
								}}
							/>
							{activeMode === "aggregate" && (
								<Legend
									iconSize={8}
									iconType="circle"
									wrapperStyle={{
										fontSize: "10px",
										paddingTop: "5px",
										bottom: bottomMargin > 5 ? 20 : 0,
									}}
								/>
							)}
							{refAreaLeft && refAreaRight && (
								<ReferenceArea
									fill="var(--primary)"
									fillOpacity={0.1}
									stroke="var(--primary)"
									strokeOpacity={0.3}
									x1={refAreaLeft}
									x2={refAreaRight}
								/>
							)}
							{activeMode === "by-event"
								? visibleEventNames.map((name, idx) => {
										const originalIdx = eventNames.indexOf(name);
										const color =
											EVENT_COLORS[originalIdx % EVENT_COLORS.length] ?? "#888";
										return (
											<Area
												dataKey={name}
												fill={`url(#colorEvent-${idx})`}
												fillOpacity={1}
												key={name}
												name={name}
												stackId="events"
												stroke={color}
												strokeWidth={1.5}
												type="monotone"
											/>
										);
									})
								: [
										<Area
											dataKey="events"
											fill="url(#colorEvents)"
											fillOpacity={1}
											key="events"
											name="Events"
											stroke={EVENTS_COLOR}
											strokeWidth={2}
											type="monotone"
										/>,
										<Area
											dataKey="users"
											fill="url(#colorUsers)"
											fillOpacity={1}
											key="users"
											name="Users"
											stroke={USERS_COLOR}
											strokeWidth={2}
											type="monotone"
										/>,
									]}
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}
