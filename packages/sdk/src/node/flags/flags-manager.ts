import {
	buildQueryParams,
	type CacheEntry,
	createCacheEntry,
	DEFAULT_RESULT,
	fetchAllFlags as fetchAllFlagsApi,
	getCacheKey,
	isCacheStale,
	isCacheValid,
	RequestBatcher,
} from "@/core/flags/shared";
import type {
	FlagResult,
	FlagState,
	FlagsConfig,
	FlagsManager,
	FlagsManagerOptions,
	UserContext,
} from "@/core/flags/types";
import { logger } from "@/logger";

/**
 * Server-side flags manager
 * Optimized for server environments with:
 * - Request-level deduplication
 * - Request batching
 * - Stale-while-revalidate caching
 * - No persistent storage (stateless)
 */
export class ServerFlagsManager implements FlagsManager {
	private config: FlagsConfig;
	private readonly onFlagsUpdate?: (flags: Record<string, FlagResult>) => void;
	private readonly onConfigUpdate?: (config: FlagsConfig) => void;

	/** In-memory cache with stale tracking */
	private readonly cache = new Map<string, CacheEntry>();

	/** In-flight requests for deduplication */
	private readonly inFlight = new Map<string, Promise<FlagResult>>();

	/** Request batcher */
	private batcher: RequestBatcher | null = null;

	/** Ready state */
	private ready = false;

	/** Init promise for awaiting */
	private readonly initPromise: Promise<void>;

	constructor(options: FlagsManagerOptions) {
		this.config = this.withDefaults(options.config);
		this.onFlagsUpdate = options.onFlagsUpdate;
		this.onConfigUpdate = options.onConfigUpdate;

		logger.setDebug(this.config.debug ?? false);
		logger.debug("ServerFlagsManager initialized", {
			clientId: this.config.clientId,
			hasUser: Boolean(this.config.user),
		});

		this.initPromise = this.initialize();
	}

	private withDefaults(config: FlagsConfig): FlagsConfig {
		return {
			clientId: config.clientId,
			apiUrl: config.apiUrl ?? "https://api.databuddy.cc",
			user: config.user,
			disabled: config.disabled ?? false,
			debug: config.debug ?? false,
			skipStorage: true, // Always skip storage on server
			isPending: config.isPending,
			autoFetch: config.autoFetch ?? false,
			environment: config.environment,
			cacheTtl: config.cacheTtl ?? 60_000, // 1 minute
			staleTime: config.staleTime ?? 30_000, // 30 seconds
		};
	}

	private async initialize(): Promise<void> {
		if (this.config.autoFetch && !this.config.isPending) {
			await this.fetchAllFlags();
		}
		this.ready = true;
	}

	/**
	 * Wait for initialization to complete
	 */
	async waitForInit(): Promise<void> {
		await this.initPromise;
	}

	private getFromCache(key: string): CacheEntry | null {
		const cached = this.cache.get(key);
		if (isCacheValid(cached)) {
			return cached;
		}
		if (cached) {
			this.cache.delete(key);
		}
		return null;
	}

	private getBatcher(): RequestBatcher {
		if (!this.batcher) {
			const apiUrl = this.config.apiUrl ?? "https://api.databuddy.cc";
			const params = buildQueryParams(this.config);
			this.batcher = new RequestBatcher(apiUrl, params, 5); // 5ms batch window for server
		}
		return this.batcher;
	}

	/**
	 * Get a flag with deduplication, batching, and SWR caching
	 */
	async getFlag(key: string, user?: UserContext): Promise<FlagResult> {
		if (this.config.disabled) {
			return DEFAULT_RESULT;
		}

		if (this.config.isPending) {
			return { ...DEFAULT_RESULT, reason: "SESSION_PENDING" };
		}

		const cacheKey = getCacheKey(key, user ?? this.config.user);

		// Check cache first - stale-while-revalidate
		const cached = this.getFromCache(cacheKey);
		if (cached) {
			// Return immediately, revalidate in background if stale
			if (isCacheStale(cached)) {
				this.revalidateFlag(key, cacheKey);
			}
			return cached.result;
		}

		// Deduplicate in-flight requests
		const existing = this.inFlight.get(cacheKey);
		if (existing) {
			logger.debug(`Deduplicating request: ${key}`);
			return existing;
		}

		// Use batcher for efficient batching
		const promise = this.getBatcher().request(key);
		this.inFlight.set(cacheKey, promise);

		try {
			const result = await promise;
			const ttl = this.config.cacheTtl ?? 60_000;
			const staleTime = this.config.staleTime ?? ttl / 2;
			this.cache.set(cacheKey, createCacheEntry(result, ttl, staleTime));
			return result;
		} finally {
			this.inFlight.delete(cacheKey);
		}
	}

