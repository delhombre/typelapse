import {
	type LaidOutToken,
	type RawToken,
	clamp01,
	easeInOutCubic,
	frameLineCount,
	layoutFrame,
	renderStatic,
	renderTransition,
} from "@/application/magic-move/engine";
import { describe, expect, it } from "vitest";

function raw(key: string, content: string, offset: number, color = "#fff"): RawToken {
	return { key, content, offset, color };
}

describe("layoutFrame", () => {
	it("places tokens at the line and column of their offset", () => {
		const code = "ab\ncd";
		const tokens = [raw("a", "ab", 0), raw("b", "cd", 3)];

		const [first, second] = layoutFrame(code, tokens);

		expect(first).toMatchObject({ line: 0, col: 0 });
		expect(second).toMatchObject({ line: 1, col: 0 });
	});

	it("accounts for indentation columns", () => {
		const code = "x\n  y";
		const [, indented] = layoutFrame(code, [raw("x", "x", 0), raw("y", "y", 4)]);

		expect(indented).toMatchObject({ line: 1, col: 2 });
	});

	it("expands tabs to the next tab stop", () => {
		const code = "\ty";
		const [token] = layoutFrame(code, [raw("y", "y", 1)], 4);

		expect(token?.col).toBe(4);
	});

	it("drops whitespace-only tokens so only painted glyphs animate", () => {
		const code = "  a";
		const laid = layoutFrame(code, [raw("ws", "  ", 0), raw("a", "a", 2)]);

		expect(laid).toHaveLength(1);
		expect(laid[0]?.content).toBe("a");
	});

	it("preserves color and fontStyle", () => {
		const code = "a";
		const [token] = layoutFrame(code, [
			{ key: "a", content: "a", offset: 0, color: "#f00", fontStyle: 2 },
		]);

		expect(token).toMatchObject({ color: "#f00", fontStyle: 2 });
	});
});

describe("frameLineCount", () => {
	it("counts a single line as one", () => {
		expect(frameLineCount("const x = 1")).toBe(1);
	});

	it("counts newlines including trailing blanks", () => {
		expect(frameLineCount("a\nb\n")).toBe(3);
	});
});

describe("renderStatic", () => {
	it("returns every token fully opaque", () => {
		const laid: LaidOutToken[] = [{ key: "a", content: "a", line: 0, col: 0 }];
		expect(renderStatic(laid)).toEqual([{ key: "a", content: "a", line: 0, col: 0, opacity: 1 }]);
	});
});

describe("renderTransition", () => {
	const from: LaidOutToken[] = [
		{ key: "shared", content: "x", line: 0, col: 0 },
		{ key: "gone", content: "y", line: 1, col: 0 },
	];
	const to: LaidOutToken[] = [
		{ key: "shared", content: "x", line: 2, col: 4 },
		{ key: "new", content: "z", line: 3, col: 0 },
	];

	it("keeps shared tokens at the origin at t=0", () => {
		const shared = renderTransition(from, to, 0).find((t) => t.key === "shared");
		expect(shared).toMatchObject({ line: 0, col: 0, opacity: 1 });
	});

	it("moves shared tokens to the destination at t=1", () => {
		const shared = renderTransition(from, to, 1).find((t) => t.key === "shared");
		expect(shared).toMatchObject({ line: 2, col: 4, opacity: 1 });
	});

	it("interpolates shared token monotonically between endpoints", () => {
		const early = renderTransition(from, to, 0.25).find((t) => t.key === "shared");
		const mid = renderTransition(from, to, 0.5).find((t) => t.key === "shared");
		// Strictly between origin (col 0) and destination (col 4), and advancing.
		expect(early?.col).toBeGreaterThan(0);
		expect(mid?.col).toBeGreaterThan(early?.col ?? 0);
		expect(mid?.col).toBeLessThanOrEqual(4);
	});

	it("fades leaving tokens out fully within the leave window", () => {
		const gone = renderTransition(from, to, 0.4, { leaveEnd: 0.4 }).find((t) => t.key === "gone");
		expect(gone?.opacity).toBeCloseTo(0);
	});

	it("keeps leaving tokens visible at the start", () => {
		const gone = renderTransition(from, to, 0).find((t) => t.key === "gone");
		expect(gone?.opacity).toBe(1);
	});

	it("holds entering tokens invisible until their start", () => {
		const entered = renderTransition(from, to, 0.5, { enterStart: 0.5 }).find(
			(t) => t.key === "new",
		);
		expect(entered?.opacity).toBeCloseTo(0);
	});

	it("fades entering tokens fully in by t=1", () => {
		const entered = renderTransition(from, to, 1).find((t) => t.key === "new");
		expect(entered).toMatchObject({ line: 3, col: 0, opacity: 1 });
	});

	it("staggers moving tokens so earlier ones lead the cascade", () => {
		const start: LaidOutToken[] = [
			{ key: "a", content: "a", line: 0, col: 0 },
			{ key: "b", content: "b", line: 0, col: 2 },
		];
		const end: LaidOutToken[] = [
			{ key: "a", content: "a", line: 0, col: 10 },
			{ key: "b", content: "b", line: 0, col: 12 },
		];
		const out = renderTransition(start, end, 0.5);
		const a = out.find((t) => t.key === "a");
		const b = out.find((t) => t.key === "b");
		const progressA = ((a?.col ?? 0) - 0) / 10;
		const progressB = ((b?.col ?? 0) - 2) / 10;
		expect(progressA).toBeGreaterThan(progressB);
	});

	it("still lands every moving token on target at t=1 despite stagger", () => {
		const start: LaidOutToken[] = [
			{ key: "a", content: "a", line: 0, col: 0 },
			{ key: "b", content: "b", line: 0, col: 2 },
		];
		const end: LaidOutToken[] = [
			{ key: "a", content: "a", line: 1, col: 10 },
			{ key: "b", content: "b", line: 1, col: 12 },
		];
		const out = renderTransition(start, end, 1);
		expect(out.find((t) => t.key === "a")).toMatchObject({ line: 1, col: 10 });
		expect(out.find((t) => t.key === "b")).toMatchObject({ line: 1, col: 12 });
	});
});

describe("math helpers", () => {
	it("clamps to the unit interval", () => {
		expect(clamp01(-1)).toBe(0);
		expect(clamp01(2)).toBe(1);
		expect(clamp01(0.3)).toBe(0.3);
	});

	it("eases symmetrically around the midpoint", () => {
		expect(easeInOutCubic(0)).toBe(0);
		expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
		expect(easeInOutCubic(1)).toBe(1);
	});
});
