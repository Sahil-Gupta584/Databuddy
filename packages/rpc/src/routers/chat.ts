import { streamToEventIterator } from "@orpc/server";
import { convertToModelMessages, type UIMessage } from "ai";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { handleMessage, type Mode } from "../agent";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const modeMap: Record<string, Mode> = {
	chat: "chat",
	agent: "agent",
	"agent-max": "agent_max",
};

export const chatRouter = {
	stream: protectedProcedure
		.route({
			description: "Streams AI chat/agent response for a website. Requires read permission.",
			method: "POST",
			path: "/chat/stream",
			summary: "Stream chat",
			tags: ["Chat"],
		})
		.input(
			z.object({
				conversationId: z.string().optional(),
				messages: z.array(
					z.object({
						role: z.enum(["user", "assistant"]),
						content: z.string(),
					})
				),
				websiteId: z.string(),
				model: z.enum(["chat", "agent", "agent-max"]).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const website = await authorizeWebsiteAccess(
				context,
				input.websiteId,
				"read"
			);

			const uiMessages: UIMessage[] = input.messages.map((msg) => ({
				id: randomUUIDv7(),
				role: msg.role,
				parts: [{ type: "text" as const, text: msg.content }],
			}));

			const modelMessages = convertToModelMessages(uiMessages);
			const mode = input.model ? (modeMap[input.model] ?? "chat") : "chat";
			const stream = handleMessage(
				modelMessages,
				mode,
				input.websiteId,
				website.domain || ""
			);
			return streamToEventIterator(stream);
		}),
};