	private async revalidateFlag(key: string, cacheKey: string): Promise<void> {
		// Skip if already in-flight
		if (this.inFlight.has(cacheKey)) {
			return;
		}

		const promise = this.getBatcher().request(key);
		this.inFlight.set(cacheKey, promise);

		try {
			const result = await promise;
			const ttl = this.config.cacheTtl ?? 60_000;
			const staleTime = this.config.staleTime ?? ttl / 2;
			this.cache.set(cacheKey, createCacheEntry(result, ttl, staleTime));
			logger.debug(`Revalidated flag: ${key}`);
		} catch (err) {
			logger.error(`Revalidation error: ${key}`, err);
		} finally {
			this.inFlight.delete(cacheKey);
		}
	}

	/**
	 * Fetch all flags for a user
	 */
	async fetchAllFlags(user?: UserContext): Promise<void> {
		if (this.config.disabled || this.config.isPending) {
			return;
		}

		const apiUrl = this.config.apiUrl ?? "https://api.databuddy.cc";
		const params = buildQueryParams(this.config, user);

		try {
			const flags = await fetchAllFlagsApi(apiUrl, params);

			// Update cache
			const ttl = this.config.cacheTtl ?? 60_000;
			const staleTime = this.config.staleTime ?? ttl / 2;

			for (const [key, result] of Object.entries(flags)) {
				const cacheKey = getCacheKey(key, user ?? this.config.user);
				this.cache.set(cacheKey, createCacheEntry(result, ttl, staleTime));
			}

			this.ready = true;
			this.onFlagsUpdate?.(flags);

			logger.debug(`Fetched ${Object.keys(flags).length} flags`);
		} catch (err) {
			logger.error("Bulk fetch error:", err);
		}
	}

	/**
	 * Check if flag is enabled (synchronous)
	 */
	isEnabled(key: string): FlagState {
		const cacheKey = getCacheKey(key, this.config.user);
		const cached = this.getFromCache(cacheKey);

		if (cached) {
			return {
				on: cached.result.enabled,
				status: cached.result.reason === "ERROR" ? "error" : "ready",
				loading: false,
				value: cached.result.value,
				variant: cached.result.variant,
			};
		}

		const loading = this.inFlight.has(cacheKey);
		return {
			on: false,
			status: "loading",
			loading,
		};
	}

	/**
	 * Get flag value (synchronous)
	 */
	getValue<T = boolean | string | number>(key: string, defaultValue?: T): T {
		const cacheKey = getCacheKey(key, this.config.user);
		const cached = this.getFromCache(cacheKey);

		if (cached) {
			return cached.result.value as T;
		}

		return (defaultValue ?? false) as T;
	}

	/**
	 * Update user context
	 */
	updateUser(user: UserContext): void {
		this.config = { ...this.config, user };

		// Recreate batcher with new user params
		this.batcher?.destroy();
		this.batcher = null;

		this.onConfigUpdate?.(this.config);
	}

	/**
	 * Refresh flags
	 */
	async refresh(forceClear = false): Promise<void> {
		if (forceClear) {
			this.cache.clear();
		}
		await this.fetchAllFlags();
	}

	/**
	 * Update config
	 */
	updateConfig(config: FlagsConfig): void {
		this.config = this.withDefaults(config);

		// Recreate batcher
		this.batcher?.destroy();
		this.batcher = null;

		this.onConfigUpdate?.(this.config);
	}

	/**
	 * Get all cached flags
	 */
	getMemoryFlags(): Record<string, FlagResult> {
		const flags: Record<string, FlagResult> = {};
		for (const [key, entry] of this.cache) {
			const flagKey = key.split(":")[0];
			flags[flagKey] = entry.result;
		}
		return flags;
	}

	/**
	 * Check if ready
	 */
	isReady(): boolean {
		return this.ready;
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.batcher?.destroy();
		this.cache.clear();
		this.inFlight.clear();
	}
}
