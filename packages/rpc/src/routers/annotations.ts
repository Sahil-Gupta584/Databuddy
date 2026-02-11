import { websitesApi } from "@databuddy/auth";
import {
	and,
	annotations,
	desc,
	eq,
	isNull,
	member,
	or,
	type SQL,
} from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";
import { getCacheAuthContext } from "../utils/cache-keys";

const annotationsCache = createDrizzleCache({
	redis,
	namespace: "annotations",
});
const CACHE_TTL = 300; // 5 minutes

/**
 * Check if the current identity has update permission for a website (workspace membership check).
 * Uses headers for auth (session or API key).
 */
async function hasWebsiteUpdatePermission(
	context: Context,
	website: { organizationId: string | null }
): Promise<boolean> {
	if (!website.organizationId) {
		return false;
	}
	try {
		const { success } = await websitesApi.hasPermission({
			headers: context.headers,
			body: {
				organizationId: website.organizationId,
				permissions: { website: ["update"] },
			},
		});
		return success;
	} catch {
		return false;
	}
}

const chartContextSchema = z.object({
	dateRange: z.object({
		start_date: z.string(),
		end_date: z.string(),
		granularity: z.enum(["hourly", "daily", "weekly", "monthly"]),
	}),
	filters: z
		.array(
			z.object({
				field: z.string(),
				operator: z.enum(["eq", "ne", "gt", "lt", "contains"]),
				value: z.string(),
			})
		)
		.optional(),
	metrics: z.array(z.string()).optional(),
	tabId: z.string().optional(),
});

const annotationOutputSchema = z.object({
	annotationType: z.string(),
	chartContext: z.unknown(),
	chartType: z.string(),
	color: z.string(),
	createdAt: z.date(),
	createdBy: z.string(),
	deletedAt: z.date().nullable(),
	id: z.string(),
	isPublic: z.boolean(),
	tags: z.array(z.string()).nullable(),
	text: z.string(),
	updatedAt: z.date(),
	websiteId: z.string(),
	xEndValue: z.date().nullable(),
	xValue: z.date(),
	yValue: z.number().nullable(),
});

const successOutputSchema = z.object({ success: z.literal(true) });

