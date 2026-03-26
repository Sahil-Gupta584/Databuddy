/** biome-ignore-all lint/correctness/noUnusedImports: we need to import React to use the createContext function */
import React, {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import { BrowserFlagStorage } from "@/core/flags/browser-storage";
import { CoreFlagsManager } from "@/core/flags/flags-manager";
import type {
	FeatureState,
	FlagResult,
	FlagState,
	FlagStatus,
	FlagsConfig,
	FlagsContext,
	UserContext,
} from "@/core/flags/types";
import { logger } from "@/logger";

/** Internal store for flags state */
interface FlagsStore {
	flags: Record<string, FlagResult>;
	isReady: boolean;
}

const FlagsReactContext = createContext<FlagsContext | null>(null);

export interface FlagsProviderProps extends FlagsConfig {
	children: ReactNode;
}

/**
 * Helper to create FlagState from result or loading state
 */
function createFlagState(
	result: FlagResult | undefined,
	isLoading: boolean,
	isPending: boolean
): FlagState {
	if (isPending) {
		return {
			on: false,
			status: "pending",
			loading: true,
		};
	}

	if (isLoading || !result) {
		return {
			on: false,
			status: "loading",
			loading: true,
		};
	}

	const status: FlagStatus = result.reason === "ERROR" ? "error" : "ready";

	return {
		on: result.enabled,
		status,
		loading: false,
		value: result.value,
		variant: result.variant,
	};
}

/**
 * Flags provider component
 * Creates a manager instance and provides flag methods to children
 */
export function FlagsProvider({ children, ...config }: FlagsProviderProps) {
	// Use ref to hold mutable state that doesn't trigger re-renders
	const storeRef = useRef<FlagsStore>({ flags: {}, isReady: false });
	const listenersRef = useRef<Set<() => void>>(new Set());

	// Create manager once (stable reference)
	const manager = useMemo(() => {
		const storage = config.skipStorage ? undefined : new BrowserFlagStorage();

		return new CoreFlagsManager({
			config,
			storage,
			onFlagsUpdate: (flags) => {
				storeRef.current = { ...storeRef.current, flags };
				// Notify all subscribers
				for (const listener of listenersRef.current) {
					listener();
				}
			},
			onReady: () => {
				storeRef.current = { ...storeRef.current, isReady: true };
				for (const listener of listenersRef.current) {
					listener();
				}
			},
		});
	}, [config.clientId]); // Only recreate if clientId changes

	// Update config when props change (isPending, user, etc.)
	const prevConfigRef = useRef(config);
	useEffect(() => {
		const prevConfig = prevConfigRef.current;
		const configChanged =
			prevConfig.apiUrl !== config.apiUrl ||
			prevConfig.isPending !== config.isPending ||
			prevConfig.user?.userId !== config.user?.userId ||
			prevConfig.user?.email !== config.user?.email ||
			prevConfig.environment !== config.environment ||
			prevConfig.disabled !== config.disabled ||
			prevConfig.autoFetch !== config.autoFetch ||
			prevConfig.cacheTtl !== config.cacheTtl ||
			prevConfig.staleTime !== config.staleTime;

		if (configChanged) {
			prevConfigRef.current = config;
			manager.updateConfig(config);
		}
	}, [manager, config]);

	useEffect(() => {
		return () => {
			manager.destroy();
		};
	}, [manager]);

	// Subscribe function for useSyncExternalStore
	const subscribe = useMemo(
		() => (callback: () => void) => {
			listenersRef.current.add(callback);
			return () => {
				listenersRef.current.delete(callback);
			};
		},
		[]
	);

	// Get current snapshot
	const getSnapshot = useMemo(() => () => storeRef.current, []);

	// Subscribe to store updates
	const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	// Build context value
	const contextValue = useMemo<FlagsContext>(
		() => ({
			// Cleaner API: getFlag returns FlagState
			getFlag: (key: string): FlagState => {
				const result = store.flags[key];
				const managerState = manager.isEnabled(key);
				return createFlagState(
					result,
					managerState.loading,
					config.isPending ?? false
				);
			},

			// Simple boolean check
			isOn: (key: string): boolean => {
				const result = store.flags[key];
				if (result) {
					return result.enabled;
				}
				// Check manager cache
				const state = manager.isEnabled(key);
				return state.on;
			},

			// Get typed value
			getValue: <T extends boolean | string | number>(
				key: string,
				defaultValue?: T
			): T => {
				const result = store.flags[key];
				if (result) {
					return result.value as T;
				}
				return manager.getValue(key, defaultValue);
			},

			// Async fetch
			fetchFlag: (key: string) => manager.getFlag(key),

			fetchAllFlags: () => manager.fetchAllFlags(),

			updateUser: (user: UserContext) => manager.updateUser(user),

			refresh: (forceClear = false) => manager.refresh(forceClear),

			isReady: store.isReady,
		}),
		[manager, store, config.isPending]
	);

	return (
		<FlagsReactContext.Provider value={contextValue}>
			{children}
		</FlagsReactContext.Provider>
	);
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Access the full flags context
 * @example
 * const { isOn, getFlag, refresh } = useFlags();
 */
export function useFlags(): FlagsContext {
	const context = useContext(FlagsReactContext);

	if (!context) {
		logger.warn("useFlags called outside FlagsProvider");
		return {
			getFlag: () => createFlagState(undefined, false, false),
			isOn: () => false,
			getValue: <T extends boolean | string | number = boolean>(
				_key: string,
				defaultValue?: T
			) => (defaultValue ?? false) as T,
			fetchFlag: async () => ({
				enabled: false,
				value: false,
				payload: null,
				reason: "NO_PROVIDER",
			}),
			fetchAllFlags: async () => {},
			updateUser: () => {},
			refresh: async () => {},
			isReady: false,
		};
	}

	return context;
}

/**
 * Get a flag's full state with loading/error handling
 * @example
 * const flag = useFlag("my-feature");
 * if (flag.loading) return <Skeleton />;
 * return flag.on ? <NewFeature /> : <OldFeature />;
 */
export function useFlag(key: string): FlagState {
	const { getFlag } = useFlags();
	return getFlag(key);
}

/**
 * Simple feature check - returns { on, loading, value, variant }
 * @example
 * const { on, loading } = useFeature("dark-mode");
 * if (loading) return <Skeleton />;
 * return on ? <DarkTheme /> : <LightTheme />;
 */
export function useFeature(key: string): FeatureState {
	const flag = useFlag(key);
	return {
		on: flag.on,
		loading: flag.loading,
		status: flag.status,
		value: flag.value,
		variant: flag.variant,
	};
}

/**
 * Boolean-only feature check with default value
 * Useful for SSR-safe rendering where you need a boolean immediately
 * @example
 * const isDarkMode = useFeatureOn("dark-mode", false);
 * return isDarkMode ? <DarkTheme /> : <LightTheme />;
 */
export function useFeatureOn(key: string, defaultValue = false): boolean {
	const { isOn, isReady } = useFlags();
	const flag = useFlag(key);

	// Return default while loading
	if (flag.loading || !isReady) {
		return defaultValue;
	}

	return isOn(key);
}

/**
 * Get a flag's typed value
 * @example
 * const maxItems = useFlagValue("max-items", 10);
 * const theme = useFlagValue<"light" | "dark">("theme", "light");
 */
export function useFlagValue<T extends boolean | string | number = boolean>(
	key: string,
	defaultValue?: T
): T {
	const { getValue } = useFlags();
	return getValue(key, defaultValue);
}

/**
 * Get variant for A/B testing
 * @example
 * const variant = useVariant("checkout-experiment");
 * if (variant === "control") return <OldCheckout />;
 * if (variant === "treatment-a") return <NewCheckoutA />;
 * return <NewCheckoutB />;
 */
export function useVariant(key: string): string | undefined {
	const flag = useFlag(key);
	return flag.variant;
}
