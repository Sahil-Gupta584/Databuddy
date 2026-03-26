"use client";

import { ClockIcon } from "@phosphor-icons/react";
import { formatDateTime, localDayjs } from "@/lib/time";
import { getUserTimezone } from "@/lib/timezone";

interface LastUpdatedProps {
	timestamp: string | null;
}

export function LastUpdated({ timestamp }: LastUpdatedProps) {
	const tz = getUserTimezone();
	const abbreviation = localDayjs().format("z");

	if (!timestamp) {
		return null;
	}

	return (
		<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
			<ClockIcon className="size-3.5 shrink-0" weight="duotone" />
			<span>
				Last checked {formatDateTime(timestamp)}{" "}
				<span className="text-muted-foreground/60">{abbreviation || tz}</span>
			</span>
		</div>
	);
}
