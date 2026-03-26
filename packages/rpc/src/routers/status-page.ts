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

			const websiteRows =
				websiteIds.length > 0
					? await db
							.select({
								id: websites.id,
								domain: websites.domain,
								name: websites.name,
							})
							.from(websites)
							.where(inArray(websites.id, websiteIds))
					: [];

			const websiteMap = new Map(websiteRows.map((w) => [w.id, w]));

			const monitors = await Promise.all(
				schedules.map(async (schedule) => {
					const siteId = schedule.websiteId ?? schedule.id;
					const website = schedule.websiteId
						? websiteMap.get(schedule.websiteId)
						: undefined;

					const [dailyData, recentCheck] = await Promise.all([
						chQuery<{ date: string; uptime_percentage: number }>(
							`SELECT
							toDate(timestamp) as date,
							if((countIf(status = 1) + countIf(status = 0)) = 0, 0, round((countIf(status = 1) / (countIf(status = 1) + countIf(status = 0))) * 100, 2)) as uptime_percentage
						FROM ${UPTIME_TABLE}
						WHERE
							site_id = {siteId:String}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						GROUP BY date
						ORDER BY date ASC`,
							{ siteId, startDate, endDate }
						),
						chQuery<{ timestamp: string; status: number }>(
							`SELECT timestamp, status
						FROM ${UPTIME_TABLE}
						WHERE site_id = {siteId:String}
						ORDER BY timestamp DESC
						LIMIT 1`,
							{ siteId }
						),
					]);

					const latestCheck = recentCheck.at(0);
					const currentStatus: "up" | "down" | "unknown" = latestCheck
						? latestCheck.status === 1
							? "up"
							: latestCheck.status === 0
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
						})),
						lastCheckedAt: latestCheck?.timestamp ?? null,
					};
				})
			);

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
