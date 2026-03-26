import type { Request } from "@playwright/test";
import { expect, type Page } from "@playwright/test";

/** Basket mock + no sendBeacon — reuse in specs that POST to basket. */
export async function setupBasketMock(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "sendBeacon", { value: undefined });
	});
	await page.route("**/basket.databuddy.cc/*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ success: true }),
			headers: { "Access-Control-Allow-Origin": "*" },
		});
	});
}

/** Debug IIFE exposes `db.__getMaxScrollDepth` after script load. */
export async function waitForDebugScrollHook(page: Page): Promise<void> {
	await expect
		.poll(async () =>
			page.evaluate(
				() =>
					typeof (
						window as unknown as { db?: { __getMaxScrollDepth?: () => number } }
					).db?.__getMaxScrollDepth === "function"
			)
		)
		.toBeTruthy();
}

export async function readMaxScrollDepth(page: Page): Promise<number> {
	return page.evaluate(() =>
		(
			window as unknown as { db: { __getMaxScrollDepth: () => number } }
		).db.__getMaxScrollDepth()
	);
}

export function requestHasNamedEvent(req: Request, name: string): boolean {
	if (!req.url().includes("basket.databuddy.cc") || req.method() !== "POST") {
		return false;
	}
	const raw = req.postData();
	if (!raw) {
		return false;
	}
	try {
		const data = JSON.parse(raw) as unknown;
		const batch = Array.isArray(data) ? data : [data];
		return batch.some((e: { name?: string }) => e.name === name);
	} catch {
		return false;
	}
}

/**
 * Finds a matching event in a request payload, handling both
 * individual events and batched arrays sent to /batch.
 */
export function findEvent(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
	if (!req.url().includes("basket.databuddy.cc")) {
		return undefined;
	}
	try {
		const data = req.postDataJSON();
		if (Array.isArray(data)) {
			return data.find(predicate);
		}
		return predicate(data) ? data : undefined;
	} catch {
		return undefined;
	}
}

export function hasEvent(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): boolean {
	return !!findEvent(req, predicate);
}

/**
 * Counts events matching a predicate across individual and batched payloads.
 */
export function countEvents(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): number {
	if (!req.url().includes("basket.databuddy.cc")) {
		return 0;
	}
	try {
		const data = req.postDataJSON();
		if (Array.isArray(data)) {
			return data.filter(predicate).length;
		}
		return predicate(data) ? 1 : 0;
	} catch {
		return 0;
	}
}
