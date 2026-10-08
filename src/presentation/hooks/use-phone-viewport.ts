import type { PhoneSheetInput } from "@/application/layout/phone-sheet";
import { useLayoutEffect, useState } from "react";

/** The window and its safe areas; the export's shape is the shell's to add. */
export type PhoneViewport = Required<Omit<PhoneSheetInput, "aspect">>;

const read = (probe: HTMLElement): PhoneViewport => {
	const style = getComputedStyle(probe);
	return {
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		safeTop: Number.parseFloat(style.paddingTop) || 0,
		safeBottom: Number.parseFloat(style.paddingBottom) || 0,
		safeLeft: Number.parseFloat(style.paddingLeft) || 0,
		safeRight: Number.parseFloat(style.paddingRight) || 0,
	};
};

const same = (a: PhoneViewport, b: PhoneViewport) =>
	a.viewportWidth === b.viewportWidth &&
	a.viewportHeight === b.viewportHeight &&
	a.safeTop === b.safeTop &&
	a.safeBottom === b.safeBottom &&
	a.safeLeft === b.safeLeft &&
	a.safeRight === b.safeRight;

/**
 * The phone's size and its four safe areas, in CSS pixels.
 *
 * `env(safe-area-inset-*)` has no JavaScript API, so a probe element is padded
 * by it and measured. The probe's size follows the insets, so a rotation that
 * moves the notch reaches the sheet even when no resize event says so.
 */
export function usePhoneViewport(): PhoneViewport {
	const [viewport, setViewport] = useState<PhoneViewport>(() => ({
		viewportWidth: typeof window === "undefined" ? 0 : window.innerWidth,
		viewportHeight: typeof window === "undefined" ? 0 : window.innerHeight,
		safeTop: 0,
		safeBottom: 0,
		safeLeft: 0,
		safeRight: 0,
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
				const next = read(probe);
				return same(next, previous) ? previous : next;
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
