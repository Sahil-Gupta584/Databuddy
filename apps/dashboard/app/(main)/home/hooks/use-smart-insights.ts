"use client";

import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	fetchInsightsAi,
	fetchInsightsHistoryPage,
	INSIGHT_CACHE,
	INSIGHT_QUERY_KEYS,
} from "@/lib/insight-api";
import type { Insight } from "@/lib/insight-types";
import { mapHistoryRowToInsight } from "@/lib/insight-types";

const INSIGHTS_MAX = 20;

function mergeInsights(fresh: Insight[], stored: Insight[]): Insight[] {
	const seen = new Set<string>();
	const out: Insight[] = [];
	for (const i of [...fresh, ...stored]) {
		if (!seen.has(i.id)) {
			seen.add(i.id);
			out.push(i);
			if (out.length >= INSIGHTS_MAX) {
				break;
			}
		}
	}
	return out;
}

export function useSmartInsights() {
	const queryClient = useQueryClient();
	const {
		activeOrganization,
		activeOrganizationId,
		isLoading: isOrgContextLoading,
	} = useOrganizationsContext();

	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const historyQuery = useQuery({
		queryKey: [INSIGHT_QUERY_KEYS.history, orgId],
		queryFn: () => fetchInsightsHistoryPage(orgId ?? "", 0, INSIGHTS_MAX),
		enabled: !!orgId,
		staleTime: INSIGHT_CACHE.historyStaleTime,
		gcTime: INSIGHT_CACHE.gcTime,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
		retry: 2,
		retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15_000),
	});

	const aiQuery = useQuery({
		queryKey: [INSIGHT_QUERY_KEYS.ai, orgId],
		queryFn: () => fetchInsightsAi(orgId ?? ""),
		enabled: !!orgId,
		staleTime: INSIGHT_CACHE.staleTime,
		gcTime: INSIGHT_CACHE.gcTime,
		refetchInterval: INSIGHT_CACHE.staleTime,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
		retry: 2,
		retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15_000),
	});

	const mergedInsights = useMemo(() => {
		const fresh = (aiQuery.data?.insights ?? []).map(
			(i): Insight => ({
				...i,
				insightSource: "ai",
			})
		);
		const stored = (historyQuery.data?.insights ?? []).map(
			mapHistoryRowToInsight
		);
		return mergeInsights(fresh, stored);
	}, [aiQuery.data?.insights, historyQuery.data?.insights]);

	const refetchInsights = useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: [INSIGHT_QUERY_KEYS.history, orgId],
			}),
			queryClient.invalidateQueries({
				queryKey: [INSIGHT_QUERY_KEYS.ai, orgId],
			}),
		]);
	}, [queryClient, orgId]);

	const isInitialLoading =
		isOrgContextLoading ||
		Boolean(
			orgId &&
			!(historyQuery.isFetched && aiQuery.isFetched) &&
			!(historyQuery.isError && aiQuery.isError)
		);

	const isError =
		mergedInsights.length === 0 &&
		historyQuery.isFetched &&
		aiQuery.isFetched &&
		(historyQuery.isError || aiQuery.isError);

	const isFetching = historyQuery.isFetching || aiQuery.isFetching;

	const isRefreshing = isFetching && !isInitialLoading;

	const isFetchingFresh = mergedInsights.length > 0 && aiQuery.isFetching;

	return {
		insights: mergedInsights,
		source: aiQuery.data?.source ?? null,
		isLoading: isInitialLoading,
		isRefreshing,
		isFetching,
		isFetchingFresh,
		isError,
		refetch: refetchInsights,
	};
}
