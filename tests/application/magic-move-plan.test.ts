/**
 * The magic-move plan both keyers build (the studio's and the server's): only
 * the rows and columns a card can show at the readable floor are laid out, and
 * each distinct code is tokenized once per build. A 3,000-line scene froze the
 * studio for a second per capture because every code was tokenized three times
 * over and every one of its 15,000 tokens was laid out, diffed and rendered.
 */

import { VISIBLE_COL_LIMIT, VISIBLE_ROW_LIMIT } from "@/application/layout/canvas-fit";
import { layoutFrame } from "@/application/magic-move/engine";
import { type PlanKeyer, planMagicMove, visibleSource } from "@/application/magic-move/plan";
import { describe, expect, it } from "vitest";

interface FakeSource {
	code: string;
	tokens: { key: string; content: string; offset: number; color?: string }[];
}

/** Splits on whitespace; keys are content-derived, as shiki-magic-move's are. */
function fakeKeyer() {
	const tokenized: string[] = [];
	const keyer: PlanKeyer<FakeSource> = {
		tokenize(code) {
			tokenized.push(code);
			const tokens: FakeSource["tokens"] = [];
			for (const match of code.matchAll(/\S+/g)) {
				tokens.push({
					key: `${code.length}-${match.index}`,
					content: match[0],
					offset: match.index ?? 0,
				});
			}
			return { code, tokens };
		},
		// Like the real `syncTokenKeys`: rewrites the target's keys in place.
		sync(from, to) {
			for (const token of to.tokens) {
				const twin = from.tokens.find((candidate) => candidate.content === token.content);
				if (twin) {
					token.key = twin.key;
				}
			}
			return { from, to };
		},
	};
	return { keyer, tokenized };
}

const lines = (count: number, text = "const value = 1;") =>
	Array.from({ length: count }, (_, i) => `${text} // ${i}`).join("\n");

describe("visibleSource", () => {
	it("keeps the first VISIBLE_ROW_LIMIT lines", () => {
		const windowed = visibleSource(lines(3_000));
		expect(windowed.split("\n")).toHaveLength(VISIBLE_ROW_LIMIT);
		expect(windowed.endsWith(`// ${VISIBLE_ROW_LIMIT - 1}`)).toBe(true);
	});

	it("returns a short code as it is", () => {
		const code = lines(3);
		expect(visibleSource(code)).toBe(code);
	});
});

describe("layoutFrame", () => {
	it("drops tokens that start past VISIBLE_COL_LIMIT, keeps one that straddles it", () => {
		const code = `${"a".repeat(VISIBLE_COL_LIMIT - 1)} bb ${"c".repeat(5)}`;
		const laid = layoutFrame(code, [
			{ key: "a", content: "a".repeat(VISIBLE_COL_LIMIT - 1), offset: 0 },
			{ key: "b", content: "bb", offset: VISIBLE_COL_LIMIT },
			{ key: "c", content: "ccccc", offset: VISIBLE_COL_LIMIT + 3 },
		]);
		expect(laid.map((token) => token.key)).toEqual(["a"]);
		const straddling = layoutFrame("xx", [{ key: "x", content: "x".repeat(20), offset: 0 }]);
		expect(straddling).toHaveLength(1);
	});
});

