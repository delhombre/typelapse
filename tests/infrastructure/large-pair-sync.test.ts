// @vitest-environment node
/**
 * Large pairs under the line cap (#337). #335 declines the sync for a pair whose
 * capped lines differ, but `syncTokenKeys` diffs the two codes through
 * diff-match-patch, whose one-second timeout is not configurable per call
 * (shiki-magic-move calls `diff(a, b)` bare), and a pair it cannot match spends
 * all of it: 10 unrelated lines of 1,999 columns cost 1.26 s a morph, 100 of 300
 * columns 1.43 s, paid on every plan rebuild. The cost follows what differs, not
 * the length of the codes (the diff trims what they share first), so a pair whose
 * differing middle is past `MAX_SYNCED_EDIT_CHARACTERS` is planned as a scene
 * break (#307) instead.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectFromDiff } from "@/application/import/diff-project";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { buildMagicMovePlan } from "@/infrastructure/highlighting/magic-move-keyer";
import {
	MAX_SYNCED_EDIT_CHARACTERS,
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
/** `count` lines of `columns` columns, each starting at its own offset into the unit. */
const rows = (unit: string, count: number, columns: number) =>
	Array.from({ length: count }, (_, i) =>
		line(unit, columns + 31).slice(i % 31, (i % 31) + columns),
	).join("\n");

let highlighter: Highlighter;
beforeAll(async () => {
	highlighter = await createHighlighter({
		themes: ["github-dark"],
		langs: ["typescript", "tsx", "diff"],
	});
	buildMagicMovePlan(highlighter, ["const a = 1;"], "typescript", "midnight", BG);
});

const client = (codes: string[], loop = true) =>
	buildMagicMovePlan(highlighter, codes, "typescript", "midnight", BG, loop);
const server = (codes: string[], loop = true) =>
	buildServerMagicMovePlan(highlighter, codes, "typescript", "github-dark", BG, loop);
const keysOf = (tokens: { key: string }[]) => new Set(tokens.map((token) => token.key));
const sharedCount = (transition?: { from: { key: string }[]; to: { key: string }[] }) => {
	const out = keysOf(transition?.from ?? []);
	return (transition?.to ?? []).filter((token) => out.has(token.key)).length;
};
const timed = <T>(work: () => T): { value: T; ms: number } => {
	const started = performance.now();
	const value = work();
	return { value, ms: performance.now() - started };
};
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * What a stall costs: a second a morph, two morphs with the loop. The bound is far
 * above the tens of milliseconds a plan takes and below the stall (2.1 s measured
 * before, with Shiki's tokenization of 20,000 to 30,000 characters, up to 0.4 s of
 * it, included), so a loaded runner's jitter cannot trip it; the decision itself is
 * asserted below.
 */
const STALL_BOUND_MS = 1_200;
/** A rebuild after an edit: Shiki's tokenization is cached, only the plan walk runs. */
const REBUILD_BOUND_MS = 300;

