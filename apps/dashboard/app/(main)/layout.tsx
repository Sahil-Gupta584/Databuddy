import { AutumnProvider } from "autumn-js/react";
import { FeedbackPrompt } from "@/components/feedback-prompt";
import { Sidebar } from "@/components/layout/sidebar";
import { BillingProvider } from "@/components/providers/billing-provider";
import { CommandSearchProvider } from "@/components/ui/command-search";

export const dynamic = "force-dynamic";

export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AutumnProvider
			backendUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
		>
			<BillingProvider>
				<CommandSearchProvider>
					<div className="h-dvh overflow-hidden text-foreground">
						<Sidebar />
						<div className="relative h-dvh pl-0 md:pl-76 lg:pl-84">
							<div className="h-dvh overflow-y-auto overflow-x-hidden overscroll-none pt-12 md:pt-0">
								{children}
							</div>
						</div>
						<FeedbackPrompt />
					</div>
				</CommandSearchProvider>
			</BillingProvider>
		</AutumnProvider>
	);
}
