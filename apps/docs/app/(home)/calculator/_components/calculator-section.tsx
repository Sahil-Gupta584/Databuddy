"use client";

import { useState } from "react";
import { SciFiCard } from "@/components/scifi-card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
	calculateCookieBannerCost,
	formatCurrencyFull,
	formatNumber,
	formatPercent,
	VISITOR_DATA_LOSS_RANGE_HIGH,
	VISITOR_DATA_LOSS_RANGE_LOW,
} from "./calculator-engine";
import { ShareButtons } from "./share-buttons";

const DEFAULT_VISITORS = 50_000;
const DEFAULT_VISITOR_DATA_LOSS_RATE = 0.55;
const DEFAULT_VISITOR_TO_PAID = 0.015;
const DEFAULT_REVENUE_PER_CONVERSION = 50;

function percentToSlider(value: number): number {
	return Math.round(value * 1000);
}

function sliderToPercent(value: number): number {
	return value / 1000;
}

export function CalculatorSection() {
	const [monthlyVisitors, setMonthlyVisitors] = useState(DEFAULT_VISITORS);
	const [visitorDataLossRate, setVisitorDataLossRate] = useState(
		DEFAULT_VISITOR_DATA_LOSS_RATE
	);
	const [visitorToPaidRate, setVisitorToPaidRate] = useState(
		DEFAULT_VISITOR_TO_PAID
	);
	const [revenuePerConversion, setRevenuePerConversion] = useState(
		DEFAULT_REVENUE_PER_CONVERSION
	);

	const results = calculateCookieBannerCost({
		monthlyVisitors,
		visitorDataLossRate,
		visitorToPaidRate,
		revenuePerConversion,
	});

	return (
		<section className="mx-auto w-full max-w-5xl" id="calculator">
			<div className="mb-8 text-center">
				<p className="mb-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
					Cookie Banner Cost Calculator
				</p>
				<h2 className="mb-3 font-bold text-2xl tracking-tight sm:text-3xl">
					How much is your cookie banner costing you?
				</h2>
				<p className="mx-auto max-w-2xl text-balance text-muted-foreground text-sm">
					Adjust the inputs below. Every output updates in real time.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
				<div className="lg:col-span-3">
					<SciFiCard>
						<div className="rounded border border-border bg-card/70 p-5 backdrop-blur-sm sm:p-6">
							<h3 className="mb-5 font-semibold text-sm uppercase tracking-wider">
								Your Numbers
							</h3>

							<div className="space-y-6">
								<InputField
									hint="Total unique visitors per month"
									id="visitors"
									label="Monthly Visitors"
									max={2_000_000}
									min={0}
									onChangeAction={setMonthlyVisitors}
									sliderMax={100}
									sliderStep={1}
									sliderToValue={(v) =>
										Math.round((v / 100) ** 2.5 * 2_000_000)
									}
									suffix="/mo"
									value={monthlyVisitors}
									valueToSlider={(v) =>
										Math.round((v / 2_000_000) ** (1 / 2.5) * 100)
									}
								/>

								<InputField
									displayPercent
									hint="Share of visits you do not measure in analytics because visitors did not consent (close, ignore, or reject). Peer-reviewed work measures consent and rejection, not page bounce; we map that to data loss. Default 55% sits in the 40–70% band typical of compliant banners."
									id="data-loss"
									label="Visitor Data Loss Rate"
									max={0.75}
									min={0}
									onChangeAction={setVisitorDataLossRate}
									sliderMax={750}
									sliderStep={1}
									sliderToValue={sliderToPercent}
									value={visitorDataLossRate}
									valueToSlider={percentToSlider}
								/>

								<InputField
									displayPercent
									hint="What % of all visitors become paying customers? Typical SaaS ~0.5–3%, e-commerce ~1–4%. Use paid conversions, not raw signups."
									id="visitor-paid"
									label="Visitor-to-Paid Rate"
									max={0.05}
									min={0}
									onChangeAction={setVisitorToPaidRate}
									sliderMax={50}
									sliderStep={1}
									sliderToValue={sliderToPercent}
									value={visitorToPaidRate}
									valueToSlider={percentToSlider}
								/>

								<InputField
									hint="Average revenue per paying customer attributed to a visit (order value, subscription, etc.)"
									id="revenue"
									label="Revenue per Conversion"
									max={1000}
									min={0}
									onChangeAction={setRevenuePerConversion}
									prefix="$"
									sliderMax={1000}
									sliderStep={5}
									sliderToValue={(v) => v}
									value={revenuePerConversion}
									valueToSlider={(v) => v}
								/>
							</div>
						</div>
					</SciFiCard>
				</div>

				<div className="lg:col-span-2">
					<SciFiCard>
						<div className="flex h-full flex-col rounded border border-border bg-card/70 p-5 backdrop-blur-sm sm:p-6">
							<h3 className="mb-5 font-semibold text-sm uppercase tracking-wider">
								What You're Losing
							</h3>

							<div className="flex flex-1 flex-col justify-between gap-4">
								<ResultRow
									label="Lost Visitors / mo"
									value={formatNumber(results.lostVisitors)}
								/>
								<ResultRow
									label="Lost Paying Customers / mo"
									value={formatNumber(results.lostConversions)}
								/>
								<ResultRow
									highlight
									label="Opportunity Cost / mo"
									value={formatCurrencyFull(results.lostRevenueMonthly)}
								/>

								<Separator />

								<div className="rounded border border-destructive/20 bg-destructive/5 p-4">
									<p className="mb-1 text-muted-foreground text-xs uppercase tracking-wider">
										Opportunity Cost / Year
									</p>
									<p className="font-bold text-2xl text-destructive tabular-nums tracking-tight sm:text-3xl">
										{formatCurrencyFull(results.lostRevenueYearly)}
									</p>
									<p className="mt-2 text-pretty text-muted-foreground text-xs">
										Range at {formatPercent(VISITOR_DATA_LOSS_RANGE_LOW)}–
										{formatPercent(VISITOR_DATA_LOSS_RANGE_HIGH)} visitor data
										loss (same other inputs):{" "}
										<span className="font-mono text-foreground">
											{formatCurrencyFull(results.lostRevenueYearlyRangeLow)} –{" "}
											{formatCurrencyFull(results.lostRevenueYearlyRangeHigh)}
										</span>
										/year
									</p>
								</div>

								<div className="space-y-2 rounded border border-border bg-card/40 p-3">
									<p className="text-muted-foreground text-xs">
										Side-by-side (no ratio — compare yourself)
									</p>
									<div className="flex flex-col gap-1.5 text-sm">
										<div className="flex justify-between gap-2">
											<span className="text-muted-foreground">
												Banner opportunity cost
											</span>
											<span className="font-semibold tabular-nums">
												{formatCurrencyFull(results.lostRevenueMonthly)}
												/mo
											</span>
										</div>
										<div className="flex justify-between gap-2">
											<span className="text-muted-foreground">
												Databuddy ({results.databuddyPlanName})
											</span>
											<span className="font-semibold tabular-nums">
												{formatCurrencyFull(results.databuddyMonthlyCost)}
												/mo
											</span>
										</div>
									</div>
								</div>
							</div>

							<p className="mt-4 text-pretty text-muted-foreground text-xs">
								This estimates opportunity cost from published consent and
								data-loss studies. Real impact varies by site, audience, and
								banner design.
							</p>

							<Separator className="my-4" />

							<ShareButtons
								databuddyMonthlyCost={results.databuddyMonthlyCost}
								lostRevenueYearly={results.lostRevenueYearly}
								monthlyVisitors={monthlyVisitors}
							/>
						</div>
					</SciFiCard>
				</div>
			</div>

			<div className="mt-4 text-center">
				<p className="text-pretty text-muted-foreground text-xs">
					The yearly range uses {formatPercent(VISITOR_DATA_LOSS_RANGE_LOW)}–
					{formatPercent(VISITOR_DATA_LOSS_RANGE_HIGH)} visitor data loss —
					aligned with peer-reviewed and industry consent benchmarks (sources
					below). Databuddy needs no cookies, so no banner.
				</p>
			</div>
		</section>
	);
}

