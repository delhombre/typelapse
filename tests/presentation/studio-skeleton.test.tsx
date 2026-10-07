import { stageFrameBox } from "@/application/layout/stage-frame";
import { StudioSkeleton } from "@/presentation/studio/studio-skeleton";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #226: the outline drew its frame at sizes of its own (692x390 where the studio
 * puts 576x324 at 1280x800), so the studio arrived 17% smaller than what it
 * replaced. Its frame is now the shells' layout math at the window it is in.
 *
 * The boxes below are what the real studio measured (tests/e2e/
 * studio-boot-weight.spec.ts reads the studio's own at the same four windows).
 */

const STUDIO: readonly (readonly [number, number, number[]])[] = [
	[1280, 800, [352, 130, 576, 324]],
	[1440, 900, [343.11, 130, 753.77, 424]],
	[1366, 650, [430.56, 96, 504.88, 284]],
	[390, 844, [40, 276.81, 310, 174.38]],
];

function setWindow(width: number, height: number) {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
	Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function frameBox(): number[] {
	const frame = document.querySelector<HTMLElement>(".sk-frame");
	if (!frame) {
		throw new Error("the outline drew no frame");
	}
	return [frame.style.left, frame.style.top, frame.style.width, frame.style.height].map(
		Number.parseFloat,
	);
}

afterEach(cleanup);

describe("the studio's outline", () => {
	for (const [width, height, studio] of STUDIO) {
		it(`draws its frame where the studio's is at ${width}x${height}`, () => {
			setWindow(width, height);
			render(<StudioSkeleton />);
			const box = frameBox();
			studio.forEach((expected, index) => {
				expect(box[index]).toBeCloseTo(expected, 1);
			});
		});
	}

	it("takes its box from the layout math, not from the stylesheet", () => {
		setWindow(1366, 650);
		render(<StudioSkeleton />);
		const expected = stageFrameBox({
			viewportWidth: 1366,
			viewportHeight: 650,
			safeTop: 0,
			safeBottom: 0,
		});
		expect(frameBox()).toEqual([expected.left, expected.top, expected.width, expected.height]);
	});

	it("follows the window while the studio is still on its way", () => {
		setWindow(1280, 800);
		render(<StudioSkeleton />);
		expect(frameBox()[2]).toBeCloseTo(576, 1);

		setWindow(1440, 900);
		act(() => {
			window.dispatchEvent(new Event("resize"));
		});
		expect(frameBox()[2]).toBeCloseTo(753.77, 1);
	});

	it("needs nothing a browser might lack: it is what stands in while the studio loads", () => {
		vi.stubGlobal("ResizeObserver", undefined);
		setWindow(1280, 800);
		render(<StudioSkeleton />);
		expect(frameBox()[2]).toBeCloseTo(576, 1);
		vi.unstubAllGlobals();
	});

	it("leaves nothing behind when it gives way to the studio", () => {
		setWindow(1280, 800);
		// The probe that reads the safe areas is appended to the body, outside React.
		const probes = () => document.body.querySelectorAll(":scope > div[aria-hidden='true']");
		const { unmount } = render(<StudioSkeleton />);
		expect(probes()).toHaveLength(1);
		unmount();
		expect(probes()).toHaveLength(0);
	});

	it("is announced as a status and hides its shapes from assistive technology", () => {
		setWindow(1280, 800);
		const { getByRole } = render(<StudioSkeleton />);
		expect(getByRole("status", { name: "Loading the studio" })).toBeTruthy();
		expect(document.querySelector(".sk-frame")?.getAttribute("aria-hidden")).toBe("true");
	});
});
