"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { orpc } from "@/lib/orpc";

export function useTrackingSetup(websiteId: string) {
	const pathname = usePathname();
	const isDemoRoute = pathname?.startsWith("/demo/");

	const {
		data: trackingSetupData,
		isLoading: isTrackingSetupLoading,
		isError: isTrackingSetupError,
		error: trackingSetupError,
		refetch: refetchTrackingSetup,
	} = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({ input: { websiteId } }),
		enabled: !!websiteId && !isDemoRoute,
		staleTime: (query) =>
			query.state.data?.tracking_setup ? Number.POSITIVE_INFINITY : 0,
		gcTime: 30 * 60 * 1000,
	});

	const isTrackingSetup = isTrackingSetupLoading
		? null
		: (trackingSetupData?.tracking_setup ?? false);

	return {
		isTrackingSetup: isDemoRoute ? true : isTrackingSetup,
		isTrackingSetupLoading: isDemoRoute ? false : isTrackingSetupLoading,
		isTrackingSetupError: isDemoRoute ? false : isTrackingSetupError,
		trackingSetupError: isDemoRoute ? undefined : trackingSetupError,
		refetchTrackingSetup,
	};
}
