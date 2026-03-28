import { generateText, tool } from "ai";
import { z } from "zod";
import { captureError } from "../../lib/tracing";
import { executeQuery } from "../../query";
import type { AppContext } from "../config/context";
import { models } from "../config/models";
import { createToolLogger } from "./utils/logger";

const logger = createToolLogger("X Search");

async function fetchTcoReferrerData(
	websiteId: string,
	domain: string,
	timezone: string
): Promise<{ visitors: number; pageviews: number; topPages: string[] }> {
	try {
		const data = (await executeQuery(
			{
				projectId: websiteId,
				type: "top_referrers",
				from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
					.toISOString()
					.split("T")
					.at(0) as string,
				to: new Date().toISOString().split("T").at(0) as string,
				timezone,
			},
			domain,
			timezone
		)) as Array<{
			referrer: string;
			visitors: number;
			pageviews: number;
		}>;

		const tcoEntries = data.filter(
			(r) =>
				r.referrer === "https://twitter.com" ||
				r.referrer?.includes("t.co") ||
				r.referrer?.includes("twitter.com") ||
				r.referrer?.includes("x.com")
		);

		const totalVisitors = tcoEntries.reduce(
			(sum, e) => sum + (e.visitors ?? 0),
			0
		);
		const totalPageviews = tcoEntries.reduce(
			(sum, e) => sum + (e.pageviews ?? 0),
			0
		);

		let topPages: string[] = [];
		try {
			const pageData = (await executeQuery(
				{
					projectId: websiteId,
					type: "top_pages",
					from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
						.toISOString()
						.split("T")
						.at(0) as string,
					to: new Date().toISOString().split("T").at(0) as string,
					timezone,
					filters: [
						{
							field: "referrer",
							op: "contains",
							value: "t.co",
						},
					],
				},
				domain,
				timezone
			)) as Array<{ page: string }>;
			topPages = pageData.slice(0, 5).map((p) => p.page);
		} catch {
			logger.warn("Could not fetch t.co landing pages");
		}

		return { visitors: totalVisitors, pageviews: totalPageviews, topPages };
	} catch (error) {
		logger.warn("Could not fetch t.co referrer data", {
			error: error instanceof Error ? error.message : "Unknown",
		});
		return { visitors: 0, pageviews: 0, topPages: [] };
	}
}

export const xSearchTool = tool({
	description:
		"Search X (Twitter) for posts mentioning a domain, brand, topic, or user. Uses Grok with live X search to find recent public posts and engagement signals. Use this when the user asks about their social media presence, wants to find tweets that drove traffic, or needs to correlate X/Twitter activity with their analytics data. Do NOT use this for general web searches — use web_search instead.",
	inputSchema: z.object({
		query: z
			.string()
			.describe(
				"What to search for on X. Be specific: a domain name, brand, hashtag, or @handle. Good: 'databuddy.cc analytics'. Bad: 'analytics tools'."
			),
		context: z
			.string()
			.optional()
			.describe(
				"Why you're searching — e.g. 'user saw a traffic spike from t.co and wants to find the tweet'"
			),
		includeReferrerData: z
			.boolean()
			.optional()
			.default(true)
			.describe(
				"Whether to pull t.co/x.com referrer data from the user's analytics to correlate with X posts"
			),
	}),
	execute: async ({ query, context, includeReferrerData }, options) => {
		const searchStart = Date.now();

		try {
			const appContext =
				"experimental_context" in (options as object)
					? (options as { experimental_context?: AppContext })
							.experimental_context
					: undefined;

			let referrerContext = "";
			if (includeReferrerData && appContext?.websiteId) {
				const referrerData = await fetchTcoReferrerData(
					appContext.websiteId,
					appContext.websiteDomain,
					appContext.timezone
				);

				if (referrerData.visitors > 0) {
					referrerContext = `\n\nANALYTICS CONTEXT (last 30 days from ${appContext.websiteDomain}):
- ${referrerData.visitors} visitors from X/Twitter (t.co referrers)
- ${referrerData.pageviews} pageviews from X/Twitter
${referrerData.topPages.length > 0 ? `- Top landing pages from X traffic: ${referrerData.topPages.join(", ")}` : ""}
Use this data to correlate specific tweets with traffic patterns.`;
				}
			}

			const systemPrompt = `You are an X/Twitter research analyst for the website ${appContext?.websiteDomain ?? "unknown"}. Your job is to find relevant public posts on X and provide actionable insights.

For each relevant post you find, include:
- The author's @handle and display name
- The post content (full text)
- Engagement metrics if available (likes, reposts, replies, views/impressions)
- When it was posted (approximate date/time)
- A direct link to the post if possible

After listing the posts, provide a brief analysis:
- Which posts likely drove the most traffic
- Overall sentiment (positive/negative/neutral)
- Any notable accounts or influencers mentioning the brand
- Actionable recommendations based on what you found
${context ? `\nSearch context: ${context}` : ""}${referrerContext}`;

			const telemetryMetadata: Record<string, string> = {
				source: "agent_tool",
				tool: "x_search",
			};
			if (appContext?.userId) {
				telemetryMetadata.userId = appContext.userId;
			}
			if (appContext?.websiteId) {
				telemetryMetadata.websiteId = appContext.websiteId;
			}
			if (appContext?.websiteDomain) {
				telemetryMetadata.websiteDomain = appContext.websiteDomain;
			}
			if (appContext?.chatId) {
				telemetryMetadata["tcc.sessionId"] = appContext.chatId;
				telemetryMetadata["tcc.conversational"] = "true";
			}

			const result = await generateText({
				model: models.grok,
				system: systemPrompt,
				prompt: `Search X/Twitter for: ${query}`,
				experimental_telemetry: {
					isEnabled: true,
					functionId: "databuddy.agent.x_search",
					metadata: telemetryMetadata,
				},
			});

			const executionTime = Date.now() - searchStart;
			const text = result.text?.trim() ?? "";

			if (text.length === 0) {
				logger.warn("X search returned empty text", {
					query,
					executionTime: `${executionTime}ms`,
				});
				captureError(new Error("x_search_empty_response"), {
					query,
					tool: "x_search",
				});
				return {
					answer:
						"No X/Twitter results were returned for this query. The live X search may have found no public posts, or the search service returned an empty response. Try a simpler query (brand name or @handle) or ask again in a moment.",
					query,
					executionTime,
					source: "grok_x_search",
					empty: true,
				};
			}

			logger.info("X search completed", {
				query,
				executionTime: `${executionTime}ms`,
				responseLength: text.length,
			});

			return {
				answer: text,
				query,
				executionTime,
				source: "grok_x_search",
			};
		} catch (error) {
			const executionTime = Date.now() - searchStart;

			captureError(error, {
				query,
				tool: "x_search",
				executionTime,
			});

			logger.error("X search failed", {
				query,
				executionTime: `${executionTime}ms`,
				error: error instanceof Error ? error.message : "Unknown error",
			});

			throw error instanceof Error
				? error
				: new Error("X search failed. Please try again.");
		}
	},
});
