import { Suspense } from "react";
import { ChatProvider } from "@/contexts/chat-context";
import { AgentPageClient } from "../_components/agent-page-client";

interface Props {
	params: Promise<{ id: string; chatId: string }>;
}

export default async function AgentPage(props: Props) {
	const { id, chatId } = await props.params;

	return (
		<ChatProvider chatId={chatId} websiteId={id}>
			<Suspense fallback={<AgentPageSkeleton />}>
				<AgentPageClient chatId={chatId} websiteId={id} />
			</Suspense>
		</ChatProvider>
	);
}

function AgentPageSkeleton() {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="animate-pulse text-muted-foreground text-sm">
				Loading agent...
			</div>
		</div>
	);
}
