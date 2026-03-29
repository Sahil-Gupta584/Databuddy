export const getPricingTableContent = (plan: {
	customerEligibility?: {
		trialAvailable?: boolean;
		status?: string;
		canceling?: boolean;
		attachAction?: string;
	} | null;
}) => {
	const eligibility = plan.customerEligibility;

	if (eligibility?.trialAvailable) {
		return {
			buttonText: <p>Start Free Trial</p>,
		};
	}

	if (eligibility?.status === "scheduled") {
		return { buttonText: <p>Plan Scheduled</p> };
	}

	if (eligibility?.status === "active") {
		return { buttonText: <p>Current Plan</p> };
	}

	if (eligibility?.canceling) {
		return { buttonText: <p>Cancel Plan</p> };
	}

	switch (eligibility?.attachAction) {
		case "upgrade":
			return { buttonText: <p>Upgrade</p> };

		case "downgrade":
			return { buttonText: <p>Downgrade</p> };

		case "purchase":
			return { buttonText: <p>Purchase</p> };

		case "activate":
			return { buttonText: <p>Get started</p> };

		default:
			return { buttonText: <p>Get Started</p> };
	}
};
