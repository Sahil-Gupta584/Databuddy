import { SpanStatusCode, trace } from "@opentelemetry/api";
import { getRedisCache } from "./redis";

const activeRevalidations = new Map<string, Promise<void>>();
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/;

let redisAvailable = true;
let lastRedisCheck = 0;

interface CacheOptions {
	expireInSec: number;
	prefix?: string;
	staleWhileRevalidate?: boolean;
	staleTime?: number;
}

function deserialize(data: string): unknown {
	return JSON.parse(data, (_, value) => {
		if (typeof value === "string" && DATE_REGEX.test(value)) {
			return new Date(value);
		}
		return value;
	});
}

function shouldSkipRedis(): boolean {
	if (!redisAvailable && Date.now() - lastRedisCheck < 30_000) {
		return true;
	}
	if (!redisAvailable) {
		redisAvailable = true;
		lastRedisCheck = Date.now();
	}
	return false;
}

function stringify(obj: unknown): string {
	if (obj === null) {
		return "null";
	}
	if (obj === undefined) {
		return "undefined";
	}
	if (typeof obj === "boolean") {
		return obj ? "true" : "false";
	}
	if (typeof obj === "number" || typeof obj === "string") {
		return String(obj);
	}
	if (typeof obj === "function") {
		return obj.toString();
	}
	if (Array.isArray(obj)) {
		return `[${obj.map(stringify).join(",")}]`;
	}
	if (typeof obj === "object") {
		return Object.entries(obj)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}:${stringify(v)}`)
			.join(":");
	}
	return String(obj);
}

export function cacheable<
	T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
>(fn: T, options: CacheOptions | number) {
	const {
		expireInSec,
		prefix = fn.name,
		staleWhileRevalidate = false,
		staleTime = 0,
	} = typeof options === "number" ? { expireInSec: options } : options;

	const cachePrefix = `cacheable:${prefix}`;
	const getKey = (...args: Parameters<T>) =>
		`${cachePrefix}:${stringify(args)}`;

	const cachedFn = (
		...args: Parameters<T>
	): Promise<Awaited<ReturnType<T>>> => {
		if (shouldSkipRedis()) {
			return fn(...args);
		}

		const key = getKey(...args);
		const tracer = trace.getTracer("redis");

		return tracer.startActiveSpan(`cache:${prefix}`, async (span): Promise<Awaited<ReturnType<T>>> => {
			span.setAttribute("cache.prefix", prefix);

			try {
				const redis = getRedisCache();
				const cached = await redis.get(key);
				redisAvailable = true;
				lastRedisCheck = Date.now();

				if (cached) {
					span.setAttribute("cache.hit", true);

					if (staleWhileRevalidate) {
						const ttl = await redis.ttl(key).catch(() => expireInSec);
						const isStale = ttl < staleTime;
						span.setAttribute("cache.stale", isStale);

						if (isStale && !activeRevalidations.has(key)) {
							const revalidation = fn(...args)
								.then(async (fresh) => {
									if (fresh != null && redisAvailable) {
										await redis
											.setex(key, expireInSec, JSON.stringify(fresh))
											.catch(() => { });
									}
								})
								.catch(() => { })
								.finally(() => activeRevalidations.delete(key));
							activeRevalidations.set(key, revalidation);
						}
					}

					span.setStatus({ code: SpanStatusCode.OK });
					span.end();
					return deserialize(cached) as Awaited<ReturnType<T>>;
				}

				span.setAttribute("cache.hit", false);

				const result = await fn(...args);
				if (result != null && redisAvailable) {
					await redis
						.setex(key, expireInSec, JSON.stringify(result))
						.catch(() => {
							redisAvailable = false;
							lastRedisCheck = Date.now();
						});
				}

				span.setStatus({ code: SpanStatusCode.OK });
				span.end();
				return result;
			} catch (error) {
				redisAvailable = false;
				lastRedisCheck = Date.now();
				span.setAttribute("cache.hit", false);
				span.setAttribute("cache.error", true);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error instanceof Error ? error.message : String(error),
				});
				span.end();
				return fn(...args);
			}
		});
	};

	cachedFn.getKey = getKey;
	return cachedFn;
}
