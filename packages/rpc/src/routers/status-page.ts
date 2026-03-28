import {
	and,
	chQuery,
	db,
	eq,
	inArray,
	organization,
	uptimeSchedules,
	websites,
} from "@databuddy/db";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure, publicProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const UPTIME_TABLE = "uptime.uptime_monitor";

const dailyUptimeSchema = z.object({
	date: z.string(),
	uptime_percentage: z.number(),
	avg_response_time: z.number().optional(),
	p95_response_time: z.number().optional(),
});

const monitorSchema = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string(),
	currentStatus: z.enum(["up", "down", "unknown"]),
	uptimePercentage: z.number(),
	dailyData: z.array(dailyUptimeSchema),
	lastCheckedAt: z.string().nullable(),
});

const statusPageOutputSchema = z.object({
	organization: z.object({
		name: z.string(),
		slug: z.string(),
		logo: z.string().nullable(),
	}),
	overallStatus: z.enum(["operational", "degraded", "outage"]),
	monitors: z.array(monitorSchema),
});

function deriveOverallStatus(
	monitors: { currentStatus: "up" | "down" | "unknown" }[]
): "operational" | "degraded" | "outage" {
	if (monitors.length === 0) {
		return "operational";
	}
	const hasDown = monitors.some((m) => m.currentStatus === "down");
	const allDown = monitors.every((m) => m.currentStatus === "down");

	if (allDown) {
		return "outage";
	}
	if (hasDown) {
		return "degraded";
	}
	return "operational";
}

interface DailyRow {
	site_id: string;
	date: string;
	uptime_percentage: number;
	avg_response_time: number;
	p95_response_time: number;
}

interface LatestCheckRow {
	site_id: string;
	last_timestamp: string;
	last_status: number;
}

