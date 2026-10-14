import {
	type LaidOutToken,
	type RawToken,
	clamp01,
	easeInOutCubic,
	frameLineCount,
	gridPositions,
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

/**
 * The sample from #188: CJK and an emoji are two cells wide in a monospace
 * face, a decomposed-free Latin accent is one. Offsets are UTF-16 indices, the
 * way Shiki reports them; columns are display cells.
 */
const WIDE_SAMPLE = 'const msg = "こんにちは世界 🚀 naïve café";';
const WIDE_CONTENT = "こんにちは世界 🚀 naïve café";

function wideSampleTokens(): RawToken[] {
	const close = 13 + WIDE_CONTENT.length;
	return [
		raw("const", "const", 0),
		raw("msg", "msg", 6),
		raw("eq", "=", 10),
		raw("open", '"', 12),
		raw("text", WIDE_CONTENT, 13),
		raw("close", '"', close),
		raw("semi", ";", close + 1),
	];
}

describe("layoutFrame with wide characters", () => {
	it('starts the `;` on the cell after `café"`, counting CJK and emoji twice', () => {
		const laid = layoutFrame(WIDE_SAMPLE, wideSampleTokens());
		const col = (key: string) => laid.find((token) => token.key === key)?.col;

		expect(col("text")).toBe(13);
		// 7 ideographs and kana (14) + space + rocket (2) + space + "naïve café" (10)
		expect(col("close")).toBe(13 + 28);
		expect(col("semi")).toBe(13 + 28 + 1);
	});

	it("never places the half of a surrogate pair on a column of its own", () => {
		const positions = gridPositions("a🚀b");
		expect(positions.map((pos) => pos.col)).toEqual([0, 1, 1, 3, 4]);
	});

	it("starts the next line after a newline that follows a dangling joiner", () => {
		const positions = gridPositions("x\u200d\ny");
		expect(positions[3]).toEqual({ line: 1, col: 0 });
	});

	it("puts a quote after a dangling joiner on a cell of its own", () => {
		// `"`, the man (two cells, the joiner on it), `"`, `;`.
		const positions = gridPositions('"👨\u200d";');
		expect(positions.map((pos) => pos.col)).toEqual([0, 1, 1, 1, 3, 4, 5]);
	});

	it("keeps a decomposed accent on its letter", () => {
		const positions = gridPositions("e\u0301x");
		expect(positions.map((pos) => pos.col)).toEqual([0, 0, 1, 2]);
	});
});

describe("renderTransition with wide characters", () => {
	it("glides a shared token from its cell column to its new one", () => {
		const from = layoutFrame('a = "世界";', [
			raw("a", "a", 0),
			raw("eq", "=", 2),
			raw("str", '"世界"', 4),
			raw("semi", ";", 8),
		]);
		const to = layoutFrame('abc = "世界";', [
			raw("abc", "abc", 0),
			raw("eq", "=", 4),
			raw("str", '"世界"', 6),
			raw("semi", ";", 10),
		]);
		const semi = (t: number) =>
			renderTransition(from, to, t, { stagger: 0 }).find((token) => token.key === "semi");

		// `"世界"` is six cells: the `;` sits at 4 + 6 and then 6 + 6.
		expect(semi(0)?.col).toBe(10);
		expect(semi(1)?.col).toBe(12);
		const mid = semi(0.3)?.col ?? 0;
		expect(mid).toBeGreaterThan(10);
		expect(mid).toBeLessThan(12);
		expect(semi(0.3)?.opacity).toBe(1);
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

	it("keeps opacities finite when a custom timing sets leaveEnd to 0", () => {
		// Divide-by-zero guard: at t=0 progress/leaveEnd would be 0/0 = NaN.
		for (const t of [0, 0.5, 1]) {
			for (const token of renderTransition(from, to, t, { leaveEnd: 0 })) {
				expect(Number.isFinite(token.opacity)).toBe(true);
			}
		}
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

describe("renderStatic with line focus", () => {
	const laid: LaidOutToken[] = [
		{ key: "a", content: "a", line: 0, col: 0 }, // display line 1
		{ key: "b", content: "b", line: 1, col: 0 }, // display line 2
	];

	it("dims tokens on non-focused lines to 0.25", () => {
		const out = renderStatic(laid, new Set([1]));
		expect(out.find((t) => t.key === "a")?.opacity).toBe(1);
		expect(out.find((t) => t.key === "b")?.opacity).toBe(0.25);
	});

	it("leaves every token fully opaque when the focus set is empty", () => {
		const out = renderStatic(laid, new Set());
		expect(out.every((t) => t.opacity === 1)).toBe(true);
	});

	it("is identical to the unfocused output when focus is undefined", () => {
		expect(renderStatic(laid)).toEqual(renderStatic(laid, undefined));
		expect(renderStatic(laid).every((t) => t.opacity === 1)).toBe(true);
	});
});

describe("renderTransition with nothing shared (a scene break, #280)", () => {
	const from: LaidOutToken[] = [{ key: "out:a", content: "a", line: 0, col: 0 }];
	const to: LaidOutToken[] = [{ key: "in:b", content: "b", line: 2, col: 0 }];
	const opacity = (t: number, key: string, timing = {}) =>
		renderTransition(from, to, t, timing).find((token) => token.key === key)?.opacity ?? -1;

	it("overlaps the two fades, so the card is never empty", () => {
		for (let t = 0; t <= 1; t += 0.01) {
			expect(Math.max(opacity(t, "out:a"), opacity(t, "in:b"))).toBeGreaterThan(0.24);
		}
	});

	it("fades the old frame out linearly by 0.6, the new one in from 0.4", () => {
		expect(opacity(0.3, "out:a")).toBeCloseTo(0.5);
		expect(opacity(0.6, "out:a")).toBeCloseTo(0);
		expect(opacity(0.4, "in:b")).toBeCloseTo(0);
		expect(opacity(0.41, "in:b")).toBeGreaterThan(0);
		expect(opacity(1, "in:b")).toBe(1);
	});

	it("lets an explicit timing win over the overlap", () => {
		expect(opacity(0.34, "out:a", { leaveEnd: 0.34 })).toBeCloseTo(0);
	});

	it("keeps the two-beat timing when one token is shared", () => {
		const shared = { key: "s", content: "s", line: 1, col: 0 };
		const gone = renderTransition([...from, shared], [...to, shared], 0.34).find(
			(token) => token.key === "out:a",
		);
		expect(gone?.opacity).toBeCloseTo(0);
	});

	it("keeps the two-beat timing when a side is empty: nothing overlaps", () => {
		const entering = renderTransition([], to, 0.5).find((token) => token.key === "in:b");
		expect(entering?.opacity).toBe(0);
	});
});

describe("renderTransition with line focus", () => {
	const from: LaidOutToken[] = [
		{ key: "shared", content: "x", line: 0, col: 0 }, // display line 1
		{ key: "gone", content: "y", line: 1, col: 0 }, // display line 2
	];
	const to: LaidOutToken[] = [
		{ key: "shared", content: "x", line: 2, col: 0 }, // display line 3
		{ key: "new", content: "z", line: 3, col: 0 }, // display line 4
	];

	it("produces identical output to today when no focus is supplied", () => {
		expect(renderTransition(from, to, 0.5)).toEqual(
			renderTransition(from, to, 0.5, {}, undefined, undefined),
		);
	});

	it("dims a leaving token by its fromFocus line", () => {
		const withFocus = renderTransition(from, to, 0.1, {}, new Set([1]), undefined).find(
			(x) => x.key === "gone",
		);
		const without = renderTransition(from, to, 0.1).find((x) => x.key === "gone");
		// gone is on display line 2, not focused → its leave-fade is scaled by 0.25.
		expect(withFocus?.opacity).toBeCloseTo((without?.opacity ?? 0) * 0.25);
	});

	it("dims an entering token by its toFocus line", () => {
		const withFocus = renderTransition(from, to, 0.8, {}, undefined, new Set([3])).find(
			(x) => x.key === "new",
		);
		const without = renderTransition(from, to, 0.8).find((x) => x.key === "new");
		// new is on display line 4, not focused in toFocus → enter-fade scaled by 0.25.
		expect(withFocus?.opacity).toBeCloseTo((without?.opacity ?? 0) * 0.25);
	});

	it("crossfades a moving token's dim from origin focus to destination focus", () => {
		const single: LaidOutToken[] = [{ key: "s", content: "s", line: 0, col: 0 }]; // display line 1
		const moved: LaidOutToken[] = [{ key: "s", content: "s", line: 2, col: 0 }]; // display line 3
		const fromFocus = new Set([1]); // origin focused
		const toFocus = new Set([9]); // destination NOT focused
		const atStart = renderTransition(single, moved, 0, {}, fromFocus, toFocus).find(
			(x) => x.key === "s",
		);
		const atMid = renderTransition(single, moved, 0.31, {}, fromFocus, toFocus).find(
			(x) => x.key === "s",
		);
		const atEnd = renderTransition(single, moved, 0.62, {}, fromFocus, toFocus).find(
			(x) => x.key === "s",
		);
		expect(atStart?.opacity).toBeCloseTo(1); // full dim (1) at the origin
		expect(atMid?.opacity).toBeCloseTo(0.625); // easeInOutQuart(0.5)=0.5 → lerp(1,0.25,0.5)
		expect(atEnd?.opacity).toBeCloseTo(0.25); // dim (0.25) once landed
	});

	it("keeps a moving token full when focused at both ends", () => {
		const single: LaidOutToken[] = [{ key: "s", content: "s", line: 0, col: 0 }];
		const moved: LaidOutToken[] = [{ key: "s", content: "s", line: 2, col: 0 }];
		const out = renderTransition(single, moved, 0.31, {}, new Set([1]), new Set([3])).find(
			(x) => x.key === "s",
		);
		expect(out?.opacity).toBeCloseTo(1);
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
