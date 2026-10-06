import { CHROME_STYLE, type ChromeVariant } from "@/application/layout/frame-metrics";
import {
	ELLIPSIS,
	fitTitleToCapacity,
	windowTitle,
	windowTitleAdvance,
	windowTitleCapacity,
	windowTitleRoom,
} from "@/application/layout/window-title";
import { describe, expect, it } from "vitest";

const PR_TITLE = "fix(trie-router): count every slash a pattern consumes";
const BARS: Exclude<ChromeVariant, "none">[] = ["macos", "browser", "terminal"];

/** The window width that leaves a bar exactly `chars` characters of title. */
function widthFor(chrome: ChromeVariant, chars: number, unit: number): number {
	// Room is affine in the window width (the browser pill takes a share of it),
	// so two probes give the line and the line gives the width.
	const low = windowTitleRoom(chrome, 0, unit);
	const slope = windowTitleRoom(chrome, 1000 * unit, unit) - low;
	return ((chars * windowTitleAdvance(chrome, unit) - low) * 1000 * unit) / slope;
}

describe("fitTitleToCapacity", () => {
	it("keeps a title that fits", () => {
		expect(fitTitleToCapacity("demo.ts", 20)).toBe("demo.ts");
	});

	it("keeps a title that fills the room exactly", () => {
		expect(fitTitleToCapacity("demo.ts", 7)).toBe("demo.ts");
	});

	it("gives the last slot to the ellipsis when one character is over", () => {
		expect(fitTitleToCapacity("demo.tsx", 7)).toBe(`demo.t${ELLIPSIS}`);
	});

	it("draws the ellipsis alone when it is all the room there is", () => {
		expect(fitTitleToCapacity("demo.ts", 1)).toBe(ELLIPSIS);
	});

	it("draws nothing when there is no room, and nothing for no title", () => {
		expect(fitTitleToCapacity("demo.ts", 0)).toBe("");
		expect(fitTitleToCapacity("demo.ts", -3)).toBe("");
		expect(fitTitleToCapacity("", 12)).toBe("");
	});

	it("does not leave a space in front of the ellipsis", () => {
		expect(fitTitleToCapacity("count every slash", 7)).toBe(`count${ELLIPSIS}`);
	});

	it("never cuts a character in half", () => {
		expect(fitTitleToCapacity("a😀😀😀", 3)).toBe(`a😀${ELLIPSIS}`);
	});
});

describe.each(BARS)("windowTitle: %s", (chrome) => {
	it("keeps a title the bar has room for", () => {
		expect(windowTitle("demo.ts", chrome, widthFor(chrome, 7, 1), 1)).toBe("demo.ts");
		expect(windowTitle("demo.ts", chrome, 2000, 1)).toBe("demo.ts");
	});

	it("ellipsises at the last character that fits, one over included", () => {
		expect(windowTitle("demo.tsx", chrome, widthFor(chrome, 7, 1), 1)).toBe(`demo.t${ELLIPSIS}`);
		expect(windowTitleCapacity(chrome, widthFor(chrome, 7, 1), 1)).toBe(7);
	});

	it("is one line whatever its length, and never longer than the room", () => {
		const long = "so that ".repeat(15);
		const drawn = windowTitle(long, chrome, widthFor(chrome, 30, 1), 1);
		expect(drawn).not.toContain("\n");
		expect(Array.from(drawn)).toHaveLength(30);
		expect(drawn.endsWith(ELLIPSIS)).toBe(true);
	});

	it("draws an empty title as an empty string", () => {
		expect(windowTitle("", chrome, 1000, 1)).toBe("");
	});

	it("draws nothing in a window too narrow for the bar's own furniture", () => {
		expect(windowTitle("demo.ts", chrome, 10, 1)).toBe("");
	});

	it("gives the same characters at every scale", () => {
		for (const unit of [1, 2.2, 4.4]) {
			expect(windowTitle(PR_TITLE, chrome, widthFor(chrome, 30, 1) * unit, unit)).toBe(
				windowTitle(PR_TITLE, chrome, widthFor(chrome, 30, 1), 1),
			);
		}
	});
});

describe("the bars' own furniture", () => {
	it("macos: three lights and their gaps, the title's margin, and both paddings", () => {
		const bar = CHROME_STYLE.macos;
		expect(windowTitleRoom("macos", 500, 1)).toBeCloseTo(
			500 - 2 * bar.padX - 3 * bar.dot - 4 * bar.gap,
			9,
		);
	});

	it("terminal: the prompt glyph, one gap, and both paddings", () => {
		const bar = CHROME_STYLE.terminal;
		expect(windowTitleRoom("terminal", 500, 1)).toBeCloseTo(
			500 - 2 * bar.padX - bar.promptSize * 0.6 - bar.gap,
			9,
		);
	});

	it("browser: 72% of what the chevrons and the spacer leave, less the pill's padding", () => {
		const bar = CHROME_STYLE.browser;
		const chevrons = 2 * bar.chevronSize * 0.6 + bar.chevronGap;
		const flex = 500 - 2 * bar.padX - chevrons - bar.spacer - 2 * bar.gap;
		expect(windowTitleRoom("browser", 500, 1)).toBeCloseTo(
			bar.pillMaxWidth * flex - 2 * bar.pillPadX,
			9,
		);
	});

	it("none has no title at all", () => {
		expect(windowTitle("demo.ts", "none", 1000, 1)).toBe("");
	});
});

describe("the 54-character PR title", () => {
	it("is whole in a wide window and one ellipsised line in a narrow one", () => {
		expect(PR_TITLE).toHaveLength(54);
		expect(windowTitle(PR_TITLE, "macos", widthFor("macos", 54, 1), 1)).toBe(PR_TITLE);
		const narrow = windowTitle(PR_TITLE, "macos", widthFor("macos", 40, 1), 1);
		expect(Array.from(narrow)).toHaveLength(40);
		expect(narrow).toBe(`${PR_TITLE.slice(0, 39)}${ELLIPSIS}`);
	});
});
