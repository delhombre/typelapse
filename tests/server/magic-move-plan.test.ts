// @vitest-environment node
/**
 * The server's keyer: the same plan walk on the server's highlighter. A scene
 * break (#280) matches no token across the pair, exactly as the studio's keyer
 * does, so the Remotion video fades where the preview and the painter fade.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectFromDiff } from "@/application/import/diff-project";
import { MAX_TOKENIZED_LINE_COLUMNS } from "@/infrastructure/highlighting/whole-line-tokenization";
import { buildMagicMovePlan } from "@/infrastructure/highlighting/magic-move-keyer";
import { type Highlighter, createHighlighter } from "shiki";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServerMagicMovePlan } from "../../server/remotion/magic-move-plan";
import { onStalledClock } from "../support/stalled-clock";

const BG = "#0d1117";
const PAGE_ONE = "describe('node', () => {\n  it('matches', () => {\n    expect(1).toBe(1);\n  });\n});";
const PAGE_ONE_AFTER = `${PAGE_ONE}\nconst extra = 2;`;
const PAGE_TWO = "export class Node<T> {\n  #children: Record<string, Node<T>> = {};\n}";

let highlighter: Highlighter;
beforeAll(async () => {
	highlighter = await createHighlighter({ themes: ["github-dark"], langs: ["typescript"] });
});

describe("buildServerMagicMovePlan", () => {
	it("matches no token across a scene break, every old token leaving and every new one entering", () => {
		const plan = buildServerMagicMovePlan(
			highlighter,
			[PAGE_ONE, PAGE_ONE_AFTER, PAGE_TWO],
			"typescript",
			"github-dark",
			BG,
			false,
			[],
			[false, false, true],
		);
		const across = plan.transitions[1];
		const fromKeys = new Set(across?.from.map((token) => token.key));
		expect(across?.to.filter((token) => fromKeys.has(token.key))).toEqual([]);
		expect(across?.from).toHaveLength(plan.frames[1]?.tokens.length ?? -1);
		expect(across?.to).toHaveLength(plan.frames[2]?.tokens.length ?? -1);
		// Inside the scene, shared tokens still keep one key.
		const inside = plan.transitions[0];
		const insideFrom = new Set(inside?.from.map((token) => token.key));
		expect(inside?.to.filter((token) => insideFrom.has(token.key)).length).toBeGreaterThan(0);
	});

	it("builds the plan the studio's keyer builds, break included", () => {
		const args = [[PAGE_ONE, PAGE_ONE_AFTER, PAGE_TWO], "typescript"] as const;
		const server = buildServerMagicMovePlan(
			highlighter,
			[...args[0]],
			args[1],
			"github-dark",
			BG,
			true,
			[],
			[false, false, true],
		);
		const client = buildMagicMovePlan(
			highlighter,
			[...args[0]],
			args[1],
			// The studio's theme name for the same Shiki theme.
			"midnight",
			BG,
			true,
			[],
			[false, false, true],
		);
		expect(server).toEqual(client);
	});
});

describe("a loaded render node (#315)", () => {
	const HONO = projectFromDiff(
		readFileSync(resolve(__dirname, "../fixtures/hono-pr-5189.diff"), "utf8"),
	);
	const codes = HONO.steps.map((step) => step.code);
	const breaks = HONO.steps.map((step) => step.sceneBreak === true);

	it("builds the studio's plan for the hono pull request when each line overruns Shiki's time limit", () => {
		expect(HONO.language).toBe("typescript");
		const server = () =>
			buildServerMagicMovePlan(highlighter, codes, "typescript", "github-dark", BG, true, [], breaks);
		const unhurried = server();
		expect(onStalledClock(server)).toEqual(unhurried);
		const client = onStalledClock(() =>
			buildMagicMovePlan(highlighter, codes, "typescript", "midnight", BG, true, [], breaks),
		);
		expect(client).toEqual(unhurried);
	});
});

describe("a pasted minified line (#331)", () => {
	it("is bounded and planned on the server as in the studio", () => {
		const unit = 'function f(a,b){return a.map(x=>x+b.c("s"))}var n=0;';
		const pasted = unit.repeat(4_000);
		const codes = ["const a = 1;", pasted];
		const started = performance.now();
		const server = buildServerMagicMovePlan(highlighter, codes, "typescript", "github-dark", BG);
		expect(performance.now() - started).toBeLessThan(200);
		expect(server).toEqual(buildMagicMovePlan(highlighter, codes, "typescript", "midnight", BG));
		// One token, in no colour of its own: the foreground, on every renderer.
		expect(server.frames[1]?.tokens).toHaveLength(1);
		expect(server.frames[1]?.tokens[0]?.color).toBeUndefined();
		expect(pasted.length).toBeGreaterThan(MAX_TOKENIZED_LINE_COLUMNS);
	});
});
