import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerRPCClient } from "@/lib/orpc-server";
import { LastUpdated } from "./_components/last-updated";
import { MonitorRow } from "./_components/monitor-row";
import { StatusBanner } from "./_components/status-banner";

interface StatusPageProps {
	params: Promise<{ slug: string }>;
}

export async function generateMetadata({
	params,
}: StatusPageProps): Promise<Metadata> {
	const { slug } = await params;

	try {
		const rpc = await getServerRPCClient();
		const data = await rpc.statusPage.getBySlug({ slug });

		return {
			title: `${data.organization.name} Status`,
			description: `Real-time system status for ${data.organization.name}`,
		};
	} catch {
		return {
			title: "Status Page",
			description: "System status and uptime monitoring",
		};
	}
}

export default async function StatusPage({ params }: StatusPageProps) {
	const { slug } = await params;

	const rpc = await getServerRPCClient();
	const data = await rpc.statusPage.getBySlug({ slug }).catch(() => null);

	if (!data) {
		notFound();
	}

	const latestTimestamp = data.monitors.reduce<string | null>(
		(latest, monitor) => {
			if (!monitor.lastCheckedAt) {
				return latest;
			}
			if (!latest || monitor.lastCheckedAt > latest) {
				return monitor.lastCheckedAt;
			}
			return latest;
		},
		null
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-balance font-semibold text-2xl tracking-tight">
					{data.organization.name}
				</h1>
				<p className="mt-1 text-pretty text-muted-foreground text-sm">
					System status and uptime
				</p>
			</div>

			<StatusBanner overallStatus={data.overallStatus} />

			<div className="space-y-3">
				{data.monitors.map((monitor) => (
					<MonitorRow
						currentStatus={monitor.currentStatus}
						dailyData={monitor.dailyData}
						domain={monitor.domain}
						key={monitor.id}
						lastCheckedAt={monitor.lastCheckedAt}
						name={monitor.name}
						uptimePercentage={monitor.uptimePercentage}
					/>
				))}
			</div>

			<LastUpdated timestamp={latestTimestamp} />
		</div>
	);
}
