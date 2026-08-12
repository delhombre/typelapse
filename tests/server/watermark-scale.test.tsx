/**
 * The watermark has to grow with the resolution tier, like everything else drawn
 * at video size.
 *
 * `renderScaleFor` grows the draw scale with the canvas's short edge so a tier
 * buys pixels without reframing the shot: the card, the caption and the progress
 * bar all take that factor. A watermark pinned to fixed pixels opts out of it, so
 * the higher the tier the smaller the mark reads — at 4K it lands at half the
 * size, and half the inset from the corner, that it has at 1080p.
 *
 * The reference tier (1080p) must stay pixel-identical: `REFERENCE_SHORT_EDGE`
 * promises every export that predates resolution tiers is unchanged.
 */

import { renderScaleFor } from "@/application/layout/canvas-fit";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BASE_VIDEO_SCALE, WatermarkOverlay } from "../../server/remotion/composition";

/** The watermark's declared geometry, in pixels. */
function geometryAt(scale: number) {
	const { container } = render(
		<WatermarkOverlay text="@typelapse" color="#fff" fontFamily="monospace" scale={scale} />,
	);
	const el = container.firstElementChild as HTMLElement;
	return {
		fontSize: Number.parseFloat(el.style.fontSize),
		bottom: Number.parseFloat(el.style.bottom),
		right: Number.parseFloat(el.style.right),
	};
}

describe("WatermarkOverlay scales with the resolution tier", () => {
	const at1080p = renderScaleFor(1920, 1080, BASE_VIDEO_SCALE);
	const at4K = renderScaleFor(3840, 2160, BASE_VIDEO_SCALE);

	it("leaves the reference tier's geometry exactly as it was", () => {
		expect(geometryAt(at1080p)).toEqual({ fontSize: 22, bottom: 48, right: 56 });
	});

	it("doubles every dimension when the short edge doubles", () => {
		const base = geometryAt(at1080p);
		const uhd = geometryAt(at4K);

		expect(uhd.fontSize).toBeCloseTo(base.fontSize * 2, 5);
		expect(uhd.bottom).toBeCloseTo(base.bottom * 2, 5);
		expect(uhd.right).toBeCloseTo(base.right * 2, 5);
	});

	it("scales by the short edge, so a vertical 4K export matches a wide one", () => {
		// 2160x3840 is the same tier as 3840x2160, just rotated.
		const vertical = geometryAt(renderScaleFor(2160, 3840, BASE_VIDEO_SCALE));

		expect(vertical).toEqual(geometryAt(at4K));
	});
});
