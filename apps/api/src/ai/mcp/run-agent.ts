import { ToolLoopAgent } from "ai";
import { createMcpAgentConfig } from "../agents/mcp";
import { models } from "../config/models";

export interface RunMcpAgentOptions {
	question: string;
	requestHeaders: Headers;
	apiKey: Awaited<
		ReturnType<typeof import("../../lib/api-key").getApiKeyFromHeader>
	>;
	userId: string | null;
	priorMessages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function runMcpAgent(
	options: RunMcpAgentOptions
): Promise<string> {
	const config = createMcpAgentConfig(models.analyticsMcp, {
		requestHeaders: options.requestHeaders,
		apiKey: options.apiKey,
		userId: options.userId,
	});

	const agent = new ToolLoopAgent({
		model: config.model,
		instructions: config.system,
		tools: config.tools,
		stopWhen: config.stopWhen,
		temperature: config.temperature,
		experimental_context: config.experimental_context,
	});

	const messages =
		options.priorMessages && options.priorMessages.length > 0
			? [
					...options.priorMessages,
					{ role: "user" as const, content: options.question },
				]
			: [{ role: "user" as const, content: options.question }];

	const result = await agent.generate({
		messages,
	});

	return result.text ?? "No response generated.";
}
