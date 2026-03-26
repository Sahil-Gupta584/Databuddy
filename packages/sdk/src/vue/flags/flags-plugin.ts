import { type App, reactive } from "vue";
import { BrowserFlagStorage } from "@/core/flags/browser-storage";
import { CoreFlagsManager } from "@/core/flags/flags-manager";
import type { FlagResult, FlagState, FlagsConfig } from "@/core/flags/types";

const FLAGS_SYMBOL = Symbol("flags");

interface VueFlagsState {
	memoryFlags: Record<string, FlagResult>;
	pendingFlags: Set<string>;
}

let globalState: VueFlagsState | null = null;
let globalManager: CoreFlagsManager | null = null;

export interface FlagsPluginOptions extends FlagsConfig {}

export function createFlagsPlugin(options: FlagsPluginOptions) {
	return {
		install(app: App) {
			const storage = options.skipStorage
				? undefined
				: new BrowserFlagStorage();

			const state = reactive<VueFlagsState>({
				memoryFlags: {},
				pendingFlags: new Set(),
			});

			const manager = new CoreFlagsManager({
				config: options,
				storage,
				onFlagsUpdate: (flags) => {
					state.memoryFlags = flags;
				},
			});

			globalManager = manager;
			globalState = state;

			app.provide(FLAGS_SYMBOL, state);
		},
	};
}

export function useFlags() {
	if (!globalState) {
		throw new Error(
			"Flags plugin not installed. Install with app.use(createFlagsPlugin(config))"
		);
	}

	if (!globalManager) {
		throw new Error(
			"Flags manager not initialized. Please reinstall the plugin."
		);
	}

	const state = globalState;
	const manager = globalManager;

	const getFlag = (key: string): FlagState => manager.isEnabled(key);

	const fetchAllFlags = () => manager.fetchAllFlags();

	const updateUser = (user: FlagsConfig["user"]) => {
		if (user) {
			manager.updateUser(user);
		}
	};

	const refresh = (forceClear = false): void => {
		manager.refresh(forceClear);
	};

	const updateConfig = (config: FlagsConfig): void => {
		manager.updateConfig(config);
	};

	return {
		getFlag,
		fetchAllFlags,
		updateUser,
		refresh,
		updateConfig,
		memoryFlags: state.memoryFlags,
	};
}
