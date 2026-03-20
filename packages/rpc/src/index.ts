/** biome-ignore-all lint/performance/noBarrelFile: we need to export these functions */
export {
	createAbortSignalInterceptor,
	createORPCInstrumentation,
	enrichSpanWithContext,
	recordError,
	recordORPCError,
	setProcedureAttributes,
	setupUncaughtErrorHandlers,
} from "./lib/otel";
export { type Context, createRPCContext, sessionProcedure } from "./orpc";
export { rpcError } from "./errors";
export {
	type PermissionFor,
	type PlanId,
	type ResourceType,
	type Website,
	type WithWorkspaceOptions,
	type Workspace,
	isFullyAuthorized,
	websiteInputSchema,
	withWebsiteRead,
	withWebsiteWrite,
	withWorkspace,
	workspaceInputSchema,
} from "./procedures/with-workspace";
export { type AppRouter, appRouter } from "./root";
export {
	type ExportFormat,
	type ExportMetadata,
	type GenerateExportResult,
	generateExport,
	validateExportDateRange,
} from "./services/export-service";
export {
	type BillingContext,
	canAccessAiCapability,
	canAccessFeature,
	getFeatureLimit,
	getUsageRemaining,
	getUserCapabilities,
	hasPlan,
	isFreePlan,
	isUsageWithinLimit,
	requireAiCapability,
	requireFeature,
	requireFeatureWithLimit,
	requireUsageWithinLimit,
} from "./types/billing";
export {
	type BillingOwner,
	getBillingCustomerId,
	getBillingOwner,
} from "./utils/billing";
