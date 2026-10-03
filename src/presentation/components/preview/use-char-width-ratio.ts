import { advanceProbeFont, measureCharWidthRatio } from "@/application/layout/char-advance";
import { useEffect, useState } from "react";

function measure(fontFamily: string, fontSize: number): number {
	const ctx = document.createElement("canvas").getContext("2d");
	return ctx ? measureCharWidthRatio(ctx, fontFamily, fontSize) : Number.NaN;
}

/**
 * The theme font's advance ÷ size as this document resolves it: the number the
 * preview sizes its card on, so the window is exactly as wide as the `ch`-placed
 * glyphs need and as wide as the exporters draw it. Measured on mount (the
 * fallback, if the face is still loading) and again when the face has arrived.
 * NaN when the document has no 2D context, which the caller treats as unknown.
 */
export function useCharWidthRatio(fontFamily: string, fontSize: number): number {
	const [ratio, setRatio] = useState(() => measure(fontFamily, fontSize));
	useEffect(() => {
		let live = true;
		setRatio(measure(fontFamily, fontSize));
		document.fonts
			?.load(advanceProbeFont(fontFamily, fontSize), "0")
			.catch(() => undefined)
			.then(() => {
				if (live) {
					setRatio(measure(fontFamily, fontSize));
				}
			});
		return () => {
			live = false;
		};
	}, [fontFamily, fontSize]);
	return ratio;
}
