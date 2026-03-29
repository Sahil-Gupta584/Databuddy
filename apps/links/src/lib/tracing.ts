import { log } from "evlog";
import { useLogger as getRequestLogger } from "evlog/elysia";

/**
 * Run a named operation. Request-level timing and HTTP metadata are emitted by
 * evlog on the wide event.
 */
export function record<T>(_name: string, fn: () => Promise<T> | T): Promise<T> {
	return Promise.resolve().then(() => fn());
}

/**
 * Merge structured fields into the active request wide event (evlog).
 */
export function mergeWideEvent(
	fields: Record<string, string | number | boolean>
): void {
	try {
		getRequestLogger().set(fields as Record<string, unknown>);
	} catch {
		// Outside request context
	}
}

/**
 * Merge structured fields, filtering out null/undefined values.
 */
export function setAttributes(
	attributes: Record<string, string | number | boolean | null | undefined>
): void {
	const filtered: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(attributes)) {
		if (value !== null && value !== undefined) {
			filtered[key] = value;
		}
	}
	mergeWideEvent(filtered);
}

/**
 * Attach an error to the active request wide event when inside the evlog
 * middleware; otherwise emit a global structured log line.
 */
export function captureError(
	error: unknown,
	attributes?: Record<string, string | number | boolean>
): void {
	const err = error instanceof Error ? error : new Error(String(error));
	if (attributes?.error_step != null) {
		mergeWideEvent({ request_error: true, ...attributes });
	}
	try {
		const requestLog = getRequestLogger();
		if (attributes) {
			requestLog.error(err, attributes as Record<string, unknown>);
		} else {
			requestLog.error(err);
		}
	} catch {
		log.error({
			service: "links",
			error_message: err.message,
			...(attributes ?? {}),
		});
	}
}
