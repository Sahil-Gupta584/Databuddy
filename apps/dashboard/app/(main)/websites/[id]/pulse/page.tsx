"use client";

import {
	ArrowSquareOutIcon,
	CopyIcon,
	GlobeIcon,
	HeartbeatIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { fromNow, localDayjs } from "@/lib/time";
import { WebsitePageHeader } from "../_components/website-page-header";
import { RecentActivity } from "./_components/recent-activity";
import { UptimeHeatmap } from "./_components/uptime-heatmap";

const granularityLabels: Record<string, string> = {
	minute: "Every minute",
	ten_minutes: "Every 10 minutes",
	thirty_minutes: "Every 30 minutes",
	hour: "Hourly",
	six_hours: "Every 6 hours",
	twelve_hours: "Every 12 hours",
	day: "Daily",
};

interface Schedule {
	id: string;
	url: string;
	name?: string | null;
	granularity: string;
	isPaused: boolean;
	isPublic: boolean;
	jsonParsingConfig?: {
		enabled: boolean;
	} | null;
}

export default function PulsePage() {
	const { id: websiteId } = useParams();
	const { data: website } = useWebsite(websiteId as string);
	const { activeOrganization } = useOrganizationsContext();
	const { dateRange } = useDateFilters();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		id: string;
		url: string;
		name?: string | null;
		granularity: string;
		jsonParsingConfig?: {
			enabled: boolean;
		} | null;
	} | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const {
		data: rawSchedule,
		refetch: refetchSchedule,
		isLoading: isLoadingSchedule,
	} = useQuery({
		...orpc.uptime.getScheduleByWebsiteId.queryOptions({
			input: { websiteId: websiteId as string },
		}),
		enabled: !!websiteId,
	});

	const schedule = rawSchedule as Schedule | null | undefined;

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

	const [isPausing, setIsPausing] = useState(false);
	const hasMonitor = !!schedule;

	// Fetch uptime analytics data
	const uptimeQueries = useMemo(
		() => [
			{
				id: "uptime-recent-checks",
				parameters: ["uptime_recent_checks"],
				limit: 20,
			},
		],
		[]
	);

	const {
		isLoading: isLoadingUptime,
		getDataForQuery,
		refetch: refetchUptimeData,
	} = useBatchDynamicQuery(websiteId as string, dateRange, uptimeQueries, {
		enabled: hasMonitor,
	});

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
	} = useBatchDynamicQuery(
		websiteId as string,
		heatmapDateRange,
		heatmapQueries,
		{
			enabled: hasMonitor,
		}
	);

	const recentChecks =
		getDataForQuery("uptime-recent-checks", "uptime_recent_checks") || [];
	const heatmapData =
		getHeatmapData("uptime-heatmap", "uptime_time_series") || [];

	const handleCreateMonitor = () => {
		setEditingSchedule(null);
		setIsDialogOpen(true);
	};

	const handleEditMonitor = () => {
		if (schedule) {
			setEditingSchedule({
				id: schedule.id,
				url: schedule.url,
				name: schedule.name,
				granularity: schedule.granularity,
				jsonParsingConfig: schedule.jsonParsingConfig,
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
		} finally {
			setIsPausing(false);
		}
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
			await refetchSchedule();
			setIsDeleteDialogOpen(false);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to delete monitor";
			toast.error(errorMessage);
		}
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				refetchSchedule(),
				refetchUptimeData(),
				refetchHeatmapData(),
			]);
		} catch (error) {
			console.error("Failed to refresh:", error);
		} finally {
			setIsRefreshing(false);
		}
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

	// Determine current status based on the most recent check
	const latestCheck = recentChecks[0];
	const currentStatus = latestCheck
		? latestCheck.status === 1
			? "up"
			: latestCheck.status === 2
				? "unknown"
				: "down"
		: "unknown";

	// Build header subtitle with status
	const headerSubtitle = schedule ? (
		<div className="flex items-center gap-2">
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
			<span className="text-muted-foreground">•</span>
			<span className="text-muted-foreground text-sm">
				{granularityLabels[schedule.granularity] || schedule.granularity}
			</span>
			{latestCheck ? (
				<>
					<span className="text-muted-foreground">•</span>
					<span className="text-muted-foreground text-sm">
						Last checked {fromNow(latestCheck.timestamp)}
					</span>
				</>
			) : (
				<span className="text-muted-foreground text-sm">No checks yet</span>
			)}
		</div>
	) : undefined;

	// Build header actions
	const headerActions = schedule ? (
		<>
			<Button
				disabled={togglePublicMutation.isPending}
				onClick={handleTogglePublic}
				size="sm"
				variant={schedule.isPublic ? "default" : "outline"}
			>
				<GlobeIcon size={16} weight="duotone" />
				{schedule.isPublic ? "Public" : "Make Public"}
			</Button>
			<Button
				disabled={
					isPausing || pauseMutation.isPending || resumeMutation.isPending
				}
				onClick={handleTogglePause}
				size="sm"
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
			<Button onClick={handleEditMonitor} size="sm" variant="outline">
				<PencilIcon size={16} weight="duotone" />
				Configure
			</Button>
			<Button
				disabled={deleteMutation.isPending}
				onClick={() => setIsDeleteDialogOpen(true)}
				size="sm"
				variant="outline"
			>
				<TrashIcon size={16} weight="duotone" />
				Delete
			</Button>
		</>
	) : undefined;

	return (
		<div className="relative flex h-full flex-col">
			<WebsitePageHeader
				additionalActions={headerActions}
				description="Monitor your website's uptime and availability"
				icon={
					<HeartbeatIcon
						className="size-6 text-accent-foreground"
						size={16}
						weight="duotone"
					/>
				}
				isRefreshing={isRefreshing}
				onRefreshAction={handleRefresh}
				subtitle={headerSubtitle}
				title="Uptime"
				websiteId={websiteId as string}
				websiteName={website?.name || undefined}
			/>
			<div className="flex-1 overflow-y-auto">
				{isLoadingSchedule ? (
					<div className="flex h-full items-center justify-center p-4">
						<div className="text-muted-foreground text-sm">
							Loading monitor...
						</div>
					</div>
				) : schedule ? (
					<>
						{schedule.isPublic && statusPageUrl ? (
							<div className="flex h-10 items-center justify-between border-b bg-emerald-500/5 px-4 py-2.5">
								<div className="flex items-center gap-2 overflow-hidden">
									<GlobeIcon
										className="size-4 shrink-0 text-emerald-600"
										weight="duotone"
									/>
									<span className="truncate text-muted-foreground text-xs">
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

						<div className="border-b bg-sidebar">
							<UptimeHeatmap
								data={heatmapData}
								days={90}
								isLoading={isLoadingHeatmap}
							/>
						</div>

						<div className="bg-sidebar">
							<RecentActivity
								checks={recentChecks}
								isLoading={isLoadingUptime}
							/>
						</div>
					</>
				) : (
					<div className="flex h-full items-center justify-center p-4">
						<EmptyState
							action={{
								label: "Create Monitor",
								onClick: handleCreateMonitor,
							}}
							className="h-full py-0"
							description="Set up uptime monitoring to track your website's availability and receive alerts when it goes down."
							icon={<HeartbeatIcon weight="duotone" />}
							title="No monitor configured"
							variant="minimal"
						/>
					</div>
				)}
			</div>

			<MonitorSheet
				onCloseAction={setIsDialogOpen}
				onSaveAction={handleMonitorSaved}
				open={isDialogOpen}
				schedule={editingSchedule}
				websiteId={websiteId as string}
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
							cannot be undone and all historical data will be preserved but no
							new checks will be performed.
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
