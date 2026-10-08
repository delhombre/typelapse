import {
	type FrameBox,
	type StageFrameInput,
	stageFrameBox,
} from "@/application/layout/stage-frame";
import { useLayoutEffect, useState } from "react";

/** The window as the layout math wants it: its size and its top and bottom safe areas. */
function readWindow(probe: HTMLElement): StageFrameInput {
	const style = getComputedStyle(probe);
	return {
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		safeTop: Number.parseFloat(style.paddingTop) || 0,
		safeBottom: Number.parseFloat(style.paddingBottom) || 0,
		safeLeft: Number.parseFloat(style.paddingLeft) || 0,
		safeRight: Number.parseFloat(style.paddingRight) || 0,
	};
}

/**
 * The studio's frame box for the window as it is now, and as it becomes.
 *
 * `env(safe-area-inset-*)` has no JavaScript API, so a probe element is padded
 * by it and measured, as the phone shell does (`use-phone-viewport.ts`). That
 * hook also watches the probe with a ResizeObserver; this one is the stand-in
 * for the studio while it loads, and a stand-in must not fail, so it asks only
 * for what every browser the studio runs in has: the resize event, which a
 * rotation also fires. A resize while the chunk is still on the way moves the
 * outline's frame with the room, as it would the studio's.
 */
export function useStageFrame(): FrameBox {
	const [viewport, setViewport] = useState<StageFrameInput>(() => ({
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		safeTop: 0,
		safeBottom: 0,
	}));

	useLayoutEffect(() => {
		const probe = document.createElement("div");
		probe.setAttribute("aria-hidden", "true");
		probe.style.cssText =
			"position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;" +
			"padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) " +
			"env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
		document.body.append(probe);
		const update = () =>
			setViewport((previous) => {
				const next = readWindow(probe);
				return next.viewportWidth === previous.viewportWidth &&
					next.viewportHeight === previous.viewportHeight &&
					next.safeTop === previous.safeTop &&
					next.safeBottom === previous.safeBottom &&
					next.safeLeft === previous.safeLeft &&
					next.safeRight === previous.safeRight
					? previous
					: next;
			});
		update();
		window.addEventListener("resize", update);
		return () => {
			window.removeEventListener("resize", update);
			probe.remove();
		};
	}, []);

	return stageFrameBox(viewport);
}
