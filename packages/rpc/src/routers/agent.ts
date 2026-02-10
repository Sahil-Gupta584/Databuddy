import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

export const agentRouter = {
	addFeedback: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				messageId: z.string(),
				websiteId: z.string(),
				type: z.enum(["positive", "negative"]),
				comment: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			// TODO: Store feedback in database or cache

			return {
				success: true,
			};
		}),

	deleteFeedback: protectedProcedure
		.input(
			z.object({
				chatId: z.string(),
				messageId: z.string(),
				websiteId: z.string(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			// TODO: Delete feedback from database or cache

			return {
				success: true,
			};
		}),
};