export const annotationsRouter = {
	list: publicProcedure
		.route({
			description:
				"Returns annotations for a chart context. Requires website read permission.",
			method: "POST",
			path: "/annotations/list",
			summary: "List annotations",
			tags: ["Annotations"],
		})
		.input(
			z.object({
				websiteId: z.string(),
				chartType: z.enum(["metrics"]),
				chartContext: chartContextSchema,
			})
		)
		.output(z.array(annotationOutputSchema))
		.handler(async ({ context, input }) => {
			const authContext = await getCacheAuthContext(context, {
				websiteId: input.websiteId,
			});

			return annotationsCache.withCache({
				key: `annotations:list:${input.websiteId}:${input.chartType}:${authContext}`,
				ttl: CACHE_TTL,
				tables: ["annotations"],
				queryFn: async () => {
					const website = await authorizeWebsiteAccess(
						context,
						input.websiteId,
						"read"
					);

					// For public websites, filter annotations to only show:
					// 1. Public annotations (isPublic: true)
					// 2. Annotations created by the current user (if authenticated)
					// For non-public websites, show all annotations (user has access via authorizeWebsiteAccess)
					const baseConditions = [
						eq(annotations.websiteId, input.websiteId),
						eq(annotations.chartType, input.chartType),
						isNull(annotations.deletedAt),
					];

					let visibilityCondition: SQL<unknown> | undefined;
					if (website.isPublic) {
						if (context.user) {
							// Show public annotations OR user's own annotations
							visibilityCondition = or(
								eq(annotations.isPublic, true),
								eq(annotations.createdBy, context.user.id)
							);
						} else if (context.apiKey) {
							// API key has org access, show all
							visibilityCondition = undefined;
						} else {
							// Unauthenticated users on public websites only see public annotations
							visibilityCondition = eq(annotations.isPublic, true);
						}
					}

					const whereCondition = visibilityCondition
						? and(...baseConditions, visibilityCondition)
						: and(...baseConditions);

					return context.db
						.select()
						.from(annotations)
						.where(whereCondition)
						.orderBy(desc(annotations.createdAt));
				},
			});
		}),

	getById: publicProcedure
		.route({
			description:
				"Returns a single annotation by id. Requires website read permission.",
			method: "POST",
			path: "/annotations/getById",
			summary: "Get annotation",
			tags: ["Annotations"],
		})
		.input(z.object({ id: z.string() }))
		.output(annotationOutputSchema)
		.handler(async ({ context, input, errors }) => {
			const annotation = await context.db.query.annotations.findFirst({
				where: and(eq(annotations.id, input.id), isNull(annotations.deletedAt)),
				columns: { websiteId: true },
			});

			if (!annotation) {
				throw errors.NOT_FOUND({
					message: "Annotation not found",
					data: { resourceType: "annotation", resourceId: input.id },
				});
			}

			const authContext = await getCacheAuthContext(context, {
				websiteId: annotation.websiteId,
			});

			return annotationsCache.withCache({
				key: `annotations:byId:${input.id}:${authContext}`,
				ttl: CACHE_TTL,
				tables: ["annotations"],
				queryFn: async () => {
					const result = await context.db
						.select()
						.from(annotations)
						.where(
							and(eq(annotations.id, input.id), isNull(annotations.deletedAt))
						)
						.limit(1);

					if (result.length === 0) {
						throw errors.NOT_FOUND({
							message: "Annotation not found",
							data: { resourceType: "annotation", resourceId: input.id },
						});
					}

					const annotationResult = result[0];
					if (!annotationResult) {
						throw errors.NOT_FOUND({
							message: "Annotation not found",
							data: { resourceType: "annotation", resourceId: input.id },
						});
					}
					await authorizeWebsiteAccess(
						context,
						annotationResult.websiteId,
						"read"
					);

					return annotationResult;
				},
			});
		}),

	create: protectedProcedure
		.route({
			description:
				"Creates a new annotation. Requires website update permission.",
			method: "POST",
			path: "/annotations/create",
			summary: "Create annotation",
			tags: ["Annotations"],
		})
		.input(
			z.object({
				websiteId: z.string(),
				chartType: z.enum(["metrics"]),
				chartContext: chartContextSchema,
				annotationType: z.enum(["point", "line", "range"]),
				xValue: z.string(),
				xEndValue: z.string().optional(),
				yValue: z.number().optional(),
				text: z.string().min(1).max(500),
				tags: z.array(z.string()).optional(),
				color: z.string().optional(),
				isPublic: z.boolean().default(false),
			})
		)
		.output(annotationOutputSchema)
		.handler(async ({ context, input, errors }) => {
			const website = await authorizeWebsiteAccess(
				context,
				input.websiteId,
				"update"
			);

			if (website.isPublic && context.user) {
				const hasPermission = await hasWebsiteUpdatePermission(
					context,
					website
				);
				if (!hasPermission) {
					throw errors.FORBIDDEN({
						message:
							"You cannot create annotations on public websites unless you own them",
					});
				}
			}

			let createdBy: string;
			if (context.user) {
				createdBy = context.user.id;
			} else if (context.apiKey) {
				if (!website.organizationId) {
					throw new ORPCError("FORBIDDEN", {
						message: "Website must belong to a workspace",
					});
				}
				const orgId = context.apiKey.organizationId ?? website.organizationId;
				const [ownerRow] = await context.db
					.select({ userId: member.userId })
					.from(member)
					.where(
						and(eq(member.organizationId, orgId), eq(member.role, "owner"))
					)
					.limit(1);
				if (!ownerRow) {
					throw new ORPCError("FORBIDDEN", {
						message: "Could not resolve organization owner for API key",
					});
				}
				createdBy = ownerRow.userId;
			} else {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication is required",
				});
			}

			const annotationId = randomUUIDv7();
			const [newAnnotation] = await context.db
				.insert(annotations)
				.values({
					id: annotationId,
					websiteId: input.websiteId,
					chartType: input.chartType,
					chartContext: input.chartContext,
					annotationType: input.annotationType,
					xValue: new Date(input.xValue),
					xEndValue: input.xEndValue ? new Date(input.xEndValue) : null,
					yValue: input.yValue,
					text: input.text,
					tags: input.tags || [],
					color: input.color || "#3B82F6",
					isPublic: input.isPublic,
					createdBy,
				})
				.returning();

			await annotationsCache.invalidateByTables(["annotations"]);

			return newAnnotation;
		}),

	update: protectedProcedure
		.route({
			description:
				"Updates an annotation. Users can only update their own unless they own the website.",
			method: "POST",
			path: "/annotations/update",
			summary: "Update annotation",
			tags: ["Annotations"],
		})
		.input(
			z.object({
				id: z.string(),
				text: z.string().min(1).max(500).optional(),
				tags: z.array(z.string()).optional(),
				color: z.string().optional(),
				isPublic: z.boolean().optional(),
			})
		)
		.output(annotationOutputSchema)
		.handler(async ({ context, input, errors }) => {
			const existingAnnotation = await context.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (existingAnnotation.length === 0) {
				throw errors.NOT_FOUND({
					message: "Annotation not found",
					data: { resourceType: "annotation", resourceId: input.id },
				});
			}

			const annotation = existingAnnotation[0];

			// Users can only update their own annotations, unless they own the website.
			// API keys have org access so they are treated as having permission.
			const website = await authorizeWebsiteAccess(
				context,
				annotation.websiteId,
				"read"
			);

			const hasPermission = context.apiKey
				? true
				: context.user
					? await hasWebsiteUpdatePermission(context, website)
					: false;

			if (
				!hasPermission &&
				context.user &&
				annotation.createdBy !== context.user.id
			) {
				throw errors.FORBIDDEN({
					message: "You can only update your own annotations",
				});
			}

			const [updatedAnnotation] = await context.db
				.update(annotations)
				.set({
					...input,
					updatedAt: new Date(),
				})
				.where(eq(annotations.id, input.id))
				.returning();

			await annotationsCache.invalidateByTables(["annotations"]);

			return updatedAnnotation;
		}),

	delete: protectedProcedure
		.route({
			description:
				"Soft-deletes an annotation. Users can only delete their own unless they own the website.",
			method: "POST",
			path: "/annotations/delete",
			summary: "Delete annotation",
			tags: ["Annotations"],
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input, errors }) => {
			// First verify the annotation exists and get website ID
			const existingAnnotation = await context.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (existingAnnotation.length === 0) {
				throw errors.NOT_FOUND({
					message: "Annotation not found",
					data: { resourceType: "annotation", resourceId: input.id },
				});
			}

			const annotation = existingAnnotation[0];

			// Users can only delete their own annotations, unless they own the website.
			// API keys have org access so they are treated as having permission.
			const website = await authorizeWebsiteAccess(
				context,
				annotation.websiteId,
				"read"
			);

			const hasPermission = context.apiKey
				? true
				: context.user
					? await hasWebsiteUpdatePermission(context, website)
					: false;

			if (
				!hasPermission &&
				context.user &&
				annotation.createdBy !== context.user.id
			) {
				throw errors.FORBIDDEN({
					message: "You can only delete your own annotations",
				});
			}

			await context.db
				.update(annotations)
				.set({ deletedAt: new Date() })
				.where(eq(annotations.id, input.id));

			await annotationsCache.invalidateByTables(["annotations"]);

			return { success: true };
		}),
};
