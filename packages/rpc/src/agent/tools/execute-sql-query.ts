import {
	AGENT_SQL_VALIDATION_ERROR,
	chQuery,
	requiresTenantFilter,
	validateAgentSQL,
} from "@databuddy/db";
import { tool } from "ai";
import { z } from "zod";

export interface QueryResult {
	data: unknown[];
	executionTime: number;
	rowCount: number;
}

export const executeSqlQueryTool = tool({
	description:
		"Executes a validated, read-only ClickHouse SQL query against analytics data. Only SELECT and WITH statements are allowed for security. IMPORTANT: Use parameterized queries with {paramName:Type} syntax. The websiteId is automatically included as a parameter.",
	inputSchema: z.object({
		websiteId: z
			.string()
			.describe("The website ID to query - automatically added to params"),
		sql: z
			.string()
			.describe(
				"The SQL query to execute. Must be a SELECT or WITH statement. Must include WHERE client_id = {websiteId:String}."
			),
		params: z
			.record(z.string(), z.unknown())
			.optional()
			.describe(
				"Additional query parameters. websiteId is automatically included."
			),
	}),
	execute: async ({ sql, websiteId, params }) => {
		const validation = validateAgentSQL(sql);
		if (!validation.valid) {
			throw new Error(validation.reason ?? AGENT_SQL_VALIDATION_ERROR);
		}

		if (!requiresTenantFilter(sql)) {
			throw new Error(
				"Query must include tenant isolation: WHERE client_id = {websiteId:String}"
			);
		}

		try {
			const queryStart = Date.now();
			const result = await chQuery(sql, {
				websiteId,
				...(params ?? {}),
			});
			const queryTime = Date.now() - queryStart;

			return {
				data: result,
				executionTime: queryTime,
				rowCount: result.length,
			} satisfies QueryResult;
		} catch (error) {
			throw new Error(
				error instanceof Error ? error.message : "Unknown query error"
			);
		}
	},
});
