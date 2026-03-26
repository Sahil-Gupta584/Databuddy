import type { BaseTracker } from "../core/tracker";
import { updateMaxScrollDepth } from "./scroll-depth-math";

export function initScrollDepthTracking(tracker: BaseTracker) {
	if (tracker.isServer()) {
		return;
	}

	window.addEventListener(
		"scroll",
		() => {
			tracker.maxScrollDepth = updateMaxScrollDepth(
				tracker.maxScrollDepth,
				window.scrollY,
				document.documentElement.scrollHeight,
				window.innerHeight
			);
		},
		{ passive: true }
	);
}
