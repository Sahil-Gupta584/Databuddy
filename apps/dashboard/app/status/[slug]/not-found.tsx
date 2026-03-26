import Link from "next/link";

export default function StatusNotFound() {
	return (
		<div className="flex flex-col items-center justify-center py-24 text-center">
			<h1 className="text-balance font-semibold text-3xl tracking-tight">
				Status page not found
			</h1>
			<p className="mt-2 max-w-sm text-pretty text-muted-foreground text-sm">
				This organization doesn&apos;t have a public status page, or the URL
				is incorrect.
			</p>
			<Link
				className="mt-6 font-medium text-foreground text-sm hover:underline"
				href="https://www.databuddy.cc"
				rel="noopener noreferrer"
				target="_blank"
			>
				Go to Databuddy
			</Link>
		</div>
	);
}
