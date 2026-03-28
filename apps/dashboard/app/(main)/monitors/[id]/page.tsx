"use client";

import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	ArrowSquareOutIcon,
	CopyIcon,
	GlobeIcon,
	HeartbeatIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MonitorDetailLoading } from "@/app/(main)/monitors/_components/monitor-detail-loading";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MonitorSheet } from "@/components/monitors/monitor-sheet";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { orpc } from "@/lib/orpc";
import { fromNow, localDayjs } from "@/lib/time";
import { UptimeHeatmap } from "@/lib/uptime/uptime-heatmap";
import {
	RecentActivity,
	type RecentActivityCheck,
	recentActivityCheckKey,
} from "../../websites/[id]/pulse/_components/recent-activity";

const LatencyChart = dynamic(
	() =>
		import("@/lib/uptime/latency-chart").then((m) => ({
			default: m.LatencyChart,
		})),
	{ ssr: false }
);

const RECENT_CHECKS_PAGE_SIZE = 50;

const granularityLabels: Record<string, string> = {
	minute: "Every minute",
	five_minutes: "Every 5 minutes",
	ten_minutes: "Every 10 minutes",
	thirty_minutes: "Every 30 minutes",
	hour: "Hourly",
	six_hours: "Every 6 hours",
	twelve_hours: "Every 12 hours",
	day: "Daily",
};

interface ScheduleData {
	id: string;
	websiteId: string | null;
	url: string;
	name: string | null;
	granularity: string;
	cron: string;
	isPaused: boolean;
	isPublic: boolean;
	qstashStatus: string;
	jsonParsingConfig?: { enabled: boolean } | null;
	website?: {
		id: string;
		name: string | null;
		domain: string;
	} | null;
}

