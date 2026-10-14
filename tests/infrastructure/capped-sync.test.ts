// @vitest-environment node
/**
 * Two steps of an unrelated huge line (#335). Tokenization is bounded by the line
 * cap (#331), but `syncTokenKeys` diffs the two codes through diff-match-patch,
 * which gives up after a second of wall clock: about 1 s per morph on lines it
 * cannot match, paid on every plan rebuild, i.e. on every keystroke. A pair that
 * holds a capped token is planned as a scene break instead (#307): nothing is
 * matched, so nothing is diffed.
 */

import { buildMagicMovePlan } from "@/infrastructure/highlighting/magic-move-keyer";
import {
	MAX_TOKENIZED_LINE_COLUMNS,
	canSyncKeys,
} from "@/infrastructure/highlighting/whole-line-tokenization";
import { type Highlighter, createHighlighter } from "shiki";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServerMagicMovePlan } from "../../server/remotion/magic-move-plan";

const BG = "#0d1117";
const UNIT_A = 'function f(a,b){return a.map(x=>x+b.c("s"))}var n=0;';
const UNIT_B = "class Q{static z=[1,2,3];get w(){return this.z.length}}let m=7;";
const line = (unit: string, columns: number) =>
	unit.repeat(Math.ceil(columns / unit.length)).slice(0, columns);

let highlighter: Highlighter;
beforeAll(async () => {
	highlighter = await createHighlighter({ themes: ["github-dark"], langs: ["typescript"] });
	buildMagicMovePlan(highlighter, ["const a = 1;"], "typescript", "midnight", BG);
});

const client = (codes: string[], loop = false) =>
	buildMagicMovePlan(highlighter, codes, "typescript", "midnight", BG, loop);
const server = (codes: string[], loop = false) =>
	buildServerMagicMovePlan(highlighter, codes, "typescript", "github-dark", BG, loop);
/** The tokens of a transition's target that carry a key its source holds too. */
const shared = <To extends { key: string }>(transition?: {
	from: { key: string }[];
	to: To[];
}): To[] => {
	const out = keysOf(transition?.from ?? []);
	return (transition?.to ?? []).filter((token) => out.has(token.key));
};
const timed = <T>(work: () => T): { value: T; ms: number } => {
	const started = performance.now();
	const value = work();
	return { value, ms: performance.now() - started };
};

/**
 * What a stall costs: a second per morph, so 2 s for these two steps with the loop.
 * The bound is far above the tens of milliseconds a plan takes and far below that,
 * so a loaded runner's jitter cannot trip it. The rest of this file asserts the
 * decision itself, which is what keeps the stall away.
 */
const STALL_BOUND_MS = 700;

describe("canSyncKeys", () => {
	const tokenization = (...contents: string[]) => ({
		tokens: contents.map((content) => ({ content })),
	});
	const hugeA = line(UNIT_A, MAX_TOKENIZED_LINE_COLUMNS);
	const hugeB = line(UNIT_B, MAX_TOKENIZED_LINE_COLUMNS);

	it("declines a pair whose capped lines differ, whichever side holds them", () => {
		expect(canSyncKeys(tokenization("a", hugeA), tokenization("a", hugeB))).toBe(false);
		expect(canSyncKeys(tokenization("a"), tokenization("a", hugeA))).toBe(false);
		expect(canSyncKeys(tokenization("a", hugeA), tokenization("a"))).toBe(false);
		expect(canSyncKeys(tokenization(hugeA, hugeB), tokenization(hugeB, hugeA))).toBe(false);
	});

	it("accepts a pair that holds no capped line, or the same ones in the same order", () => {
		expect(canSyncKeys(tokenization("a"), tokenization("b"))).toBe(true);
		expect(canSyncKeys(tokenization("a", hugeA), tokenization("b", hugeA))).toBe(true);
		expect(canSyncKeys(tokenization(hugeA, "x", hugeB), tokenization(hugeA, hugeB))).toBe(true);
	});

	it("caps at the column: a token one short of the cap is not a capped line", () => {
		const under = line(UNIT_A, MAX_TOKENIZED_LINE_COLUMNS - 1);
		expect(canSyncKeys(tokenization(under), tokenization(hugeA))).toBe(false);
		expect(canSyncKeys(tokenization(under), tokenization(under))).toBe(true);
	});
});

describe("two steps of an unrelated 200,000-column line (#335)", () => {
	const codes = [line(UNIT_A, 200_000), line(UNIT_B, 200_000)];

	it("plans every morph, the loop's included, as a break: no key shared", () => {
		for (const plan of [client(codes, true), server(codes, true)]) {
			expect(shared(plan.transitions[0])).toEqual([]);
			expect(shared(plan.loopTransition)).toEqual([]);
		}
	});

	it("plans the same on the server as in the studio", () => {
		expect(server(codes, true)).toEqual(client(codes, true));
	});

	it("does not stall on the diff's one-second timeout, in the studio or on the server", () => {
		for (const [who, build] of [
			["studio", () => client(codes, true)],
			["server", () => server(codes, true)],
		] as const) {
			const { ms } = timed(build);
			console.info(
				`#335 ${who}: two 200,000-column steps with the loop planned in ${ms.toFixed(0)} ms`,
			);
			expect(ms, `${who} planned in ${ms.toFixed(0)} ms`).toBeLessThan(STALL_BOUND_MS);
		}
	});
});

