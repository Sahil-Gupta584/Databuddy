"use client";

import { FaRedditAlien, FaXTwitter } from "react-icons/fa6";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { formatCurrencyFull } from "./calculator-engine";

const CALCULATOR_BASE = "https://www.databuddy.cc/calculator";

function buildShareUrl(
	lostRevenueYearly: number,
	monthlyVisitors: number,
	databuddyMonthlyCost: number
): string {
	const params = new URLSearchParams({
		revenue: String(Math.round(lostRevenueYearly)),
		visitors: String(Math.round(monthlyVisitors)),
		cost: String(Math.round(databuddyMonthlyCost)),
	});
	return `${CALCULATOR_BASE}?${params.toString()}`;
}

function buildTwitterShareUrl(
	lostRevenueYearly: number,
	monthlyVisitors: number,
	databuddyMonthlyCost: number
): string {
	const shareUrl = buildShareUrl(
		lostRevenueYearly,
		monthlyVisitors,
		databuddyMonthlyCost
	);
	const text = `🍪 My cookie banner hides a huge share of visitors from analytics — ~${formatCurrencyFull(lostRevenueYearly)}/year in modeled opportunity cost. Model yours →`;
	const params = new URLSearchParams({ text, url: shareUrl });
	return `https://x.com/intent/tweet?${params.toString()}`;
}

function buildRedditShareUrl(
	lostRevenueYearly: number,
	monthlyVisitors: number,
	databuddyMonthlyCost: number
): string {
	const shareUrl = buildShareUrl(
		lostRevenueYearly,
		monthlyVisitors,
		databuddyMonthlyCost
	);
	const title = `Cookie consent & visitor data loss: ${formatCurrencyFull(lostRevenueYearly)}/year modeled opportunity cost`;
	const params = new URLSearchParams({ url: shareUrl, title });
	return `https://www.reddit.com/submit?${params.toString()}`;
}

interface ShareButtonsProps {
	lostRevenueYearly: number;
	monthlyVisitors: number;
	databuddyMonthlyCost: number;
}

export function ShareButtons({
	lostRevenueYearly,
	monthlyVisitors,
	databuddyMonthlyCost,
}: ShareButtonsProps) {
	const twitterUrl = buildTwitterShareUrl(
		lostRevenueYearly,
		monthlyVisitors,
		databuddyMonthlyCost
	);
	const redditUrl = buildRedditShareUrl(
		lostRevenueYearly,
		monthlyVisitors,
		databuddyMonthlyCost
	);

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">
				Share your results (preview uses your numbers)
			</p>
			<div className="flex flex-wrap gap-2">
				<SciFiButton asChild>
					<a href={twitterUrl} rel="noopener noreferrer" target="_blank">
						<FaXTwitter className="size-3.5" />
						<span>Share on X</span>
					</a>
				</SciFiButton>
				<SciFiButton asChild>
					<a href={redditUrl} rel="noopener noreferrer" target="_blank">
						<FaRedditAlien className="size-3.5" />
						<span>Share on Reddit</span>
					</a>
				</SciFiButton>
			</div>
		</div>
	);
}
