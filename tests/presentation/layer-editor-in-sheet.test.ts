import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* #107: on a phone the layer inspector lives in the bottom sheet, which vaul
   portals to the body, outside `.studio-camera-root` and `.sc-root-mobile`. Its
   rules were scoped to the desktop root, so a selected layer rendered raw, with
   11px fields that make iOS zoom the page. */

const camera = readFileSync(resolve(__dirname, "../../src/presentation/studio-camera.css"), "utf8");
const app = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8");

/** A selector list split on its top-level commas, not those inside `:is()`. */
function selectorList(list: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of list) {
		if (char === "(") depth += 1;
		if (char === ")") depth -= 1;
		if (char === "," && depth === 0) {
			parts.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	parts.push(current.trim());
	return parts;
}

/** The declarations of every rule whose selector list contains `selector`. */
function rulesFor(css: string, selector: string): string[] {
	const rules: string[] = [];
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
	for (const match of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = selectorList(match[1] ?? "");
		if (selectors.includes(selector)) {
			rules.push(match[2] ?? "");
		}
	}
	return rules;
}

/** The body of each `@media (pointer: coarse)` block, nested rules included. */
function coarseBlocks(css: string): string[] {
	const blocks: string[] = [];
	for (const match of css.matchAll(/@media \(pointer: coarse\) \{/g)) {
		let depth = 1;
		let index = (match.index ?? 0) + match[0].length;
		const start = index;
		while (depth > 0 && index < css.length) {
			if (css[index] === "{") depth += 1;
			if (css[index] === "}") depth -= 1;
			index += 1;
		}
		blocks.push(css.slice(start, index - 1));
	}
	return blocks;
}

describe("the layer inspector in the phone's sheet", () => {
	it("is laid out there as on the desktop", () => {
		const editor = rulesFor(camera, ":is(.studio-camera-root, .sc-sheet) .sc-layer-editor");
		expect(editor.join("")).toContain("flex-direction: column");
		const field = rulesFor(camera, ":is(.studio-camera-root, .sc-sheet) .sc-layer-field textarea");
		expect(field.join("")).toContain("border: 1px solid var(--camera-line)");
	});

	it("has the studio's colour tokens, published to it by name since the root does not reach it", () => {
		// One rule for both shells and the sheet (SYSTEM.md Drift 18): no copy of its own.
		const published = rulesFor(
			camera,
			":is(.studio-camera-root, .sc-root-mobile, .sc-tokens, .sc-sheet)",
		).join("");
		for (const token of ["--camera-line", "--camera-pill", "--camera-ink", "--camera-muted"]) {
			expect(published).toContain(`${token}:`);
		}
		expect(
			rulesFor(
				camera,
				".dark :is(.studio-camera-root, .sc-root-mobile, .sc-tokens, .sc-sheet)",
			).join(""),
		).toContain("--camera-pill:");
		expect(rulesFor(app, ".sc-sheet").join("")).not.toContain("--camera-");
	});

	it("sits on the phone's stage, where a finger can select it, not off its edge", () => {
		// The layer surface is drawn at canvas size and scaled from its top left;
		// without the rule the phone scaled it about its centre, far off the stage.
		const host = rulesFor(
			camera,
			":is(.studio-camera-root, .sc-root-mobile) .sc-composition-surface-host",
		).join("");
		expect(host).toContain("position: absolute");
		expect(host).toContain("transform-origin: top left");
		const layer = rulesFor(
			camera,
			":is(.studio-camera-root, .sc-root-mobile) .sc-composition-layer",
		);
		expect(layer.join("")).toContain("pointer-events: auto");
	});

	it("types at 16px under a finger, so iOS does not zoom into a field", () => {
		const coarse = coarseBlocks(camera).join("\n");
		for (const selector of [
			":is(.studio-camera-root, .sc-sheet) .sc-layer-field textarea",
			// As specific as the rule that sets 11px, or that rule wins.
			':is(.studio-camera-root, .sc-sheet) .sc-layer-field input[type="number"]',
			":is(.studio-camera-root, .sc-sheet) .sc-layer-field select",
			":is(.studio-camera-root, .sc-sheet) .sc-layer-placement-grid input",
		]) {
			expect(rulesFor(coarse, selector).join("")).toContain("font-size: 16px");
		}
	});
});

describe("the project name under a finger", () => {
	it("types at 16px, now that a touch can focus it", () => {
		const coarse = coarseBlocks(app).join("\n");
		expect(rulesFor(coarse, ".sc-title").join("")).toContain("font-size: 16px");
	});
});
