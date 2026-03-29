"use client";

import { AutumnProvider } from "autumn-js/react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { BillingProvider } from "@/components/providers/billing-provider";

function DemoLayoutContent({ children }: { children: React.ReactNode }) {
	const [isEmbed] = useQueryState("embed", parseAsBoolean.withDefault(false));

	if (isEmbed) {
		return (
			<div className="h-dvh overflow-hidden text-foreground">
				<div className="h-dvh overflow-y-auto overflow-x-hidden">
					{children}
				</div>
			</div>
		);
	}

	return (
		<div className="h-dvh overflow-hidden text-foreground">
			<Suspense fallback={null}>
				<Sidebar />
			</Suspense>
			<div className="relative h-dvh pl-0 md:pl-76 lg:pl-84">
				<div className="h-dvh overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
					{children}
				</div>
			</div>
		</div>
	);
}

export default function DemoLayout({
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
				<DemoLayoutContent>{children}</DemoLayoutContent>
			</BillingProvider>
		</AutumnProvider>
	);
}
