import {
	and,
	desc,
	eq,
	flagsToTargetGroups,
	isNull,
	member,
	targetGroups,
} from "@databuddy/db";
import {
	createDrizzleCache,
	invalidateCacheablePattern,
	invalidateCacheableWithArgs,
	redis,
} from "@databuddy/redis";
import { userRuleSchema } from "@databuddy/shared/flags";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../orpc";
import { requireFeature, requireUsageWithinLimit } from "../types/billing";
import { authorizeWebsiteAccess, isFullyAuthorized } from "../utils/auth";

const targetGroupsCache = createDrizzleCache({
	redis,
	namespace: "targetGroups",
});
const flagsCache = createDrizzleCache({
	redis,
	namespace: "flags",
});
const CACHE_DURATION = 60;

const listSchema = z.object({
	websiteId: z.string(),
});

const getByIdSchema = z.object({
	id: z.string(),
	websiteId: z.string(),
});

const createSchema = z.object({
	websiteId: z.string(),
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	rules: z.array(userRuleSchema),
});

const updateSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().max(500).optional(),
	color: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/)
		.optional(),
	rules: z.array(userRuleSchema).optional(),
});

const deleteSchema = z.object({
	id: z.string(),
});

const targetGroupOutputSchema = z.record(z.string(), z.unknown());

const successOutputSchema = z.object({ success: z.literal(true) });

interface TargetGroupWithRules {
	rules?: unknown;
	[key: string]: unknown;
}

/**
 * Sanitizes target group data for unauthorized/demo users by removing sensitive targeting information.
 * Only keeps aggregate numbers like rule count.
 */
function sanitizeGroupForDemo<T extends TargetGroupWithRules>(group: T): T {
	return {
		...group,
		rules:
			Array.isArray(group.rules) && group.rules.length > 0 ? [] : group.rules,
	};
}

