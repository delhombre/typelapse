import { captionBlockHeight } from "@/application/layout/frame-metrics";
import { StepCaption } from "@/presentation/components/preview/step-caption";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

const EIGHTY = "Sanity checks the reconciled workspace membership invitations table.".padEnd(
	80,
	".",
);

function band(scale: number) {
	const { container } = render(
		<StepCaption text={EIGHTY} opacity={1} color="#fff" scale={scale} />,
	);
	const box = container.firstElementChild as HTMLElement;
	const line = box.firstElementChild as HTMLElement;
	return { box, line };
}

describe("the step caption", () => {
	it("wraps to the card instead of staying on one line and cutting at its edge", () => {
		const { box, line } = band(1);

		expect(box.style.whiteSpace).not.toBe("nowrap");
		expect(line.style.whiteSpace).not.toBe("nowrap");
		expect(line.textContent).toBe(EIGHTY);
		expect(line.style.getPropertyValue("-webkit-line-clamp")).toBe("2");
		expect(line.style.overflow).toBe("hidden");
	});

	it.each([1, 2.2])("takes exactly the band the layout reserves, at scale %s", (scale) => {
		const { box } = band(scale);

		// The painter, the preview and the video all fit the card around this one
		// number: the margin above the band plus the band itself.
		const reserved = captionBlockHeight(true, scale);
		const taken = Number.parseFloat(box.style.marginTop) + Number.parseFloat(box.style.height);
		expect(taken).toBeCloseTo(reserved, 6);
	});

	it("reserves two lines, so the line height is a half of the band", () => {
		const { box, line } = band(1);

		expect(Number.parseFloat(box.style.height)).toBe(2 * Number.parseFloat(line.style.lineHeight));
	});
});
