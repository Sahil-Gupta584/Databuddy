import { type ComputedRef, computed, ref, watchEffect } from "vue";
import type { FlagState } from "@/core/flags/types";
import { useFlags } from "./flags-plugin";

export interface UseFlagReturn {
	/** Whether the flag is on */
	on: ComputedRef<boolean>;
	/** Whether the flag is loading */
	loading: ComputedRef<boolean>;
	/** Full flag state */
	state: ComputedRef<FlagState>;
}

const defaultState: FlagState = {
	on: false,
	status: "loading",
	loading: true,
};

/**
 * Vue composable for individual flag usage with reactivity
 */
export function useFlag(key: string): UseFlagReturn {
	const { getFlag } = useFlags();
	const flagState = ref<FlagState>(defaultState);

	watchEffect(() => {
		flagState.value = getFlag(key);
	});

	return {
		on: computed(() => flagState.value.on),
		loading: computed(() => flagState.value.loading),
		state: computed(() => flagState.value),
	};
}