describe("planMagicMove", () => {
	it("lays out a 3,000-line scene on the visible window only", () => {
		const { keyer, tokenized } = fakeKeyer();
		const plan = planMagicMove([lines(3_000), lines(3_000, "let value = 2;")], keyer, "#0d1117");
		for (const code of tokenized) {
			expect(code.split("\n").length).toBeLessThanOrEqual(VISIBLE_ROW_LIMIT);
		}
		for (const frame of plan.frames) {
			expect(frame.lineCount).toBe(VISIBLE_ROW_LIMIT);
			expect(Math.max(...frame.tokens.map((token) => token.line))).toBe(VISIBLE_ROW_LIMIT - 1);
		}
	});

	it("plans a token with Shiki's empty colour as one with no colour (#331)", () => {
		// Shiki returns a line past `tokenizeMaxLineLength` as one token coloured "".
		const keyer: PlanKeyer<FakeSource> = {
			tokenize: (code) => ({ code, tokens: [{ key: "a", content: code, offset: 0, color: "" }] }),
			sync: (from, to) => ({ from, to }),
		};
		const plan = planMagicMove(["minified", "minified;"], keyer, "#0d1117", true);
		const planned = [
			...plan.frames.flatMap((frame) => frame.tokens),
			...plan.transitions.flatMap((transition) => [...transition.from, ...transition.to]),
			...(plan.loopTransition ? [...plan.loopTransition.from, ...plan.loopTransition.to] : []),
			...(plan.typing ?? []),
		];
		expect(planned.length).toBeGreaterThan(0);
		for (const token of planned) {
			expect(token.color).toBeUndefined();
		}
	});

	it("plans a pair its keyer declines to sync as a scene break, and never syncs it (#335)", () => {
		const { keyer } = fakeKeyer();
		const synced: string[] = [];
		const declining: PlanKeyer<FakeSource> = {
			...keyer,
			sync: (from, to) => {
				synced.push(`${from.code}>${to.code}`);
				return keyer.sync(from, to);
			},
			canSync: (from, to) => !from.code.includes("huge") && !to.code.includes("huge"),
		};
		const plan = planMagicMove(
			["alpha beta", "huge beta", "huge beta gamma"],
			declining,
			"#0d1117",
		);
		// "huge" is on one side of the first pair and both of the second: neither syncs.
		expect(synced).toEqual([]);
		for (const transition of plan.transitions) {
			const out = new Set(transition.from.map((token) => token.key));
			expect(transition.to.filter((token) => out.has(token.key))).toEqual([]);
		}
		// A pair it accepts still syncs.
		planMagicMove(["alpha beta", "gamma beta"], declining, "#0d1117");
		expect(synced).toEqual(["alpha beta>gamma beta"]);
	});

	it("tokenizes each distinct code once per build", () => {
		const { keyer, tokenized } = fakeKeyer();
		const a = lines(4);
		const b = lines(5);
		planMagicMove([a, b, b], keyer, "#0d1117", true);
		expect(tokenized.sort()).toEqual([a, b].sort());
	});

	it("keeps each frame's keys its own when a morph rewrites keys", () => {
		const { keyer } = fakeKeyer();
		const a = "alpha beta";
		const b = "gamma beta";
		const plan = planMagicMove([a, b], keyer, "#0d1117");
		const fresh = fakeKeyer().keyer.tokenize(b);
		// Frame B is B's own tokenization, untouched by the A to B morph...
		expect(plan.frames[1]?.tokens.map((token) => token.key)).toEqual(
			fresh.tokens.map((token) => token.key),
		);
		// ...while the morph's B carries A's key on the shared token.
		const shared = plan.transitions[0]?.to.find((token) => token.content === "beta");
		const fromShared = plan.transitions[0]?.from.find((token) => token.content === "beta");
		expect(shared?.key).toBe(fromShared?.key);
	});

	describe("a scene break (#280)", () => {
		const a = "alpha beta";
		const b = "gamma beta";
		const c = "beta delta";
		const keys = (tokens: { key: string }[] = []) => new Set(tokens.map((token) => token.key));
		const placed = (tokens: { content: string; line: number; col: number }[] = []) =>
			tokens.map(({ content, line, col }) => ({ content, line, col }));

		it("matches no token across a break: every old token leaves, every new one enters", () => {
			const { keyer } = fakeKeyer();
			// `beta` is in both frames: without the break it would glide.
			const plan = planMagicMove([a, b], keyer, "#0d1117", false, [], [false, true]);
			const transition = plan.transitions[0];
			const from = keys(transition?.from);
			expect([...keys(transition?.to)].filter((key) => from.has(key))).toEqual([]);
			// Each side is its own frame, as laid out: nothing is placed anywhere else.
			expect(placed(transition?.from)).toEqual(placed(plan.frames[0]?.tokens));
			expect(placed(transition?.to)).toEqual(placed(plan.frames[1]?.tokens));
		});

		it("still morphs inside a scene, and keeps one transition per pair", () => {
			const { keyer } = fakeKeyer();
			const plan = planMagicMove([a, b, c], keyer, "#0d1117", false, [], [false, false, true]);
			expect(plan.transitions).toHaveLength(2);
			const inside = plan.transitions[0];
			const glides = inside?.to.find((token) => token.content === "beta");
			expect(glides?.key).toBe(inside?.from.find((token) => token.content === "beta")?.key);
			const across = plan.transitions[1];
			const from = keys(across?.from);
			expect([...keys(across?.to)].some((key) => from.has(key))).toBe(false);
		});

		it("breaks the loop back to the first frame when the video has more than one scene", () => {
			const { keyer } = fakeKeyer();
			const broken = planMagicMove([a, b, c], keyer, "#0d1117", true, [], [false, true, false]);
			const from = keys(broken.loopTransition?.from);
			expect([...keys(broken.loopTransition?.to)].some((key) => from.has(key))).toBe(false);

			const whole = planMagicMove([a, b, c], fakeKeyer().keyer, "#0d1117", true);
			const loopFrom = whole.loopTransition?.from.find((token) => token.content === "beta");
			const loopTo = whole.loopTransition?.to.find((token) => token.content === "beta");
			expect(loopTo?.key).toBe(loopFrom?.key);
		});

		it("ignores a break on the first frame: nothing comes before it", () => {
			const plain = planMagicMove([a, b], fakeKeyer().keyer, "#0d1117", true);
			const flagged = planMagicMove([a, b], fakeKeyer().keyer, "#0d1117", true, [], [true]);
			expect(flagged).toEqual(plain);
		});
	});
});