interface InputFieldProps {
	id: string;
	label: string;
	hint: string;
	value: number;
	onChangeAction: (value: number) => void;
	min: number;
	max: number;
	sliderMin?: number;
	sliderMax: number;
	sliderStep: number;
	valueToSlider: (value: number) => number;
	sliderToValue: (slider: number) => number;
	prefix?: string;
	suffix?: string;
	displayPercent?: boolean;
}

function InputField({
	id,
	label,
	hint,
	value,
	onChangeAction,
	min,
	max,
	sliderMin = 0,
	sliderMax,
	sliderStep,
	valueToSlider,
	sliderToValue,
	prefix,
	suffix,
	displayPercent,
}: InputFieldProps) {
	const displayValue = displayPercent
		? formatPercent(value)
		: `${prefix ?? ""}${formatNumber(value)}${suffix ?? ""}`;

	return (
		<div>
			<div className="mb-2 flex items-baseline justify-between">
				<Label className="text-sm" htmlFor={id}>
					{label}
				</Label>
				<span className="font-mono font-semibold text-base tabular-nums">
					{displayValue}
				</span>
			</div>
			<Slider
				aria-label={label}
				max={sliderMax}
				min={sliderMin}
				onValueChange={(v) => {
					const raw = sliderToValue(Number(v.at(0) ?? 0));
					onChangeAction(Math.min(max, Math.max(min, raw)));
				}}
				step={sliderStep}
				value={[valueToSlider(value)]}
			/>
			<p className="mt-1.5 text-muted-foreground text-xs">{hint}</p>
		</div>
	);
}

function ResultRow({
	label,
	value,
	highlight = false,
}: {
	label: string;
	value: string;
	highlight?: boolean;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-muted-foreground text-sm">{label}</span>
			<span
				className={cn(
					"font-semibold tabular-nums",
					highlight ? "text-base" : "text-sm"
				)}
			>
				{value}
			</span>
		</div>
	);
}
