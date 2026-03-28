"use client";

import { ClockCountdownIcon } from "@phosphor-icons/react/dist/ssr/ClockCountdown";
import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/ssr/PaperPlaneRight";
import { StopIcon } from "@phosphor-icons/react/dist/ssr/Stop";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";
import type { UIMessage } from "ai";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import {
	Queue,
	QueueItem,
	QueueItemAction,
	QueueItemActions,
	QueueItemContent,
	QueueItemIndicator,
	QueueList,
	QueueSection,
	QueueSectionContent,
	QueueSectionLabel,
	QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChat, usePendingQueue } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import { agentInputAtom } from "./agent-atoms";
import { useAgentChatId, useSetAgentChatId } from "./agent-chat-context";
import { AgentCommandMenu } from "./agent-command-menu";
import { useAgentCommands } from "./hooks/use-agent-commands";
import { useChatList } from "./hooks/use-chat-db";
import { useEnterSubmit } from "./hooks/use-enter-submit";

function getChatTitle(messages: UIMessage[], currentInput: string): string {
	const firstUserMsg = messages.find((m) => m.role === "user");
	if (firstUserMsg) {
		const text = firstUserMsg.parts
			.filter(
				(p): p is Extract<UIMessage["parts"][number], { type: "text" }> =>
					p.type === "text"
			)
			.map((p) => p.text)
			.join(" ")
			.trim();
		return text.slice(0, 100) || "New conversation";
	}
	return currentInput.slice(0, 100) || "New conversation";
}

export function AgentInput() {
	const { sendMessage, stop, status, messages } = useChat();
	const { messages: pendingMessages, removeAction } = usePendingQueue();
	const isLoading = status === "streaming" || status === "submitted";
	const [input, setInput] = useAtom(agentInputAtom);
	const agentCommands = useAgentCommands();
	const currentChatId = useAgentChatId();
	const setChatId = useSetAgentChatId();
	const { formRef, onKeyDown } = useEnterSubmit();
	const params = useParams();
	const websiteId = params.id as string;
	const { saveChat } = useChatList(websiteId);

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!input.trim()) {
			return;
		}
		if (currentChatId) {
			setChatId(currentChatId);
		}

		const text = input.trim();
		const title = getChatTitle(messages, text);
		saveChat({ id: currentChatId, websiteId, title });

		sendMessage({ text });
		setInput("");
	};

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		agentCommands.handleInputChange(
			e.target.value,
			e.target.selectionStart ?? 0
		);
	};

	const handleStop = (e: React.MouseEvent) => {
		e.preventDefault();
		stop();
	};

	return (
		<div className="shrink-0 border-t bg-sidebar/30 backdrop-blur-sm">
			<div className="mx-auto max-w-4xl p-4">
				{pendingMessages.length > 0 ? (
					<PendingQueue
						messages={pendingMessages}
						onClear={stop}
						onRemove={removeAction}
					/>
				) : null}

				<div className="relative">
					<AgentCommandMenu {...agentCommands} />

					<form className="flex gap-2" onSubmit={handleSubmit} ref={formRef}>
						<div className="relative flex-1">
							<Textarea
								className={cn(
									"px-4 text-base",
									"focus:ring-2 focus:ring-primary/20"
								)}
								maxRows={4}
								minRows={1}
								onChange={handleChange}
								onKeyDown={onKeyDown}
								placeholder="Ask the agent to analyze your data..."
								ref={agentCommands.inputRef}
								value={input}
							/>
						</div>

						<div className="flex shrink-0 gap-1.5">
							{isLoading ? (
								<Button
									aria-label="Stop generation"
									className="size-12"
									onClick={handleStop}
									size="icon"
									type="button"
									variant="destructive"
								>
									<StopIcon className="size-5" weight="fill" />
								</Button>
							) : null}
							<Button
								aria-label={isLoading ? "Queue message" : "Send message"}
								className="size-12"
								disabled={!input.trim()}
								size="icon"
								type="submit"
							>
								<PaperPlaneRightIcon className="size-5" weight="duotone" />
							</Button>
						</div>
					</form>
				</div>

				<p className="mt-2 text-foreground/40 text-xs">
					Press{" "}
					<kbd className="rounded border border-border/50 bg-accent px-1 font-mono text-[10px] text-foreground/70">
						Enter
					</kbd>{" "}
					to send ·{" "}
					<kbd className="rounded border border-border/50 bg-accent px-1 font-mono text-[10px] text-foreground/70">
						/
					</kbd>{" "}
					for commands
				</p>
			</div>
		</div>
	);
}

function PendingQueue({
	messages,
	onRemove,
	onClear,
}: {
	messages: string[];
	onRemove: (index: number) => void;
	onClear: () => void;
}) {
	return (
		<Queue className="mb-3 rounded shadow-none">
			<QueueSection>
				<QueueSectionTrigger className="rounded">
					<QueueSectionLabel
						count={messages.length}
						icon={
							<ClockCountdownIcon
								className="size-3.5"
								weight="duotone"
							/>
						}
						label="queued"
					/>
					{messages.length > 1 ? (
						<button
							className="text-muted-foreground/60 text-xs hover:text-foreground"
							onClick={(e) => {
								e.stopPropagation();
								onClear();
							}}
							type="button"
						>
							Clear all
						</button>
					) : null}
				</QueueSectionTrigger>
				<QueueSectionContent>
					<QueueList>
						{messages.map((text, index) => (
							<QueueItem
								className="rounded"
								key={`${index}-${text.slice(0, 20)}`}
							>
								<div className="flex items-center gap-2">
									<QueueItemIndicator />
									<QueueItemContent className="flex-1">
										{text}
									</QueueItemContent>
									<QueueItemActions>
										<QueueItemAction
											aria-label="Remove queued message"
											onClick={() => onRemove(index)}
										>
											<XIcon className="size-3.5" />
										</QueueItemAction>
									</QueueItemActions>
								</div>
							</QueueItem>
						))}
					</QueueList>
				</QueueSectionContent>
			</QueueSection>
		</Queue>
	);
}
