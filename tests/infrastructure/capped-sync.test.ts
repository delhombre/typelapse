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
import { MAX_TOKENIZED_LINE_COLUMNS } from "@/infrastructure/highlighting/whole-line-tokenization";
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
const timed = <T>(work: () => T): { value: T; ms: number } => {
	const started = performance.now();
	const value = work();
	return { value, ms: performance.now() - started };
};

describe("two steps of an unrelated 200,000-column line (#335)", () => {
	const codes = [line(UNIT_A, 200_000), line(UNIT_B, 200_000)];

	it("plans in under 100 ms in the studio, loop included", () => {
		expect(timed(() => client(codes, true)).ms).toBeLessThan(100);
	});

	it("plans in under 100 ms on the server, loop included", () => {
		expect(timed(() => server(codes, true)).ms).toBeLessThan(100);
	});

	it("plans the same on the server as in the studio", () => {
		expect(server(codes, true)).toEqual(client(codes, true));
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
			const [transition] = client(codes).transitions;
			const out = keysOf(transition?.from ?? []);
			expect((transition?.to ?? []).filter((token) => out.has(token.key))).toEqual([]);
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

	it("plans 100 capped lines of 5,000 columns over two steps in under 100 ms", () => {
		const rows = (unit: string) =>
			Array.from({ length: 100 }, (_, i) => line(unit, 5_000).slice(i)).join("\n");
		const codes = [rows(UNIT_A), rows(UNIT_B)];
		expect(timed(() => client(codes, true)).ms).toBeLessThan(100);
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
