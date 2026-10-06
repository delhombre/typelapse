import type { PhoneSheetInput } from "@/application/layout/phone-sheet";
import { useLayoutEffect, useState } from "react";

const read = (probe: HTMLElement): PhoneSheetInput => {
	const style = getComputedStyle(probe);
	return {
		viewportHeight: window.innerHeight,
		safeTop: Number.parseFloat(style.paddingTop) || 0,
		safeBottom: Number.parseFloat(style.paddingBottom) || 0,
	};
};

/**
 * The phone's height and its top and bottom safe areas, in CSS pixels.
 *
 * `env(safe-area-inset-*)` has no JavaScript API, so a probe element is padded
 * by it and measured. The probe's size follows the insets, so a rotation that
 * moves the notch reaches the sheet even when no resize event says so.
 */
export function usePhoneViewport(): PhoneSheetInput {
	const [viewport, setViewport] = useState<PhoneSheetInput>(() => ({
		viewportHeight: typeof window === "undefined" ? 0 : window.innerHeight,
		safeTop: 0,
		safeBottom: 0,
	}));

	useLayoutEffect(() => {
		const probe = document.createElement("div");
		probe.setAttribute("aria-hidden", "true");
		probe.style.cssText =
			"position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;" +
			"padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
		document.body.append(probe);
		const update = () =>
			setViewport((previous) => {
				const next = read(probe);
				return next.viewportHeight === previous.viewportHeight &&
					next.safeTop === previous.safeTop &&
					next.safeBottom === previous.safeBottom
					? previous
					: next;
			});
		update();
		const observer = new ResizeObserver(update);
		observer.observe(probe);
		window.addEventListener("resize", update);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
			probe.remove();
		};
	}, []);

	return viewport;
}