export default function MonitorDetailsPage() {
	const { id: scheduleId } = useParams();
	const router = useRouter();
	const { activeOrganization } = useOrganizationsContext();
	const { dateRange } = useDateFilters();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		url: string;
		name?: string | null;
		granularity: string;
		isPublic?: boolean;
		jsonParsingConfig?: {
			enabled: boolean;
		} | null;
	} | null>(null);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isPausing, setIsPausing] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [recentChecksPage, setRecentChecksPage] = useState(1);
	const [allRecentChecks, setAllRecentChecks] = useState<RecentActivityCheck[]>(
		[]
	);
	const [recentLoadMoreRef, setRecentLoadMoreRef] =
		useState<HTMLTableCellElement | null>(null);
	const [recentScrollContainerRef, setRecentScrollContainerRef] =
		useState<HTMLDivElement | null>(null);
	const [isRecentChecksInitialLoad, setIsRecentChecksInitialLoad] =
		useState(true);

	const {
		data: rawSchedule,
		refetch: refetchSchedule,
		isLoading: isLoadingSchedule,
		isError: isScheduleError,
	} = useQuery({
		...orpc.uptime.getSchedule.queryOptions({
			input: { scheduleId: scheduleId as string },
		}),
		enabled: !!scheduleId,
	});

	const schedule = rawSchedule as ScheduleData | undefined;

	const pauseMutation = useMutation({
		...orpc.uptime.pauseSchedule.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...orpc.uptime.resumeSchedule.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...orpc.uptime.deleteSchedule.mutationOptions(),
	});
	const togglePublicMutation = useMutation({
		...orpc.statusPage.togglePublicMonitor.mutationOptions(),
	});

	const hasMonitor = !!schedule;

	// Build query options - use websiteId for website monitors, scheduleId for custom monitors
	const queryIdOptions = useMemo(() => {
		if (!schedule) {
			return { scheduleId: scheduleId as string };
		}
		return schedule.websiteId
			? { websiteId: schedule.websiteId }
			: { scheduleId: schedule.id };
	}, [schedule, scheduleId]);

	// Fetch uptime analytics data (paginated for infinite scroll)
	const uptimeQueries = useMemo(
		() => [
			{
				id: "uptime-recent-checks",
				parameters: ["uptime_recent_checks"],
				limit: RECENT_CHECKS_PAGE_SIZE,
				page: recentChecksPage,
			},
		],
		[recentChecksPage]
	);

	const {
		results: uptimeBatchResults,
		isFetching: isFetchingUptimeChecks,
		isPending: isPendingUptimeChecks,
		refetch: refetchUptimeData,
	} = useBatchDynamicQuery(queryIdOptions, dateRange, uptimeQueries, {
		enabled: hasMonitor,
		placeholderData: keepPreviousData,
	});

	const pageRecentChecks = useMemo(() => {
		const row = uptimeBatchResults.find(
			(r) => r.queryId === "uptime-recent-checks"
		);
		if (!row?.success) {
			return [];
		}
		const raw = row.data.uptime_recent_checks;
		return Array.isArray(raw) ? (raw as RecentActivityCheck[]) : [];
	}, [uptimeBatchResults]);

	useEffect(() => {
		setRecentChecksPage(1);
		setAllRecentChecks([]);
		setIsRecentChecksInitialLoad(true);
	}, [dateRange, scheduleId]);

	const recentChecksHasNext =
		pageRecentChecks.length === RECENT_CHECKS_PAGE_SIZE;

	const handleRecentChecksIntersection = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [entry] = entries;
			if (
				entry?.isIntersecting &&
				recentChecksHasNext &&
				!isFetchingUptimeChecks
			) {
				setRecentChecksPage((prev) => prev + 1);
			}
		},
		[recentChecksHasNext, isFetchingUptimeChecks]
	);

	useEffect(() => {
		if (!(recentLoadMoreRef && recentScrollContainerRef)) {
			return;
		}

		const observer = new IntersectionObserver(handleRecentChecksIntersection, {
			root: recentScrollContainerRef,
			rootMargin: "300px",
			threshold: 0.1,
		});

		observer.observe(recentLoadMoreRef);

		return () => {
			observer.disconnect();
		};
	}, [
		recentLoadMoreRef,
		recentScrollContainerRef,
		handleRecentChecksIntersection,
	]);

	useEffect(() => {
		if (pageRecentChecks.length === 0) {
			if (recentChecksPage === 1 && !isFetchingUptimeChecks) {
				setAllRecentChecks([]);
				setIsRecentChecksInitialLoad(false);
			}
			return;
		}

		setAllRecentChecks((prev) => {
			if (recentChecksPage === 1) {
				return [...pageRecentChecks];
			}
			const seen = new Set(prev.map(recentActivityCheckKey));
			const merged = [...prev];
			for (const check of pageRecentChecks) {
				const key = recentActivityCheckKey(check);
				if (!seen.has(key)) {
					seen.add(key);
					merged.push(check);
				}
			}
			return merged;
		});
		setIsRecentChecksInitialLoad(false);
	}, [pageRecentChecks, recentChecksPage, isFetchingUptimeChecks]);

	const heatmapDateRange = useMemo(
		() => ({
			start_date: localDayjs()
				.subtract(89, "day")
				.startOf("day")
				.format("YYYY-MM-DD"),
			end_date: localDayjs().startOf("day").format("YYYY-MM-DD"),
			granularity: "daily" as const,
		}),
		[]
	);

	const heatmapQueries = useMemo(
		() => [
			{
				id: "uptime-heatmap",
				parameters: ["uptime_time_series"],
				granularity: "daily" as const,
			},
		],
		[]
	);

	const {
		getDataForQuery: getHeatmapData,
		refetch: refetchHeatmapData,
		isLoading: isLoadingHeatmap,
	} = useBatchDynamicQuery(queryIdOptions, heatmapDateRange, heatmapQueries, {
		enabled: hasMonitor,
	});

	const heatmapData =
		getHeatmapData("uptime-heatmap", "uptime_time_series") || [];

	const latencyDateRange = useMemo(() => {
		const days = localDayjs(dateRange.end_date).diff(
			localDayjs(dateRange.start_date),
			"day"
		);
		const granularity: "hourly" | "daily" = days <= 7 ? "hourly" : "daily";
		return {
			start_date: dateRange.start_date,
			end_date: dateRange.end_date,
			granularity,
		};
	}, [dateRange]);

	const latencyQueries = useMemo(
		() => [
			{
				id: "uptime-latency",
				parameters: ["uptime_response_time_trends"],
			},
		],
		[]
	);

	const {
		getDataForQuery: getLatencyData,
		isLoading: isLoadingLatency,
		refetch: refetchLatencyData,
	} = useBatchDynamicQuery(queryIdOptions, latencyDateRange, latencyQueries, {
		enabled: hasMonitor,
	});

	const latencyData = getLatencyData(
		"uptime-latency",
		"uptime_response_time_trends"
	);

	const handleEditMonitor = () => {
		if (schedule) {
			setEditingSchedule({
				id: schedule.id,
				url: schedule.url,
				name: schedule.name,
				granularity: schedule.granularity,
				isPublic: schedule.isPublic,
				jsonParsingConfig: schedule.jsonParsingConfig as {
					enabled: boolean;
				} | null,
			});
			setIsDialogOpen(true);
		}
	};

	const handleTogglePause = async () => {
		if (!schedule) {
			return;
		}

		setIsPausing(true);
		try {
			if (schedule.isPaused) {
				await resumeMutation.mutateAsync({ scheduleId: schedule.id });
				toast.success("Monitor resumed");
			} else {
				await pauseMutation.mutateAsync({ scheduleId: schedule.id });
				toast.success("Monitor paused");
			}
			await refetchSchedule();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to update monitor";
			toast.error(errorMessage);
		}
		setIsPausing(false);
	};

	const handleMonitorSaved = async () => {
		setIsDialogOpen(false);
		setEditingSchedule(null);
		await refetchSchedule();
	};

	const handleDeleteMonitor = async () => {
		if (!schedule) {
			return;
		}

		try {
			await deleteMutation.mutateAsync({ scheduleId: schedule.id });
			toast.success("Monitor deleted successfully");
			router.push("/monitors");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to delete monitor";
			toast.error(errorMessage);
		}
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		setRecentChecksPage(1);
		setAllRecentChecks([]);
		setIsRecentChecksInitialLoad(true);
		try {
			await Promise.all([
				refetchSchedule(),
				refetchUptimeData(),
				refetchHeatmapData(),
				refetchLatencyData(),
			]);
		} catch {
			// Error handled by individual refetch handlers
		}
		setIsRefreshing(false);
	};

	const statusPageUrl = activeOrganization?.slug
		? `${globalThis.location?.origin ?? ""}/status/${activeOrganization.slug}`
		: null;

	const handleTogglePublic = async () => {
		if (!schedule) {
			return;
		}

		try {
			const result = await togglePublicMutation.mutateAsync({
				scheduleId: schedule.id,
				isPublic: !schedule.isPublic,
			});
			await refetchSchedule();
			toast.success(
				result.isPublic
					? "Monitor is now visible on the public status page"
					: "Monitor removed from the public status page"
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to update visibility";
			toast.error(errorMessage);
		}
	};

	const handleCopyStatusUrl = () => {
		if (statusPageUrl) {
			navigator.clipboard.writeText(statusPageUrl);
			toast.success("Status page URL copied");
		}
	};

	if (isLoadingSchedule) {
		return <MonitorDetailLoading />;
	}

	if (isScheduleError || !schedule) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-6">
				<EmptyState
					action={{
						label: "Back to Monitors",
						onClick: () => router.push("/monitors"),
					}}
					description="The monitor you are looking for does not exist or you don't have permission to view it."
					icon={<HeartbeatIcon />}
					title="Monitor not found"
				/>
			</div>
		);
	}

	// Determine current status based on the most recent check
	const latestCheck = allRecentChecks[0];
	const currentStatus = latestCheck
		? latestCheck.status === 1
			? "up"
			: latestCheck.status === 2
				? "unknown"
				: "down"
		: "unknown";

	// Determine display name - prefer website name/domain for website monitors
	const isWebsiteMonitor = !!schedule.websiteId;
	const displayName = isWebsiteMonitor
		? schedule.website?.name ||
			schedule.website?.domain ||
			schedule.name ||
			"Uptime Monitor"
		: schedule.name || schedule.url || "Uptime Monitor";

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				description={schedule.url}
				icon={<HeartbeatIcon />}
				right={
					<>
						<Button
							onClick={() => router.push("/monitors")}
							size="sm"
							type="button"
							variant="ghost"
						>
							<ArrowLeftIcon className="mr-2 size-4" />
							Back
						</Button>
						<Button
							aria-label="Refresh monitor data"
							disabled={isRefreshing}
							onClick={handleRefresh}
							size="icon"
							type="button"
							variant="secondary"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ? "animate-spin" : ""}
								size={16}
							/>
						</Button>
						<Button
							disabled={togglePublicMutation.isPending}
							onClick={handleTogglePublic}
							size="sm"
							type="button"
							variant={schedule.isPublic ? "default" : "outline"}
						>
							<GlobeIcon size={16} weight="duotone" />
							<span className="hidden sm:inline">
								{schedule.isPublic ? "Public" : "Make public"}
							</span>
							<span className="sm:hidden">
								{schedule.isPublic ? "Listed" : "List"}
							</span>
						</Button>
						<Button
							disabled={
								isPausing || pauseMutation.isPending || resumeMutation.isPending
							}
							onClick={handleTogglePause}
							size="sm"
							type="button"
							variant="outline"
						>
							{schedule.isPaused ? (
								<>
									<PlayIcon size={16} weight="fill" />
									Resume
								</>
							) : (
								<>
									<PauseIcon size={16} weight="fill" />
									Pause
								</>
							)}
						</Button>
						<Button
							aria-label="Configure monitor"
							onClick={handleEditMonitor}
							size="sm"
							type="button"
							variant="outline"
						>
							<PencilIcon size={16} weight="duotone" />
							<span className="hidden sm:inline">Configure</span>
						</Button>
						<Button
							aria-label="Delete monitor"
							disabled={deleteMutation.isPending}
							onClick={() => setIsDeleteDialogOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							<TrashIcon size={16} weight="duotone" />
							<span className="hidden sm:inline">Delete</span>
						</Button>
					</>
				}
				title={displayName}
			/>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{schedule.isPublic && statusPageUrl ? (
					<div className="flex h-10 shrink-0 items-center justify-between border-b bg-emerald-500/5 px-4 py-2.5 sm:px-6">
						<div className="flex items-center gap-2 overflow-hidden">
							<GlobeIcon
								className="size-4 shrink-0 text-emerald-600"
								weight="duotone"
							/>
							<span className="truncate text-pretty text-muted-foreground text-xs">
								Visible on{" "}
								<Link
									className="font-medium text-foreground hover:underline"
									href={statusPageUrl}
									rel="noopener noreferrer"
									target="_blank"
								>
									public status page
								</Link>
							</span>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							<Button
								aria-label="Copy status page URL"
								onClick={handleCopyStatusUrl}
								size="sm"
								variant="ghost"
							>
								<CopyIcon size={14} weight="duotone" />
							</Button>
							<Button
								aria-label="Open status page"
								asChild
								size="sm"
								variant="ghost"
							>
								<Link
									href={statusPageUrl}
									rel="noopener noreferrer"
									target="_blank"
								>
									<ArrowSquareOutIcon size={14} weight="duotone" />
								</Link>
							</Button>
						</div>
					</div>
				) : null}

				<div className="shrink-0 border-b bg-card px-4 py-4 sm:px-6">
					<dl className="grid min-h-[5.25rem] gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<div className="min-w-0">
							<dt className="text-balance text-muted-foreground text-xs">
								Status
							</dt>
							<dd className="mt-1.5">
								<Badge
									className={
										!schedule.isPaused && currentStatus === "up"
											? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
											: ""
									}
									variant={
										schedule.isPaused
											? "secondary"
											: currentStatus === "down"
												? "destructive"
												: "default"
									}
								>
									{schedule.isPaused
										? "Paused"
										: currentStatus === "down"
											? "Outage"
											: currentStatus === "up"
												? "Operational"
												: "Unknown"}
								</Badge>
							</dd>
						</div>
						<div className="min-w-0">
							<dt className="text-balance text-muted-foreground text-xs">
								Check frequency
							</dt>
							<dd className="mt-1.5 text-pretty font-medium text-foreground text-sm">
								{granularityLabels[schedule.granularity] ||
									schedule.granularity}
							</dd>
						</div>
						{latestCheck ? (
							<div className="min-w-0">
								<dt className="text-balance text-muted-foreground text-xs">
									Last check
								</dt>
								<dd className="mt-1.5 text-pretty font-medium text-foreground text-sm tabular-nums">
									{fromNow(latestCheck.timestamp)}
								</dd>
							</div>
						) : (
							<div className="min-w-0">
								<dt className="text-balance text-muted-foreground text-xs">
									Last check
								</dt>
								<dd className="mt-1.5 text-muted-foreground text-sm">
									Waiting for data
								</dd>
							</div>
						)}
						{schedule.websiteId && schedule.website ? (
							<div className="min-w-0 sm:col-span-2 lg:col-span-1">
								<dt className="text-balance text-muted-foreground text-xs">
									Website
								</dt>
								<dd className="mt-1.5 min-w-0">
									<Link
										className="inline-flex max-w-full items-center gap-1.5 text-pretty font-medium text-primary text-sm hover:underline"
										href={`/websites/${schedule.websiteId}/pulse`}
									>
										<GlobeIcon
											aria-hidden
											className="size-4 shrink-0"
											weight="duotone"
										/>
										<span className="truncate">
											{schedule.website.name || schedule.website.domain}
										</span>
									</Link>
								</dd>
							</div>
						) : null}
					</dl>
				</div>

				<div className="shrink-0 bg-sidebar">
					<UptimeHeatmap
						data={heatmapData}
						days={90}
						isLoading={isLoadingHeatmap}
					/>
					<LatencyChart
						data={latencyData}
						isLoading={isLoadingLatency}
						storageKey={`monitor-latency-${scheduleId}`}
					/>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t bg-sidebar">
					<div
						className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
						ref={setRecentScrollContainerRef}
					>
						<RecentActivity
							checks={allRecentChecks}
							hasMore={recentChecksHasNext}
							isLoading={
								isRecentChecksInitialLoad &&
								allRecentChecks.length === 0 &&
								isPendingUptimeChecks
							}
							isLoadingMore={
								!isRecentChecksInitialLoad &&
								allRecentChecks.length > 0 &&
								isFetchingUptimeChecks
							}
							loadMoreRef={setRecentLoadMoreRef}
						/>
					</div>
				</div>
			</div>

			<MonitorSheet
				onCloseAction={setIsDialogOpen}
				onSaveAction={handleMonitorSaved}
				open={isDialogOpen}
				schedule={editingSchedule}
				websiteId={schedule.websiteId || undefined}
			/>

			<AlertDialog
				onOpenChange={setIsDeleteDialogOpen}
				open={isDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Monitor</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this uptime monitor? This action
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={deleteMutation.isPending}
							onClick={handleDeleteMonitor}
						>
							{deleteMutation.isPending ? "Deleting..." : "Delete Monitor"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
