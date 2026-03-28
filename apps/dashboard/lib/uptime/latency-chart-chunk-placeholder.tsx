import { Skeleton } from "@/components/ui/skeleton";

/** Same footprint as collapsed LatencyChart row — use with next/dynamic loading to avoid CLS */
export function LatencyChartChunkPlaceholder() {
	return (
		<div className="border-border border-t">
			<div
				aria-hidden
				className="flex min-h-10 items-center gap-3 px-4 py-2.5 sm:px-6"
			>
				<Skeleton className="h-3 w-32 rounded" />
				<Skeleton className="h-3 w-14 rounded" />
				<Skeleton className="h-3 w-14 rounded" />
				<div className="ml-auto size-3 shrink-0 rounded bg-muted" />
			</div>
		</div>
	);
}
