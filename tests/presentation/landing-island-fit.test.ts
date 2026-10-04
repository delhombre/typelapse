import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* #99: on a finger the Instrument's panels hold eight controls, and the rule
   that sizes them was budgeted against the viewport. The island sits inside the
   Instrument section's 24px padding, so at 375px the theme panel came out 356px
   wide in a 327px frame and stood 9.5px from the screen edge. The budget is the
   section's content box, which is what `cqi` measures there. */

const css = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8");

function coarseIslandRule(): string {
	const rule = css.match(/\.landing-root \.lp-island-row \{([^}]*--island-control[^}]*)\}/);
	if (!rule?.[1]) {
		throw new Error("app.css should size the island's controls for a coarse pointer");
	}
	return rule[1];
}

function declaration(rule: string, name: string): string {
	const value = rule.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1];
	if (!value) {
		throw new Error(`${name} is missing from the coarse island rule`);
	}
	return value;
}

/** Evaluates the clamp/calc subset the rule uses, for one container width. */
function evaluate(value: string, containerWidth: number): number {
	const js = value
		.replaceAll("100cqi", String(containerWidth))
		.replaceAll("px", "")
		.replaceAll("calc(", "(")
		.replace(/clamp\(/g, "__clamp(");
	return new Function("__clamp", `return ${js};`)((min: number, value: number, max: number) =>
		Math.min(Math.max(min, value), max),
	) as number;
}

describe("island panel fit on a coarse pointer", () => {
	it("budgets against the frame it sits in, not the viewport", () => {
		const rule = coarseIslandRule();
		expect(declaration(rule, "--island-gap")).not.toContain("vw");
		expect(declaration(rule, "--island-control")).not.toContain("vw");
	});

	// 327 is the frame at a 375px phone, 272 at 320px.
	it.each([327, 272])("keeps eight controls inside a %ipx frame", (frame) => {
		const rule = coarseIslandRule();
		const gap = evaluate(declaration(rule, "--island-gap"), frame);
		const control = evaluate(declaration(rule, "--island-control"), frame);
		const islandPadding = 12;

		expect(8 * control + 7 * gap + islandPadding).toBeLessThanOrEqual(frame);
		// Still a target: WCAG 2.5.8's floor, with the gap to spare.
		expect(control).toBeGreaterThanOrEqual(24);
		expect(gap).toBeGreaterThanOrEqual(4);
	});
});