describe("canSyncKeys on the size of what differs", () => {
	// Tokens of 100 characters, none near the line cap.
	const source = (code: string) => ({
		code,
		tokens: (code.match(/[\s\S]{1,100}/g) ?? []).map((content) => ({ content })),
	});
	const half = MAX_SYNCED_EDIT_CHARACTERS / 2;

	it("declines a pair whose differing middles sum past the bound, either way round", () => {
		const big = source("x".repeat(half + 1));
		const other = source("y".repeat(half));
		expect(canSyncKeys(big, other)).toBe(false);
		expect(canSyncKeys(other, big)).toBe(false);
	});

	it("accepts a pair at the bound", () => {
		expect(canSyncKeys(source("x".repeat(half)), source("y".repeat(half)))).toBe(true);
	});

	it("counts only the middle: a huge body both sides share does not decline an edit beside it", () => {
		const body = rows(UNIT_A, 100, 300);
		expect(canSyncKeys(source(`const b = 2;\n${body}`), source(`const b = 22;\n${body}`))).toBe(
			true,
		);
		expect(canSyncKeys(source(`${body}\nlet a;`), source(`${body}\nlet a = 1;`))).toBe(true);
	});

	it("does not count a block only one side holds: an appended paste or a removed section glides", () => {
		const body = rows(UNIT_A, 100, 300);
		const pasted = rows(UNIT_B, 100, 300);
		expect(canSyncKeys(source(body), source(`${body}\n${pasted}`))).toBe(true);
		expect(canSyncKeys(source(`${body}\n${pasted}`), source(body))).toBe(true);
		expect(canSyncKeys(source(`const a = 1;\n${pasted}`), source("const a = 1;"))).toBe(true);
	});

	it("declines a block replaced by another, both past the bound", () => {
		const body = rows(UNIT_A, 100, 300);
		const pasted = rows(UNIT_B, 100, 300);
		expect(canSyncKeys(source(`a\n${body}`), source(`b\n${pasted}`))).toBe(false);
	});

	it("counts the middle, not the edges: shared head and tail leave an unrelated body declined", () => {
		const head = "const head = 1;\n";
		const tail = "\nconst tail = 2;";
		const a = `${head}${rows(UNIT_A, 40, 100)}${tail}`;
		const b = `${head}${rows(UNIT_B, 40, 100)}${tail}`;
		expect(canSyncKeys(source(a), source(b))).toBe(false);
	});

	it("does not double count when the shared head and tail overlap", () => {
		expect(canSyncKeys(source("aaa"), source("aaaa"))).toBe(true);
		expect(canSyncKeys(source("ab".repeat(9_000)), source("ab".repeat(9_001)))).toBe(true);
	});

	describe("edits far apart: the distance between them is not their size", () => {
		/** Ordinary code lines of `columns` columns, each its own text. */
		const page = (count: number, columns = 72) =>
			Array.from({ length: count }, (_, i) =>
				`const value${i} = compute(${i}, "x".repeat(${i % 9}));`.padEnd(columns, " "),
			);
		const edit = (lines: string[], at: number[], by: (line: string) => string) =>
			lines.map((text, i) => (at.includes(i) ? by(text) : text)).join("\n");

		it("keeps the first and last line edited of 100 lines of 72 columns", () => {
			const lines = page(100);
			const edited = edit(lines, [0, 99], (text) => `${text}// edited`);
			expect(canSyncKeys(source(lines.join("\n")), source(edited))).toBe(true);
		});

		it("keeps the first and last line edited of 203 lines, the window's whole height", () => {
			const lines = page(203);
			const edited = edit(lines, [0, 202], (text) => `${text}// edited`);
			expect(canSyncKeys(source(lines.join("\n")), source(edited))).toBe(true);
		});

		it("keeps a rename every fourth line of 100", () => {
			const lines = page(100);
			const renamed = edit(
				lines,
				lines.map((_, i) => i).filter((i) => i % 4 === 0),
				(text) => text.replace("value", "renamed"),
			);
			expect(canSyncKeys(source(lines.join("\n")), source(renamed))).toBe(true);
		});

		it("keeps one character inserted at the head and at the tail of 203 x 72", () => {
			const code = page(203).join("\n");
			expect(canSyncKeys(source(code), source(`/${code}/`))).toBe(true);
		});

		it("keeps the same lines in another order: nothing is added or removed", () => {
			const lines = page(100);
			const swapped = [...lines];
			[swapped[0], swapped[99]] = [lines[99] ?? "", lines[0] ?? ""];
			expect(canSyncKeys(source(lines.join("\n")), source(swapped.join("\n")))).toBe(true);
		});

		it("declines a full-file reindent: every line is new text, the diff has nothing to trim", () => {
			const lines = page(100);
			const reindented = lines.map((text) => `  ${text}`).join("\n");
			expect(canSyncKeys(source(lines.join("\n")), source(reindented))).toBe(false);
		});

		it("keeps the shared keys of the first and last line edited, in the plan, server alike", () => {
			const lines = Array.from({ length: 100 }, (_, i) =>
				`const value${i} = compute(${i}, ${i * 3});`.padEnd(72, " "),
			);
			const codes = [lines.join("\n"), edit(lines, [0, 99], (text) => `${text}// edited`)];
			const plan = client(codes, false);
			expect(sharedCount(plan.transitions[0])).toBeGreaterThan(300);
			expect(server(codes, false)).toEqual(client(codes, false));
		});
	});

	describe("the bound sits at 6,000, not far above it", () => {
		const pair = (rowsPerSide: number, columns: number) =>
			[rows(UNIT_A, rowsPerSide, columns), rows(UNIT_B, rowsPerSide, columns)] as const;

		it("declines two unrelated pages of about 6,000 characters together", () => {
			const [a, b] = pair(40, 77);
			expect(canSyncKeys(source(a), source(b))).toBe(false);
		});

		it("accepts two unrelated pages of about 4,000 characters together", () => {
			const [a, b] = pair(25, 79);
			expect(canSyncKeys(source(a), source(b))).toBe(true);
		});
	});
});