export const targetGroupsRouter = {
	list: publicProcedure
		.route({
			description:
				"Returns all target groups for a website. Requires website read permission.",
			method: "POST",
			path: "/target-groups/list",
			summary: "List target groups",
			tags: ["Target Groups"],
		})
		.input(listSchema)
		.output(z.array(targetGroupOutputSchema))
		.handler(({ context, input }) => {
			const cacheKey = `list:website:${input.websiteId}`;

			return targetGroupsCache.withCache({
				key: cacheKey,
				ttl: CACHE_DURATION,
				tables: ["target_groups"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");

					const groupsList = await context.db
						.select()
						.from(targetGroups)
						.where(
							and(
								eq(targetGroups.websiteId, input.websiteId),
								isNull(targetGroups.deletedAt)
							)
						)
						.orderBy(desc(targetGroups.createdAt));

					// Check if user is fully authorized
					const isAuthorized = await isFullyAuthorized(
						context,
						input.websiteId
					);

					// Sanitize data for unauthorized/demo users
					if (!isAuthorized) {
						return groupsList.map((group) => sanitizeGroupForDemo(group));
					}

					return groupsList;
				},
			});
		}),

	getById: publicProcedure
		.route({
			description:
				"Returns a single target group by id. Requires website read permission.",
			method: "POST",
			path: "/target-groups/getById",
			summary: "Get target group",
			tags: ["Target Groups"],
		})
		.input(getByIdSchema)
		.output(targetGroupOutputSchema)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			const cacheKey = `byId:${input.id}:website:${input.websiteId}`;

			return targetGroupsCache.withCache({
				key: cacheKey,
				ttl: CACHE_DURATION,
				tables: ["target_groups"],
				queryFn: async () => {
					const result = await context.db
						.select()
						.from(targetGroups)
						.where(
							and(
								eq(targetGroups.id, input.id),
								eq(targetGroups.websiteId, input.websiteId),
								isNull(targetGroups.deletedAt)
							)
						)
						.limit(1);

					if (result.length === 0) {
						throw new ORPCError("NOT_FOUND", {
							message: "Target group not found",
						});
					}

					// Check if user is fully authorized
					const isAuthorized = await isFullyAuthorized(
						context,
						input.websiteId
					);

					// Sanitize data for unauthorized/demo users
					if (!isAuthorized) {
						return sanitizeGroupForDemo(result[0]);
					}

					return result[0];
				},
			});
		}),

	create: protectedProcedure
		.route({
			description:
				"Creates a new target group. Requires target groups feature and website update permission.",
			method: "POST",
			path: "/target-groups/create",
			summary: "Create target group",
			tags: ["Target Groups"],
		})
		.input(createSchema)
		.output(targetGroupOutputSchema)
		.handler(async ({ context, input }) => {
			const website = await authorizeWebsiteAccess(
				context,
				input.websiteId,
				"update"
			);

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

			// Check if target groups feature is available on the plan
			requireFeature(context.billing?.planId, GATED_FEATURES.TARGET_GROUPS);

			// Check current target group count against plan limit
			const existingGroups = await context.db
				.select({ id: targetGroups.id })
				.from(targetGroups)
				.where(
					and(
						eq(targetGroups.websiteId, input.websiteId),
						isNull(targetGroups.deletedAt)
					)
				);

			// Enforce plan limit before creating new target group
			requireUsageWithinLimit(
				context.billing?.planId,
				GATED_FEATURES.TARGET_GROUPS,
				existingGroups.length
			);

			const [newGroup] = await context.db
				.insert(targetGroups)
				.values({
					id: randomUUIDv7(),
					name: input.name,
					description: input.description ?? null,
					color: input.color,
					rules: input.rules,
					websiteId: input.websiteId,
					createdBy,
				})
				.returning();

			await targetGroupsCache.invalidateByTables(["target_groups"]);

			return newGroup;
		}),

	update: protectedProcedure
		.route({
			description:
				"Updates an existing target group. Requires website update permission.",
			method: "POST",
			path: "/target-groups/update",
			summary: "Update target group",
			tags: ["Target Groups"],
		})
		.input(updateSchema)
		.output(targetGroupOutputSchema)
		.handler(async ({ context, input }) => {
			const existingGroup = await context.db
				.select()
				.from(targetGroups)
				.where(
					and(eq(targetGroups.id, input.id), isNull(targetGroups.deletedAt))
				)
				.limit(1);

			if (existingGroup.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target group not found",
				});
			}

			const group = existingGroup[0];

			await authorizeWebsiteAccess(context, group.websiteId, "update");

			const { id, ...updates } = input;
			const [updatedGroup] = await context.db
				.update(targetGroups)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(and(eq(targetGroups.id, id), isNull(targetGroups.deletedAt)))
				.returning();

			await targetGroupsCache.invalidateByTables(["target_groups"]);

			await invalidateCacheablePattern(`cacheable:flag:*${group.websiteId}*`);
			await invalidateCacheableWithArgs("flags-client", [group.websiteId]);

			return updatedGroup;
		}),

	delete: protectedProcedure
		.route({
			description:
				"Soft-deletes a target group. Requires website delete permission.",
			method: "POST",
			path: "/target-groups/delete",
			summary: "Delete target group",
			tags: ["Target Groups"],
		})
		.input(deleteSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const existingGroup = await context.db
				.select()
				.from(targetGroups)
				.where(
					and(eq(targetGroups.id, input.id), isNull(targetGroups.deletedAt))
				)
				.limit(1);

			if (existingGroup.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target group not found",
				});
			}

			const group = existingGroup[0];

			await authorizeWebsiteAccess(context, group.websiteId, "delete");

			// Remove all flag associations before soft-deleting the group
			await context.db
				.delete(flagsToTargetGroups)
				.where(eq(flagsToTargetGroups.targetGroupId, input.id));

			await context.db
				.update(targetGroups)
				.set({
					deletedAt: new Date(),
				})
				.where(
					and(eq(targetGroups.id, input.id), isNull(targetGroups.deletedAt))
				);

			await targetGroupsCache.invalidateByTables(["target_groups"]);
			await flagsCache.invalidateByTables(["flags", "flags_to_target_groups"]);
			await invalidateCacheableWithArgs("flags-client", [group.websiteId]);

			return { success: true };
		}),
};
