"use client";

import type { ReactNode } from "react";
import { EmptyState, type EmptyStateProps } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	ChartQueryOutcome,
	ChartQuerySlice,
} from "@/lib/chart-query-outcome";
import { chartQueryOutcomeFromQuery } from "@/lib/chart-query-outcome";
import { cn } from "@/lib/utils";

interface ChartRootProps {
	children: ReactNode;
	className?: string;
	id?: string;
}

function ChartRoot({ children, className, id }: ChartRootProps) {
	return (
		<div
			className={cn(
				"flex w-full min-w-0 flex-col gap-0 overflow-hidden rounded border bg-card",
				className
			)}
			data-slot="chart"
			id={id}
		>
			{children}
		</div>
	);
}

interface ChartHeaderProps {
	title?: string;
	description?: ReactNode;
	children?: ReactNode;
	className?: string;
	titleClassName?: string;
	descriptionClassName?: string;
}

function ChartHeader({
	title,
	description,
	children,
	className,
	titleClassName,
	descriptionClassName,
}: ChartHeaderProps) {
	return (
		<div
			className={cn(
				"flex items-start justify-between gap-3 border-b px-4 py-3",
				className
			)}
			data-slot="chart-header"
		>
			<div className="min-w-0 flex-1">
				{title ? (
					<h3
						className={cn(
							"text-balance font-medium text-foreground text-sm",
							titleClassName
						)}
					>
						{title}
					</h3>
				) : null}
				{description ? (
					<div
						className={cn(
							"mt-0.5 text-pretty text-muted-foreground text-xs",
							descriptionClassName
						)}
					>
						{description}
					</div>
				) : null}
			</div>
			{children}
		</div>
	);
}

interface ChartPlotProps {
	children: ReactNode;
	className?: string;
}

/** Chart drawing region (e.g. dotted background + ResponsiveContainer). */
function ChartPlot({ children, className }: ChartPlotProps) {
	return (
		<div
			className={cn("dotted-bg bg-accent", className)}
			data-slot="chart-plot"
		>
			{children}
		</div>
	);
}

interface ChartFooterProps {
	children: ReactNode;
	className?: string;
}

function ChartFooter({ children, className }: ChartFooterProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-2.5 border-t px-2.5 py-2.5",
				className
			)}
			data-slot="chart-footer"
		>
			{children}
		</div>
	);
}

interface ChartContentBaseProps<T> {
	children: (data: T) => ReactNode;
	empty?: ReactNode;
	emptyProps?: EmptyStateProps;
	error?: ReactNode;
	errorProps?: EmptyStateProps;
	gatePending?: boolean;
	loading?: ReactNode;
	outcome?: ChartQueryOutcome<T>;
	query?: ChartQuerySlice<T>;
	stateWrapperClassName?: string;
	isEmpty?: (data: T) => boolean;
}

type ChartContentProps<T> =
	| (ChartContentBaseProps<T> & {
			gatePending?: never;
			outcome: ChartQueryOutcome<T>;
			query?: never;
	  })
	| (ChartContentBaseProps<T> & {
			gatePending?: boolean;
			outcome?: never;
			query: ChartQuerySlice<T>;
	  });

function ChartDefaultLoading({ height = 140 }: { height?: number }) {
	return (
		<>
			<ChartPlot>
				<div className="pt-2">
					<Skeleton
						className="w-full rounded-none"
						style={{ height: height + 8 }}
					/>
				</div>
			</ChartPlot>
			<ChartFooter>
				<div className="min-w-0 flex-1 space-y-1">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-3 w-32" />
				</div>
				<div className="flex gap-1.5">
					<Skeleton className="h-5 w-12 rounded-full" />
					<Skeleton className="h-5 w-12 rounded-full" />
				</div>
			</ChartFooter>
		</>
	);
}

function ChartContent<T>({
	children,
	empty,
	emptyProps,
	error,
	errorProps,
	gatePending,
	loading,
	outcome: outcomeProp,
	query,
	stateWrapperClassName,
	isEmpty: isEmptyProp,
}: ChartContentProps<T>) {
	const outcome =
		outcomeProp ??
		(query
			? chartQueryOutcomeFromQuery(query, {
					gatePending,
					isEmpty: isEmptyProp,
				})
			: undefined);
	if (!outcome) {
		throw new Error("Chart.Content requires `query` or `outcome`");
	}

	const stateShell = (node: ReactNode) => (
		<div
			className={cn(
				"flex min-h-[120px] flex-1 items-center justify-center py-8",
				stateWrapperClassName
			)}
		>
			{node}
		</div>
	);

	if (outcome.status === "loading") {
		return loading ?? <ChartDefaultLoading />;
	}
	if (outcome.status === "error") {
		if (error !== undefined) {
			return error;
		}
		if (errorProps) {
			return stateShell(
				<EmptyState {...errorProps} variant={errorProps.variant ?? "error"} />
			);
		}
		return null;
	}
	if (outcome.status === "empty") {
		if (empty !== undefined) {
			return empty;
		}
		if (emptyProps) {
			return stateShell(
				<EmptyState {...emptyProps} variant={emptyProps.variant ?? "minimal"} />
			);
		}
		return null;
	}
	return children(outcome.data);
}

ChartRoot.displayName = "Chart";

export const Chart = Object.assign(ChartRoot, {
	Content: ChartContent,
	DefaultLoading: ChartDefaultLoading,
	Footer: ChartFooter,
	Header: ChartHeader,
	Plot: ChartPlot,
}) as typeof ChartRoot & {
	Content: typeof ChartContent;
	DefaultLoading: typeof ChartDefaultLoading;
	Footer: typeof ChartFooter;
	Header: typeof ChartHeader;
	Plot: typeof ChartPlot;
};
