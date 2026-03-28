import type { Metadata } from "next";
import { SITE_URL } from "@/app/util/constants";
import { Footer } from "@/components/footer";
import { CalculatorSection } from "./_components/calculator-section";
import { CalculatorSources } from "./_components/calculator-sources";
import { CtaSection } from "./_components/cta-section";
import { ScenariosSection } from "./_components/scenarios-section";

const TITLE = "Cookie Banner Cost Calculator";
const DESCRIPTION =
	"Estimate opportunity cost from visitor data loss: your traffic, visitor-to-paid rate, revenue per conversion, and a 40–70% range.";

/** Matches defaults: 50k visitors, 55% data loss, 1.5% visitor-to-paid, $50 — ~$248k/yr; ~$11/mo Databuddy at this volume */
const DEFAULT_OG_PARAMS = "revenue=247500&visitors=50000&cost=11";

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
	searchParams,
}: PageProps): Promise<Metadata> {
	const params = await searchParams;
	const revenue = typeof params.revenue === "string" ? params.revenue : null;
	const visitors = typeof params.visitors === "string" ? params.visitors : null;
	const cost = typeof params.cost === "string" ? params.cost : null;

	const hasPersonalizedParams = revenue && visitors && cost;

	const ogParams = hasPersonalizedParams
		? `revenue=${revenue}&visitors=${visitors}&cost=${cost}`
		: DEFAULT_OG_PARAMS;

	const ogImageUrl = `${SITE_URL}/calculator/og?${ogParams}`;

	const personalizedDescription = hasPersonalizedParams
		? `Estimated opportunity cost ~$${Number(revenue).toLocaleString()}/year vs Databuddy ~$${Number(cost).toLocaleString()}/month. Model yours.`
		: DESCRIPTION;

	return {
		title: TITLE,
		description: personalizedDescription,
		openGraph: {
			title: TITLE,
			description: personalizedDescription,
			url: `${SITE_URL}/calculator`,
			images: [
				{
					url: ogImageUrl,
					width: 1200,
					height: 630,
					alt: "Cookie Banner Cost Calculator results",
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: TITLE,
			description: personalizedDescription,
			images: [ogImageUrl],
		},
	};
}

export default function CalculatorPage() {
	return (
		<div className="px-4 pt-10 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-7xl">
				<header className="mb-12 text-center sm:mb-16">
					<p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-widest">
						Free Tool
					</p>
					<h1 className="mb-3 text-balance font-bold text-3xl tracking-tight sm:text-4xl lg:text-5xl">
						Cookie Banner Cost Calculator
					</h1>
					<p className="mx-auto max-w-2xl text-balance text-pretty text-muted-foreground text-sm sm:text-base">
						Without consent, those visits do not show up in cookie-based
						analytics. Model opportunity cost with a visitor data loss rate
						(default 55%) and a 40–70% sensitivity band on the yearly figure.
					</p>
				</header>

				<div className="space-y-16 sm:space-y-24">
					<CalculatorSection />
					<ScenariosSection />
					<CtaSection />
					<CalculatorSources />
				</div>

				<Footer />
			</div>
		</div>
	);
}
