import { desc, eq, ssoProvider } from "@databuddy/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { checkOrgPermission } from "../utils/auth";

const ssoOutputSchema = z.record(z.string(), z.unknown());

export const ssoRouter = {
	list: protectedProcedure
		.route({
			description: "Returns SSO providers for an organization.",
			method: "POST",
			path: "/sso/list",
			summary: "List SSO providers",
			tags: ["SSO"],
		})
		.input(z.object({ organizationId: z.string() }))
		.output(z.array(ssoOutputSchema))
		.handler(async ({ context, input }) => {
			await checkOrgPermission(
				context,
				input.organizationId,
				"organization",
				"read",
				"You do not have permission to access this organization"
			);

			const providers = await context.db
				.select()
				.from(ssoProvider)
				.where(eq(ssoProvider.organizationId, input.organizationId))
				.orderBy(desc(ssoProvider.id));

			return providers.map((p) => ({
				id: p.id,
				providerId: p.providerId,
				issuer: p.issuer,
				domain: p.domain,
				organizationId: p.organizationId,
				userId: p.userId,
				oidcConfig: p.oidcConfig,
				samlConfig: p.samlConfig,
			}));
		}),

	getById: protectedProcedure
		.route({
			description: "Returns an SSO provider by id.",
			method: "POST",
			path: "/sso/getById",
			summary: "Get SSO provider",
			tags: ["SSO"],
		})
		.input(z.object({ providerId: z.string() }))
		.output(ssoOutputSchema.nullable())
		.handler(async ({ context, input }) => {
			const provider = await context.db.query.ssoProvider.findFirst({
				where: eq(ssoProvider.providerId, input.providerId),
			});

			if (!provider) {
				return null;
			}

			if (!provider.organizationId) {
				throw new ORPCError("FORBIDDEN", {
					message: "SSO provider must belong to an organization",
				});
			}

			await checkOrgPermission(
				context,
				provider.organizationId,
				"organization",
				"read",
				"You do not have permission to access this SSO provider"
			);

			return {
				id: provider.id,
				providerId: provider.providerId,
				issuer: provider.issuer,
				domain: provider.domain,
				organizationId: provider.organizationId,
				userId: provider.userId,
				oidcConfig: provider.oidcConfig,
				samlConfig: provider.samlConfig,
			};
		}),

	delete: protectedProcedure
		.route({
			description: "Deletes an SSO provider. Requires org update permission.",
			method: "POST",
			path: "/sso/delete",
			summary: "Delete SSO provider",
			tags: ["SSO"],
		})
		.input(z.object({ providerId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const provider = await context.db.query.ssoProvider.findFirst({
				where: eq(ssoProvider.providerId, input.providerId),
			});

			if (!provider) {
				throw new ORPCError("NOT_FOUND", {
					message: "SSO provider not found",
				});
			}

			if (!provider.organizationId) {
				throw new ORPCError("FORBIDDEN", {
					message: "SSO provider must belong to an organization",
				});
			}

			await checkOrgPermission(
				context,
				provider.organizationId,
				"organization",
				"update",
				"You do not have permission to delete this SSO provider"
			);

			await context.db
				.delete(ssoProvider)
				.where(eq(ssoProvider.providerId, input.providerId));

			return { success: true };
		}),
};
