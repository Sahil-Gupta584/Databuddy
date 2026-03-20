import { ORPCError } from "@orpc/server";
import { z } from "zod";

const resourceSchema = z.object({
	resourceType: z.string(),
	resourceId: z.string().optional(),
});

const limitSchema = z.object({
	limit: z.number(),
	current: z.number(),
	nextPlan: z.string().optional(),
});

const featureSchema = z.object({
	feature: z.string(),
	requiredPlan: z.string().optional(),
});

const retrySchema = z.object({
	retryAfter: z.number().int().min(1),
});

export const baseErrors = {
	UNAUTHORIZED: {
		message: "Authentication is required for this action",
	},
	FORBIDDEN: {
		message: "You do not have permission to perform this action",
	},
	NOT_FOUND: {
		message: "The requested resource was not found",
		data: resourceSchema.optional(),
	},
	CONFLICT: {
		message: "A resource with this identifier already exists",
		data: resourceSchema.optional(),
	},
	BAD_REQUEST: {
		message: "Invalid request parameters",
	},
	RATE_LIMITED: {
		message: "Too many requests, please try again later",
		data: retrySchema,
	},
	PLAN_LIMIT_EXCEEDED: {
		message: "You have reached the limit for your current plan",
		data: limitSchema,
	},
	FEATURE_UNAVAILABLE: {
		message: "This feature is not available on your current plan",
		data: featureSchema,
	},
	INTERNAL_SERVER_ERROR: {
		message: "An unexpected error occurred",
	},
} as const;

export type BaseErrors = typeof baseErrors;

export const rpcError = {
	unauthorized: (message?: string) =>
		new ORPCError("UNAUTHORIZED", { message }),
	forbidden: (message?: string) => new ORPCError("FORBIDDEN", { message }),
	notFound: (resourceType: string, resourceId?: string) =>
		new ORPCError("NOT_FOUND", {
			message: `${resourceType} not found`,
			data: { resourceType, resourceId },
		}),
	badRequest: (message?: string) => new ORPCError("BAD_REQUEST", { message }),
	featureUnavailable: (feature: string, requiredPlan?: string) =>
		new ORPCError("FEATURE_UNAVAILABLE", {
			message: "This feature is not available on your current plan",
			data: { feature, requiredPlan },
		}),
	conflict: (message?: string) => new ORPCError("CONFLICT", { message }),
	rateLimited: (retryAfter = 60) =>
		new ORPCError("RATE_LIMITED", {
			message: "Too many requests, please try again later",
			data: { retryAfter },
		}),
	internal: (message?: string) =>
		new ORPCError("INTERNAL_SERVER_ERROR", { message }),
};
