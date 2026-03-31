import { RAW_PLANS } from "@/app/(home)/pricing/data";

function buildPricingResponse() {
	return {
		currency: "USD",
		plans: RAW_PLANS.map((plan) => {
			const priceItem = plan.items.find((i) => i.type === "price") as
				| Extract<(typeof plan.items)[number], { type: "price" }>
				| undefined;

			const features = plan.items
				.filter(
					(
						i
					): i is Extract<
						(typeof plan.items)[number],
						{ type: "feature" | "priced_feature" }
					> => i.type === "feature" || i.type === "priced_feature"
				)
				.map((f) => ({
					id: f.feature_id,
					name: f.feature.name,
					included: f.included_usage === "inf" ? "unlimited" : f.included_usage,
					interval: f.interval,
					...(f.type === "priced_feature" && f.tiers
						? {
								overageTiers: f.tiers.map((t) => ({
									upTo: t.to === "inf" ? "unlimited" : t.to,
									pricePerUnit: t.amount,
								})),
							}
						: {}),
				}));

			return {
				id: plan.id,
				name: plan.name,
				pricePerMonth: priceItem?.price ?? 0,
				features,
			};
		}),
		signUpUrl: "https://app.databuddy.cc/login",
		pricingPageUrl: "https://www.databuddy.cc/pricing",
	};
}

export function GET() {
	return Response.json(buildPricingResponse(), {
		headers: {
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