describe("unrelated lines under the cap, across two steps (#337)", () => {
	const cases = [
		["10 lines of 1,999 columns", 10, MAX_TOKENIZED_LINE_COLUMNS - 1],
		["100 lines of 300 columns", 100, 300],
	] as const;

	for (const [label, count, columns] of cases) {
		describe(label, () => {
			const codes = [rows(UNIT_A, count, columns), rows(UNIT_B, count, columns)];

			it("holds more than the bound and no line at the cap", () => {
				expect(codes[0]?.length).toBeGreaterThan(MAX_SYNCED_EDIT_CHARACTERS);
				expect(columns).toBeLessThan(MAX_TOKENIZED_LINE_COLUMNS);
			});

			it("plans every morph, the loop's included, as a break: no key shared", () => {
				for (const plan of [client(codes), server(codes)]) {
					expect(sharedCount(plan.transitions[0])).toBe(0);
					expect(sharedCount(plan.loopTransition)).toBe(0);
				}
			});

			it("keeps every token of both sides, to fade out and in", () => {
				const plan = client(codes);
				expect(plan.transitions[0]?.from).toHaveLength(plan.frames[0]?.tokens.length ?? -1);
				expect(plan.transitions[0]?.to).toHaveLength(plan.frames[1]?.tokens.length ?? -1);
			});

			it("plans the same on the server as in the studio", () => {
				expect(server(codes)).toEqual(client(codes));
			});

			it("does not stall on the diff's one-second timeout, in the studio or on the server", () => {
				for (const [who, build] of [
					["studio", () => client(codes)],
					["server", () => server(codes)],
				] as const) {
					const { ms } = timed(build);
					console.info(
						`#337 ${who}: ${label}, two steps with the loop, planned in ${ms.toFixed(0)} ms`,
					);
					expect(ms, `${who} planned in ${ms.toFixed(0)} ms`).toBeLessThan(STALL_BOUND_MS);
				}
			});

			it("rebuilds the studio's plan after an edit in a fraction of that", () => {
				client(codes);
				const { ms } = timed(() => client(codes));
				console.info(`#337 studio rebuild: ${label}, planned in ${ms.toFixed(0)} ms`);
				expect(ms, `rebuilt in ${ms.toFixed(0)} ms`).toBeLessThan(REBUILD_BOUND_MS);
			});
		});
	}

	it("stays a break when the same unrelated body sits between a shared head and tail", () => {
		const wrap = (body: string) => `const head = 1;\n${body}\nconst tail = 2;`;
		const codes = [wrap(rows(UNIT_A, 100, 300)), wrap(rows(UNIT_B, 100, 300))];
		const plan = client(codes);
		expect(sharedCount(plan.transitions[0])).toBe(0);
	});
});

describe("ordinary morphs are unchanged", () => {
	it("plans the hono pull request as before: sha256 of the plan, studio and server alike", () => {
		const hono = projectFromDiff(
			readFileSync(resolve(__dirname, "../fixtures/hono-pr-5189.diff"), "utf8"),
		);
		const codes = hono.steps.map((step) => step.code);
		const breaks = hono.steps.map((step) => step.sceneBreak === true);
		const studio = buildMagicMovePlan(
			highlighter,
			codes,
			"typescript",
			"midnight",
			BG,
			true,
			[],
			breaks,
		);
		const render = buildServerMagicMovePlan(
			highlighter,
			codes,
			"typescript",
			"github-dark",
			BG,
			true,
			[],
			breaks,
		);
		const HONO_PLAN = "a4e4cca0a0099217b9c5343ba4b9de35e174469c0d195d72a0b47e0aa5fa2bff";
		expect(sha256(studio)).toBe(HONO_PLAN);
		expect(sha256(render)).toBe(HONO_PLAN);
	});

	it("still glides every morph of the six templates that is not a scene break", () => {
		for (const template of TEMPLATE_CATALOG) {
			const { steps, language } = template.project;
			const plan = buildMagicMovePlan(
				highlighter,
				steps.map((step) => step.code),
				language,
				"midnight",
				BG,
				false,
				[],
				steps.map((step) => step.sceneBreak === true),
			);
			plan.transitions.forEach((transition, i) => {
				if (steps[i + 1]?.sceneBreak !== true) {
					expect(sharedCount(transition), `${template.id}, morph ${i}`).toBeGreaterThan(0);
				}
			});
		}
	});

	it("morphs a whole 24-row page of 72 columns rewritten, nothing shared but the shape", () => {
		const codes = [rows(UNIT_A, 24, 72), rows(UNIT_B, 24, 72)];
		const [from, to] = codes;
		expect(canSyncKeys({ code: from ?? "", tokens: [] }, { code: to ?? "", tokens: [] })).toBe(
			true,
		);
		expect(server(codes)).toEqual(client(codes));
	});

	it("keeps the shared keys of an edit in the middle of a 100-line, 300-column body", () => {
		const body = rows(UNIT_A, 100, 300).split("\n");
		const edited = [...body];
		edited[50] = `${edited[50]?.slice(0, 150)}/* edited */${edited[50]?.slice(150)}`;
		const codes = [body.join("\n"), edited.join("\n")];
		const plan = client(codes, false);
		expect(sharedCount(plan.transitions[0])).toBeGreaterThan(100);
		expect(server(codes, false)).toEqual(client(codes, false));
	});
});