describe("a pair that holds a capped token", () => {
	const capped = line(UNIT_A, MAX_TOKENIZED_LINE_COLUMNS);

	it("is planned as a scene break: no key shared across it, either way round", () => {
		for (const codes of [
			[`const a = 1;\n${capped}`, `const a = 1;\n${line(UNIT_B, 5_000)}`],
			["const a = 1;\nlet b = 2;", `const a = 1;\n${capped}`],
			[`const a = 1;\n${capped}`, "const a = 1;\nlet b = 2;"],
		]) {
			expect(shared(client(codes).transitions[0])).toEqual([]);
		}
	});

	it("keeps every token of both sides, to fade out and in", () => {
		const codes = ["const a = 1;\nlet b = 2;", `const a = 1;\n${capped}`];
		const plan = client(codes);
		expect(plan.transitions[0]?.from).toHaveLength(plan.frames[0]?.tokens.length ?? -1);
		expect(plan.transitions[0]?.to).toHaveLength(plan.frames[1]?.tokens.length ?? -1);
	});

	it("is planned alike on the server", () => {
		const codes = [`const a = 1;\n${capped}`, `const a = 1;\n${line(UNIT_B, 5_000)}`];
		expect(server(codes)).toEqual(client(codes));
	});

	it("plans 100 differing capped lines of 5,000 columns over two steps as breaks", () => {
		const rows = (unit: string) =>
			Array.from({ length: 100 }, (_, i) => line(unit, 5_000).slice(i)).join("\n");
		const codes = [rows(UNIT_A), rows(UNIT_B)];
		const plan = client(codes, true);
		expect(shared(plan.transitions[0])).toEqual([]);
		expect(shared(plan.loopTransition)).toEqual([]);
	});
});

describe("a capped line both sides hold alike", () => {
	const capped = line(UNIT_A, 200_000);

	it("keeps morphing the lines around it: an edit elsewhere is a glide, not a fade", () => {
		const codes = [`const b = 2;\n${capped}`, `const b = 22;\n${capped}`];
		const [transition] = client(codes).transitions;
		// The capped token and the unedited tokens of the edited line are matched.
		expect(shared(transition).length).toBeGreaterThan(1);
		expect(
			shared(transition).some((token) => token.content.length >= MAX_TOKENIZED_LINE_COLUMNS),
		).toBe(true);
		expect(server(codes, true)).toEqual(client(codes, true));
	});

	it("keeps the keys of 100 identical capped lines of 5,000 columns around one edit", () => {
		const rows = Array.from({ length: 100 }, (_, i) => line(UNIT_A, 5_000).slice(i)).join("\n");
		const codes = [`const b = 2;\n${rows}`, `const b = 22;\n${rows}`];
		expect(shared(client(codes).transitions[0]).length).toBeGreaterThan(50);
	});

	it("keeps its key when the window scrolls past an edit on a long file", () => {
		const lines = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`);
		lines[34] = capped;
		const code = lines.join("\n");
		const focus = [new Set([30]), new Set([40])];
		const plan = buildMagicMovePlan(
			highlighter,
			[code, code],
			"typescript",
			"midnight",
			BG,
			false,
			focus,
		);
		expect(plan.frames[1]?.firstRow).not.toBe(plan.frames[0]?.firstRow);
		const [transition] = plan.transitions;
		const cappedKeys = (transition?.to ?? [])
			.filter((token) => token.content.length >= MAX_TOKENIZED_LINE_COLUMNS)
			.map((token) => token.key);
		expect(cappedKeys).toHaveLength(1);
		expect(keysOf(transition?.from ?? []).has(cappedKeys[0] ?? "")).toBe(true);
	});

	it("is a break again when the capped lines differ", () => {
		const codes = [`const b = 2;\n${capped}`, `const b = 2;\n${line(UNIT_B, 200_000)}`];
		expect(shared(client(codes).transitions[0])).toEqual([]);
	});
});

describe("a pair with no capped token", () => {
	it("still syncs: shared tokens keep one key across the morph", () => {
		const codes = ["const total = items.length;", "const total = items.length + 1;"];
		const [transition] = client(codes).transitions;
		const out = keysOf(transition?.from ?? []);
		const shared = (transition?.to ?? []).filter((token) => out.has(token.key));
		expect(shared.length).toBeGreaterThan(0);
	});

	it("morphs a line just under the cap against itself edited, not as a break", () => {
		const under = line(UNIT_A, MAX_TOKENIZED_LINE_COLUMNS - 1);
		const [transition] = client([under, `${under.slice(0, -1)}!`]).transitions;
		const out = keysOf(transition?.from ?? []);
		expect((transition?.to ?? []).filter((token) => out.has(token.key)).length).toBeGreaterThan(0);
	});
});

function keysOf(tokens: { key: string }[]) {
	return new Set(tokens.map((token) => token.key));
}
