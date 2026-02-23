import { auth } from "@databuddy/auth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { Elysia } from "elysia";
import { createMcpTools } from "../ai/mcp/tools";
import {
	getApiKeyFromHeader,
	hasKeyScope,
	isApiKeyPresent,
} from "../lib/api-key";

export const mcp = new Elysia({ prefix: "/v1/mcp" })
	.derive(async ({ request }) => {
		const hasApiKey = isApiKeyPresent(request.headers);
		const [apiKey, session] = await Promise.all([
			hasApiKey ? getApiKeyFromHeader(request.headers) : null,
			auth.api.getSession({ headers: request.headers }),
		]);

		if (apiKey && !hasKeyScope(apiKey, "read:data")) {
			return {
				user: null,
				apiKey: null,
				isAuthenticated: false,
			};
		}

		const user = session?.user ?? null;
		return {
			user,
			apiKey,
			isAuthenticated: Boolean(user ?? apiKey),
		};
	})
	.onBeforeHandle(async ({ request, isAuthenticated, set }) => {
		if (!isAuthenticated) {
			set.status = 401;
			let id: string | number | null = null;
			try {
				const body = (await request.clone().json()) as { id?: string | number };
				if (typeof body?.id === "string" || typeof body?.id === "number") {
					id = body.id;
				}
			} catch {
				// ignore parse errors
			}
			return Response.json(
				{
					jsonrpc: "2.0",
					error: {
						code: -32_001,
						message:
							"Authentication required. Use x-api-key or Authorization: Bearer with a key that has read:data scope.",
					},
					id,
				},
				{
					status: 401,
					headers: {
						"WWW-Authenticate":
							'Bearer realm="databuddy", error="invalid_token", error_description="API key required (x-api-key or Authorization: Bearer)"',
					},
				}
			);
		}
	})
	.all("/", async ({ request, user, apiKey }) => {
		const ctx = {
			requestHeaders: request.headers,
			userId: user?.id ?? null,
			apiKey,
		};
		const tools = createMcpTools(ctx);
		const mcpServer = new McpServer(
			{ name: "databuddy", version: "1.0.0" },
			{ capabilities: { tools: {} } }
		);

		const toolIds = [
			"ask",
			"list_websites",
			"get_data",
			"get_schema",
			"capabilities",
		] as const;
		for (const id of toolIds) {
			const t = tools[id];
			mcpServer.registerTool(
				id,
				{
					description: t.description,
					inputSchema: t.inputSchema as unknown as AnySchema,
				},
				t.handler
			);
		}

		const acceptHeader = request.headers.get("accept") ?? "";
		const hasBoth =
			acceptHeader.includes("application/json") &&
			acceptHeader.includes("text/event-stream");
		const mcpRequest = hasBoth
			? request
			: new Request(request.url, {
					method: request.method,
					headers: new Headers([
						...Array.from(request.headers.entries()),
						["Accept", "application/json, text/event-stream"],
					]),
					body: request.body,
					duplex: "half",
				});

		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: false,
		});
		await mcpServer.connect(transport);
		const response = await transport.handleRequest(mcpRequest);
		await mcpServer.close();
		return response;
	});
