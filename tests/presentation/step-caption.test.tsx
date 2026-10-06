import { captionBandLines, captionBlockHeight } from "@/application/layout/frame-metrics";
import { StepCaption } from "@/presentation/components/preview/step-caption";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

const EIGHTY = "Sanity checks the reconciled workspace membership invitations table.".padEnd(
	80,
	".",
);
/** The narrow card of the ticket: 221px of window under a 13px caption. */
const NARROW_WIDTH = 221;

function band(scale: number, lines: number) {
	const { container } = render(
		<StepCaption text={EIGHTY} opacity={1} color="#fff" scale={scale} lines={lines} />,
	);
	const box = container.firstElementChild as HTMLElement;
	const line = box.firstElementChild as HTMLElement;
	return { box, line };
}

describe("the step caption", () => {
	it("wraps to the lines it is given instead of cutting flat at the card's edge", () => {
		const { box, line } = band(1, 2);

		expect(box.style.whiteSpace).not.toBe("nowrap");
		expect(line.style.whiteSpace).not.toBe("nowrap");
		expect(line.textContent).toBe(EIGHTY);
		expect(line.style.getPropertyValue("-webkit-line-clamp")).toBe("2");
		expect(line.style.overflow).toBe("hidden");
	});

	it("keeps a one-line caption to one line, with the band it always had", () => {
		const { box, line } = band(1, 1);

		expect(line.style.getPropertyValue("-webkit-line-clamp")).toBe("1");
		expect(Number.parseFloat(box.style.height)).toBe(20);
	});

	it.each([1, 2.2])(
		"is cut at the same count the band function reserves for the 80-character caption, at scale %s",
		(scale) => {
			const lines = captionBandLines([EIGHTY], NARROW_WIDTH * scale, scale);
			const { box, line } = band(scale, lines);

			expect(lines).toBe(2);
			expect(line.style.getPropertyValue("-webkit-line-clamp")).toBe(String(lines));
			// The painter, the preview and the video all fit the card around this one
			// number: the margin above the band plus the band itself.
			const taken = Number.parseFloat(box.style.marginTop) + Number.parseFloat(box.style.height);
			expect(taken).toBeCloseTo(captionBlockHeight(lines, scale), 6);
		},
	);

	it("takes the lines a short caption on a wide card needs: one", () => {
		const lines = captionBandLines(["Reads the config"], 600, 1);
		const { box } = band(1, lines);

		expect(lines).toBe(1);
		expect(
			Number.parseFloat(box.style.marginTop) + Number.parseFloat(box.style.height),
		).toBeCloseTo(captionBlockHeight(1, 1), 6);
	});
});
