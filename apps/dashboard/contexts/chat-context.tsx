"use client";

import { useChat as useAiSdkChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { createContext, useContext, useEffect, useMemo } from "react";
import { useAgentChatTransport } from "@/app/(main)/websites/[id]/agent/_components/hooks/use-agent-chat";
import {
	getMessagesFromLocal,
	saveMessagesToLocal,
} from "@/app/(main)/websites/[id]/agent/_components/hooks/use-chat-db";

type ChatContextType = ReturnType<typeof useAiSdkChat<UIMessage>>;

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({
	chatId,
	websiteId,
	children,
}: {
	chatId: string;
	websiteId: string;
	children: React.ReactNode;
}) {
	const initialMessages = useMemo(
		() =>
			typeof window === "undefined"
				? []
				: getMessagesFromLocal(websiteId, chatId),
		[websiteId, chatId]
	);

	const transport = useAgentChatTransport(chatId);
	const chat = useAiSdkChat<UIMessage>({
		id: chatId,
		transport,
		messages: initialMessages,
	});

	useEffect(() => {
		saveMessagesToLocal(websiteId, chatId, chat.messages);
	}, [websiteId, chatId, chat.messages]);

	return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChat() {
	const chat = useContext(ChatContext);

	if (!chat) {
		throw new Error("useChat must be used within a `ChatProvider`");
	}

	return chat;
}

export function useChatStatus() {
	const { status } = useChat();
	return status;
}
