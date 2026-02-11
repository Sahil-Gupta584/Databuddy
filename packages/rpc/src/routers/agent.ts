import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const feedbackOutputSchema = z.object({ success: z.literal(true) });

export const agentRouter = {
	addFeedback: protectedProcedure
		.route({
			description: "Adds feedback to a chat message. Requires read permission.",
			method: "POST",
			path: "/agent/addFeedback",
			summary: "Add feedback",
			tags: ["Agent"],
		})
		.input(
			z.object({
				chatId: z.string(),
				messageId: z.string(),
				websiteId: z.string(),
				type: z.enum(["positive", "negative"]),
				comment: z.string().optional(),
			})
		)
		.output(feedbackOutputSchema)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");
			return { success: true };
		}),

	deleteFeedback: protectedProcedure
		.route({
			description: "Deletes feedback from a chat message. Requires read permission.",
			method: "POST",
			path: "/agent/deleteFeedback",
			summary: "Delete feedback",
			tags: ["Agent"],
		})
		.input(
			z.object({
				chatId: z.string(),
				messageId: z.string(),
				websiteId: z.string(),
			})
		)
		.output(feedbackOutputSchema)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");
			return { success: true };
		}),
};
