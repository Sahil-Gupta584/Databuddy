import { AutumnProvider } from "autumn-js/react";
import { Suspense } from "react";
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
			includeCredentials
		>
			<BillingProvider>
				<CommandSearchProvider>
					<div className="flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
						<Suspense fallback={null}>
							<Sidebar />
						</Suspense>
						<div className="relative flex min-h-0 flex-1 flex-col pl-0 md:pl-76 lg:pl-84">
							<div className="flex min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden overscroll-none pt-12 md:pt-0">
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
