/** Flag evaluation result from API */
export interface FlagResult {
	enabled: boolean;
	value: boolean | string | number;
	payload: Record<string, unknown> | null;
	reason: string;
	variant?: string;
}

/** User context for flag evaluation */
export interface UserContext {
	userId?: string;
	email?: string;
	/** Organization ID for org-level rollouts (all org members get same result) */
	organizationId?: string;
	/** Team ID for team-level rollouts (all team members get same result) */
	teamId?: string;
	properties?: Record<string, unknown>;
}

/** SDK configuration */
export interface FlagsConfig {
	/** Client ID (website or organization ID) */
	clientId: string;
	/** API URL (default: https://api.databuddy.cc) */
	apiUrl?: string;
	/** User context for evaluation */
	user?: UserContext;
	/** Disable flag evaluation entirely */
	disabled?: boolean;
	/** Enable debug logging */
	debug?: boolean;
	/** Skip persistent storage (browser only) */
	skipStorage?: boolean;
	/** Session is loading - defer evaluation */
	isPending?: boolean;
	/** Auto-fetch all flags on init (default: true) */
	autoFetch?: boolean;
	/** Environment name */
	environment?: string;
	/** Cache TTL in ms - after this, cache is invalid (default: 60000) */
	cacheTtl?: number;
	/** Stale time in ms - after this, revalidate in background (default: cacheTtl/2) */
	staleTime?: number;
}

/** Flag status for clear state management */
export type FlagStatus = "loading" | "ready" | "error" | "pending";

/** Synchronous flag state for React hooks */
export interface FlagState {
	/** Whether the flag is enabled (true/false) */
	on: boolean;
	/**  Current status: loading, ready, error, or pending  */
	status: FlagStatus;
	/** Whether the flag is still loading */
	loading: boolean;
	/** The flag's value (boolean, string, or number) */
	value?: boolean | string | number;
	/** Variant name for multivariate flags */
	variant?: string;
}

/** Feature state returned by useFeature hook */
export interface FeatureState {
	/** Whether the feature is enabled */
	on: boolean;
	/** Whether the flag is loading */
	loading: boolean;
	/** Current status */
	status: FlagStatus;
	/** The flag's value */
	value?: boolean | string | number;
	/** Variant for A/B tests */
	variant?: string;
}

/** Context returned by useFlags hook */
export interface FlagsContext {
	/** Get a flag's full state */
	getFlag: (key: string) => FlagState;
	/** Get a flag's value with type safety */
	getValue: <T extends boolean | string | number = boolean>(
		key: string,
		defaultValue?: T
	) => T;
	/** Check if a flag is on (simple boolean) */
	isOn: (key: string) => boolean;
	/** Async fetch a specific flag */
	fetchFlag: (key: string) => Promise<FlagResult>;
	/** Fetch all flags */
	fetchAllFlags: () => Promise<void>;
	/** Update user context */
	updateUser: (user: UserContext) => void;
	/** Refresh all flags */
	refresh: (forceClear?: boolean) => Promise<void>;
	/** Whether the SDK is ready */
	isReady: boolean;
}

/** Storage interface for persistence */
export interface StorageInterface {
	get(key: string): FlagResult | null;
	set(key: string, value: FlagResult): void;
	getAll(): Record<string, FlagResult>;
	setAll(flags: Record<string, FlagResult>): void;
	delete?(key: string): void;
	deleteMultiple?(keys: string[]): void;
	clear(): void;
	cleanupExpired(): void;
}

/** Manager constructor options */
export interface FlagsManagerOptions {
	config: FlagsConfig;
	storage?: StorageInterface;
	onFlagsUpdate?: (flags: Record<string, FlagResult>) => void;
	onConfigUpdate?: (config: FlagsConfig) => void;
	onReady?: () => void;
}

/** Flags manager interface */
export interface FlagsManager {
	getFlag: (key: string, user?: UserContext) => Promise<FlagResult>;
	isEnabled: (key: string) => FlagState;
	getValue: <T = boolean | string | number>(key: string, defaultValue?: T) => T;
	fetchAllFlags: (user?: UserContext) => Promise<void>;
	updateUser: (user: UserContext) => void;
	refresh: (forceClear?: boolean) => Promise<void>;
	updateConfig: (config: FlagsConfig) => void;
	getMemoryFlags: () => Record<string, FlagResult>;
	isReady: () => boolean;
	destroy?: () => void;
}