export const statusPageRouter = {
	getBySlug: publicProcedure
		.route({
			method: "POST",
			path: "/statusPage/getBySlug",
			summary: "Get public status page",
			tags: ["StatusPage"],
		})
		.input(z.object({ slug: z.string().min(1) }))
		.output(statusPageOutputSchema)
		.handler(async ({ input }) => {
			const [org] = await db
				.select()
				.from(organization)
				.where(eq(organization.slug, input.slug))
				.limit(1);

			if (!org) {
				throw rpcError.notFound("Organization", input.slug);
			}

			const schedules = await db
				.select({
					id: uptimeSchedules.id,
					websiteId: uptimeSchedules.websiteId,
					name: uptimeSchedules.name,
					url: uptimeSchedules.url,
				})
				.from(uptimeSchedules)
				.where(
					and(
						eq(uptimeSchedules.organizationId, org.id),
						eq(uptimeSchedules.isPublic, true),
						eq(uptimeSchedules.isPaused, false)
					)
				);

			if (schedules.length === 0) {
				throw rpcError.notFound("StatusPage", input.slug);
			}

			const today = new Date();
			const ninetyDaysAgo = new Date(today);
			ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);

			const startDate = ninetyDaysAgo.toISOString().split("T").at(0) ?? "";
			const endDate = today.toISOString().split("T").at(0) ?? "";

			const websiteIds = schedules
				.map((s) => s.websiteId)
				.filter((id): id is string => id !== null);

			const siteIds = schedules.map((s) => s.websiteId ?? s.id);

			const [websiteRows, allDailyData, allRecentChecks] = await Promise.all([
				websiteIds.length > 0
					? db
							.select({
								id: websites.id,
								domain: websites.domain,
								name: websites.name,
							})
							.from(websites)
							.where(inArray(websites.id, websiteIds))
					: Promise.resolve([]),
				chQuery<DailyRow>(
					`SELECT
							site_id,
							toDate(timestamp) as date,
							if((countIf(status = 1) + countIf(status = 0)) = 0, 0, round((countIf(status = 1) / (countIf(status = 1) + countIf(status = 0))) * 100, 2)) as uptime_percentage,
							round(avg(total_ms), 2) as avg_response_time,
							round(quantile(0.95)(total_ms), 2) as p95_response_time
						FROM ${UPTIME_TABLE}
						WHERE
							site_id IN ({siteIds:Array(String)})
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						GROUP BY site_id, date
						ORDER BY site_id, date ASC`,
					{ siteIds, startDate, endDate }
				),
				chQuery<LatestCheckRow>(
					`SELECT
							site_id,
							max(timestamp) as last_timestamp,
							argMax(status, timestamp) as last_status
						FROM ${UPTIME_TABLE}
						WHERE site_id IN ({siteIds:Array(String)})
						GROUP BY site_id`,
					{ siteIds }
				),
			]);

			const websiteMap = new Map(websiteRows.map((w) => [w.id, w]));

			const dailyBySite = new Map<string, DailyRow[]>();
			for (const row of allDailyData) {
				const existing = dailyBySite.get(row.site_id);
				if (existing) {
					existing.push(row);
				} else {
					dailyBySite.set(row.site_id, [row]);
				}
			}

			const latestBySite = new Map<string, LatestCheckRow>();
			for (const row of allRecentChecks) {
				latestBySite.set(row.site_id, row);
			}

			const monitors = schedules.map((schedule) => {
				const siteId = schedule.websiteId ?? schedule.id;
				const website = schedule.websiteId
					? websiteMap.get(schedule.websiteId)
					: undefined;
				const dailyData = dailyBySite.get(siteId) ?? [];
				const latestCheck = latestBySite.get(siteId);

				const currentStatus: "up" | "down" | "unknown" = latestCheck
					? latestCheck.last_status === 1
						? "up"
						: latestCheck.last_status === 0
							? "down"
							: "unknown"
					: "unknown";

				const uptimePercentage =
					dailyData.length > 0
						? dailyData.reduce((sum, d) => sum + d.uptime_percentage, 0) /
							dailyData.length
						: 0;

				return {
					id: schedule.id,
					name:
						schedule.name ?? website?.name ?? website?.domain ?? schedule.url,
					domain: website?.domain ?? schedule.url,
					currentStatus,
					uptimePercentage: Math.round(uptimePercentage * 100) / 100,
					dailyData: dailyData.map((d) => ({
						date: String(d.date),
						uptime_percentage: d.uptime_percentage,
						avg_response_time: d.avg_response_time,
						p95_response_time: d.p95_response_time,
					})),
					lastCheckedAt: latestCheck?.last_timestamp ?? null,
				};
			});

			return {
				organization: {
					name: org.name,
					slug: org.slug ?? input.slug,
					logo: org.logo,
				},
				overallStatus: deriveOverallStatus(monitors),
				monitors,
			};
		}),

	togglePublicMonitor: protectedProcedure
		.route({
			method: "POST",
			path: "/statusPage/togglePublicMonitor",
			summary: "Toggle monitor public visibility",
			tags: ["StatusPage"],
		})
		.input(
			z.object({
				scheduleId: z.string(),
				isPublic: z.boolean(),
			})
		)
		.output(z.object({ success: z.literal(true), isPublic: z.boolean() }))
		.handler(async ({ context, input }) => {
			const schedule = await db.query.uptimeSchedules.findFirst({
				where: eq(uptimeSchedules.id, input.scheduleId),
			});

			if (!schedule) {
				throw rpcError.notFound("Schedule", input.scheduleId);
			}

			await withWorkspace(context, {
				organizationId: schedule.organizationId,
				resource: "website",
				permissions: ["update"],
			});

			await db
				.update(uptimeSchedules)
				.set({ isPublic: input.isPublic, updatedAt: new Date() })
				.where(eq(uptimeSchedules.id, input.scheduleId));

			logger.info(
				{ scheduleId: input.scheduleId, isPublic: input.isPublic },
				"Monitor public visibility toggled"
			);

			return { success: true, isPublic: input.isPublic };
		}),
};
