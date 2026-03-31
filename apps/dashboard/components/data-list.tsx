import { Slot } from "@radix-ui/react-slot";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { EmptyState, type EmptyStateProps } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	ListQueryOutcome,
	ListQuerySlice,
} from "@/lib/list-query-outcome";
import { listQueryOutcomeFromQuery } from "@/lib/list-query-outcome";
import { cn } from "@/lib/utils";

interface DataListRootProps {
	children: ReactNode;
	className?: string;
}

function DataListRoot({ children, className }: DataListRootProps) {
	return (
		<div
			className={cn("w-full overflow-x-auto", className)}
			data-slot="data-list"
		>
			{children}
		</div>
	);
}

interface DataListHeadProps {
	children: ReactNode;
	className?: string;
	sticky?: boolean;
}

function DataListHead({
	children,
	className,
	sticky = false,
}: DataListHeadProps) {
	return (
		<div
			className={cn(
				"flex w-full min-w-0 items-start gap-4 border-b bg-card px-4 py-2 text-muted-foreground text-xs",
				sticky && "sticky top-0 z-10",
				className
			)}
			data-slot="data-list-head"
		>
			{children}
		</div>
	);
}

interface DataListRowProps {
	align?: "center" | "start";
	asChild?: boolean;
	children: ReactNode;
	className?: string;
	density?: "comfortable" | "compact";
	interactive?: boolean;
}

function DataListRow({
	align = "start",
	asChild = false,
	children,
	className,
	density = "comfortable",
	interactive = true,
}: DataListRowProps) {
	const Comp = asChild ? Slot : "div";
	return (
		<Comp
			className={cn(
				"group flex w-full min-w-0 border-border/80 border-b transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				align === "center" ? "items-center" : "items-start",
				density === "comfortable" && "gap-4 px-4 py-3",
				density === "compact" && "gap-3 px-3 py-3 sm:gap-4 sm:px-4",
				interactive && "hover:bg-accent/50",
				className
			)}
			data-slot="data-list-row"
		>
			{children}
		</Comp>
	);
}

interface DataListCellProps extends ComponentPropsWithoutRef<"div"> {
	action?: boolean;
	align?: "start" | "center" | "end";
	grow?: boolean;
}

function DataListCell({
	action = false,
	align = "start",
	children,
	className,
	grow = false,
	onClick,
	onKeyDown,
	...props
}: DataListCellProps) {
	if (action) {
		return (
			<div
				{...props}
				className={cn("shrink-0", className)}
				data-slot="data-list-cell"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onClick?.(e);
				}}
				onKeyDown={(e) => {
					e.stopPropagation();
					onKeyDown?.(e);
				}}
				role="presentation"
			>
				{children}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"min-w-0",
				!grow && "shrink-0",
				grow && "flex-1",
				align === "center" && "flex justify-center text-center",
				align === "end" && "text-balance text-right",
				className
			)}
			data-slot="data-list-cell"
			{...props}
		>
			{children}
		</div>
	);
}

interface DataListContentBaseProps<T> {
	children: (items: T[]) => ReactNode;
	/** Shown when outcome is empty; overrides emptyProps */
	empty?: ReactNode;
	/** Passed to EmptyState when outcome is empty (unless `empty` is set) */
	emptyProps?: EmptyStateProps;
	/** Shown when outcome is error; overrides errorProps */
	error?: ReactNode;
	/** Passed to EmptyState with variant `error` when outcome is error (unless `error` is set) */
	errorProps?: EmptyStateProps;
	/** Shown when outcome is loading; defaults to DataList.DefaultLoading */
	loading?: ReactNode;
	/** Wrapper for default EmptyState branches (not applied to custom `empty` / `error` nodes) */
	stateWrapperClassName?: string;
}

type DataListContentProps<T> =
	| (DataListContentBaseProps<T> & {
			gatePending?: never;
			outcome: ListQueryOutcome<T>;
			query?: never;
	  })
	| (DataListContentBaseProps<T> & {
			gatePending?: boolean;
			outcome?: never;
			query: ListQuerySlice<T>;
	  });

function DataListDefaultLoading() {
	return (
		<DataListRoot className="rounded bg-card">
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					className="flex min-h-15 items-start gap-4 border-border/80 border-b px-4 py-3 last:border-b-0"
					key={`data-list-skeleton-${i + 1}`}
				>
					<Skeleton className="size-8 shrink-0 rounded" />
					<Skeleton className="h-4 w-28 shrink-0" />
					<Skeleton className="h-3 min-w-0 flex-1" />
					<Skeleton className="hidden h-3 w-16 shrink-0 sm:block" />
					<Skeleton className="h-4 w-20 shrink-0" />
				</div>
			))}
		</DataListRoot>
	);
}

function DataListContent<T>({
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
}: DataListContentProps<T>) {
	const outcome =
		outcomeProp ??
		(query ? listQueryOutcomeFromQuery(query, { gatePending }) : undefined);
	if (!outcome) {
		throw new Error("DataList.Content requires `query` or `outcome`");
	}

	const stateShell = (node: ReactNode) => (
		<div
			className={cn(
				"flex flex-1 items-center justify-center py-16",
				stateWrapperClassName
			)}
		>
			{node}
		</div>
	);

	if (outcome.status === "loading") {
		return loading ?? <DataListDefaultLoading />;
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
	return children(outcome.items);
}

DataListRoot.displayName = "DataList";

export const DataList = Object.assign(DataListRoot, {
	Cell: DataListCell,
	Content: DataListContent,
	DefaultLoading: DataListDefaultLoading,
	Head: DataListHead,
	Row: DataListRow,
}) as typeof DataListRoot & {
	Cell: typeof DataListCell;
	Content: typeof DataListContent;
	DefaultLoading: typeof DataListDefaultLoading;
	Head: typeof DataListHead;
	Row: typeof DataListRow;
};
