import { contrastRatio } from "@/application/accessibility/token-contrast";
import { CAPTION_PLATE_ALPHA } from "@/application/captions/caption-plate";
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
		<StepCaption text={EIGHTY} opacity={1} scale={scale} lines={lines} />,
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

	describe("the plate it is read on (#226)", () => {
		/** The `rgba(r, g, b, a)` jsdom gives back, as r, g, b and the alpha. */
		const channels = (color: string): number[] => (color.match(/[\d.]+/g) ?? []).map(Number);

		it("paints the island's dark plate and the paper's ink, whatever the background", () => {
			const { line } = band(1, 2);

			const [red, green, blue, alpha = 1] = channels(line.style.backgroundColor);
			expect([red, green, blue]).toEqual([0x15, 0x15, 0x17]);
			expect(alpha).toBeCloseTo(CAPTION_PLATE_ALPHA, 2);
			expect(channels(line.style.color)).toEqual([0xfa, 0xf9, 0xf6]);
		});

		it("measures 4.5:1 over the default mesh's lightest region, as drawn", () => {
			const { line } = band(1, 1);
			const [red = 0, green = 0, blue = 0, alpha = 1] = channels(line.style.backgroundColor);
			// What the eye gets at the lightest point of the default mesh: the plate
			// as painted, laid over the brand's yellow.
			const ground = [0xf1, 0xbe, 0x01];
			const under = [red, green, blue].map((plate, index) =>
				Math.round((ground[index] ?? 0) * (1 - alpha) + plate * alpha),
			);
			const hex = `#${under.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
			const ink = `#${channels(line.style.color)
				.map((value) => value.toString(16).padStart(2, "0"))
				.join("")}`;

			expect(contrastRatio(ink, hex)).toBeGreaterThanOrEqual(4.5);
		});

		it("fades the plate with the words: one opacity for both", () => {
			const { container } = render(<StepCaption text="hi" opacity={0.4} lines={1} />);
			const line = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;

			expect(line.style.opacity).toBe("0.4");
		});

		it("adds no width to the wrap: the plate's padding is taken back by its margin", () => {
			const { line } = band(2.2, 1);
			const padding = Number.parseFloat(line.style.paddingLeft);

			expect(padding).toBeGreaterThan(0);
			expect(Number.parseFloat(line.style.marginLeft)).toBeCloseTo(-padding, 6);
			expect(Number.parseFloat(line.style.marginRight)).toBeCloseTo(-padding, 6);
			expect(line.style.boxSizing).toBe("border-box");
		});

		it("keeps the plate inside the band, as tall as its own lines and not the band's", () => {
			const { box, line } = band(1, 2);

			expect(box.style.alignItems).toBe("flex-start");
			expect(Number.parseFloat(line.style.paddingTop)).toBe(0);
			expect(Number.parseFloat(line.style.paddingBottom)).toBe(0);
			expect(Number.parseFloat(box.style.height)).toBe(40);
			expect(line.style.overflow).toBe("hidden");
		});

		it("scales with the video, like the type", () => {
			const small = band(1, 1).line;
			const large = band(2.2, 1).line;

			expect(Number.parseFloat(large.style.paddingLeft)).toBeCloseTo(
				Number.parseFloat(small.style.paddingLeft) * 2.2,
				6,
			);
			expect(Number.parseFloat(large.style.borderRadius)).toBeCloseTo(
				Number.parseFloat(small.style.borderRadius) * 2.2,
				6,
			);
		});
	});

	it("takes the lines a short caption on a wide card needs: one", () => {
		const lines = captionBandLines(["Reads the config"], 600, 1);
		const { box } = band(1, lines);

		expect(lines).toBe(1);
		expect(
			Number.parseFloat(box.style.marginTop) + Number.parseFloat(box.style.height),
		).toBeCloseTo(captionBlockHeight(1, 1), 6);
	});
});
