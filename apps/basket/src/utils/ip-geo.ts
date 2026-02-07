import { createHash } from "node:crypto";
import { cacheable } from "@databuddy/redis";
import { captureError, record, setAttributes } from "@lib/tracing";
import type { City } from "@maxmind/geoip2-node";
import {
	AddressNotFoundError,
	BadMethodCallError,
	Reader,
} from "@maxmind/geoip2-node";

interface GeoIPReader extends Reader {
	city(ip: string): City;
}

const CDN_URL = "https://cdn.databuddy.cc/mmdb/GeoLite2-City.mmdb";

let reader: GeoIPReader | null = null;
let isLoading = false;
let loadPromise: Promise<void> | null = null;
let loadError: Error | null = null;
let dbBuffer: Buffer | null = null;

function loadDatabaseFromCdn(): Promise<Buffer> {
	return record("loadDatabaseFromCdn", async () => {
		try {
			const response = await fetch(CDN_URL);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch database from CDN: ${response.status} ${response.statusText}`
				);
			}

			const arrayBuffer = await response.arrayBuffer();
			const buf = Buffer.from(arrayBuffer);

			setAttributes({
				cdn_status: response.status,
				cdn_db_size_bytes: buf.length,
			});

			if (buf.length < 1_000_000) {
				throw new Error(
					`Database file seems too small: ${buf.length} bytes`
				);
			}

			return buf;
		} catch (error) {
			captureError(error, { message: "Failed to load database from CDN" });
			throw error;
		}
	});
}

function loadDatabase() {
	if (loadError) {
		throw loadError;
	}

	if (isLoading && loadPromise) {
		return loadPromise;
	}

	if (reader) {
		return;
	}

	isLoading = true;
	loadPromise = (async () => {
		try {
			dbBuffer = await loadDatabaseFromCdn();
			reader = Reader.openBuffer(dbBuffer) as GeoIPReader;
		} catch (error) {
			captureError(error, { message: "Failed to load GeoIP database" });
			loadError = error as Error;
			reader = null;
			dbBuffer = null;
		} finally {
			isLoading = false;
		}
	})();

	return loadPromise;
}

const ignore = ["127.0.0.1", "::1"];

const ipv4Regex =
	/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
	return Boolean(ip && (ipv4Regex.test(ip) || ipv6Regex.test(ip)));
}

function getCloudflareCountry(headers: Headers): string | undefined {
	const cfCountry = headers.get("cf-ipcountry");
	if (cfCountry && cfCountry.length === 2) {
		return cfCountry;
	}
	return undefined;
}

function lookupGeoLocation(ip: string): Promise<{
	country: string | undefined;
	region: string | undefined;
	city: string | undefined;
}> {
	return record("lookupGeoLocation", async () => {
		if (!(reader || isLoading || loadError)) {
			try {
				await loadDatabase();
			} catch (error) {
				captureError(error, {
					message: "Failed to load database for IP lookup",
				});
				setAttributes({
					geo_lookup_failed: true,
					geo_error: "database_load_failed",
				});
				return { country: undefined, region: undefined, city: undefined };
			}
		}

		if (!reader) {
			setAttributes({
				geo_lookup_failed: true,
				geo_error: "no_reader",
			});
			return { country: undefined, region: undefined, city: undefined };
		}

		try {
			const response = reader.city(ip);
			const result = {
				country: response.country?.names?.en,
				region: response.subdivisions?.[0]?.names?.en,
				city: response.city?.names?.en,
			};

			setAttributes({
				geo_country: result.country || "unknown",
				geo_region: result.region || "unknown",
				geo_city: result.city || "unknown",
			});

			return result;
		} catch (error) {
			if (
				error instanceof AddressNotFoundError ||
				error instanceof BadMethodCallError
			) {
				setAttributes({
					geo_address_not_found: true,
				});
				return { country: undefined, region: undefined, city: undefined };
			}
			captureError(error, { message: "Error looking up IP" });
			setAttributes({
				geo_lookup_failed: true,
				geo_error: "lookup_error",
			});
			return { country: undefined, region: undefined, city: undefined };
		}
	});
}

const getGeoLocation = cacheable(lookupGeoLocation, {
	expireInSec: 86_400 * 7,
	prefix: "geoip_location",
	staleWhileRevalidate: true,
	staleTime: 86_400,
});

export function anonymizeIp(ip: string): string {
	if (!ip) {
		return "";
	}

	const salt = process.env.IP_HASH_SALT || "databuddy-ip-salt";
	const hash = createHash("sha256");
	hash.update(`${ip}${salt}`);
	return hash.digest("hex").substring(0, 12);
}

export function getGeo(ip: string, request?: Request) {
	return record("getGeo", async () => {
		if (!ip || ignore.includes(ip) || !isValidIp(ip)) {
			setAttributes({ geo_skipped: true, geo_reason: "invalid_ip" });
			return {
				anonymizedIP: anonymizeIp(ip),
				country: undefined,
				region: undefined,
				city: undefined,
			};
		}

		const geo = await getGeoLocation(ip);

		// Fallback to Cloudflare headers if MMDB lookup failed
		if (!geo.country && request?.headers) {
			const cfCountry = getCloudflareCountry(request.headers);
			if (cfCountry) {
				setAttributes({
					geo_fallback: "cloudflare",
					geo_country: cfCountry,
				});
				return {
					anonymizedIP: anonymizeIp(ip),
					country: cfCountry,
					region: undefined,
					city: undefined,
				};
			}
		}

		return {
			anonymizedIP: anonymizeIp(ip),
			country: geo.country,
			region: geo.region,
			city: geo.city,
		};
	});
}

export function extractIpFromRequest(request: Request): string {
	const cfIp = request.headers.get("cf-connecting-ip");
	if (cfIp) {
		return cfIp.trim();
	}

	const forwardedFor = request.headers.get("x-forwarded-for");
	const firstIp = forwardedFor?.split(",")[0]?.trim();
	if (firstIp) {
		return firstIp;
	}

	const realIp = request.headers.get("x-real-ip");
	if (realIp) {
		return realIp.trim();
	}

	return "";
}

export function closeGeoIPReader(): void {
	if (reader) {
		reader = null;
	}
	if (dbBuffer) {
		dbBuffer = null;
	}
	loadPromise = null;
	loadError = null;
	isLoading = false;
}
