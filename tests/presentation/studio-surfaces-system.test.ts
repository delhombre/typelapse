import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* The source hub, the showcase and the drop veil were the studio's last surfaces
   that wrote their own radii, sizes and timings (docs/design/SYSTEM.md, Drift 5,
   8, 9, 12 and 17). The design system says which value a role takes, and a
   stylesheet is where a drive-by edit would put a raw one back, so the rules of
   these three surfaces are read the way the docs test reads the documents.

   The capture library shares the sheet but is not one of them: its rules keep
   their raw values until its own pass (ticket #142), and no selector below
   matches it. */

const camera = readFileSync(resolve(__dirname, "../../src/presentation/studio-camera.css"), "utf8");
const app = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8");

interface Rule {
	selectors: string[];
	declarations: [property: string, value: string][];
	/** The at-rule preludes the rule sits in, outermost first. */
	context: string[];
}

/** Splits on `separator` outside parentheses and quotes. */
function splitTopLevel(text: string, separator: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote = "";
	let current = "";
	for (const char of text) {
		if (quote) {
			if (char === quote) quote = "";
		} else if (char === '"' || char === "'") {
			quote = char;
		} else if (char === "(") {
			depth += 1;
		} else if (char === ")") {
			depth -= 1;
		}
		if (char === separator && depth === 0 && !quote) {
			parts.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	parts.push(current);
	return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/** Every style rule of a stylesheet, flattened out of its `@media` and `@supports` blocks. */
function parseCss(css: string): Rule[] {
	const rules: Rule[] = [];
	const walk = (source: string, context: string[]) => {
		let index = 0;
		while (index < source.length) {
			const open = source.indexOf("{", index);
			if (open === -1) return;
			let depth = 1;
			let close = open + 1;
			while (depth > 0 && close < source.length) {
				if (source[close] === "{") depth += 1;
				if (source[close] === "}") depth -= 1;
				close += 1;
			}
			const prelude = (source.slice(index, open).split(";").pop() ?? "").trim();
			const inner = source.slice(open + 1, close - 1);
			if (/^@(media|supports)/.test(prelude)) {
				walk(inner, [...context, prelude]);
			} else if (!prelude.startsWith("@")) {
				rules.push({
					selectors: splitTopLevel(prelude, ","),
					declarations: splitTopLevel(inner, ";").flatMap((declaration) => {
						const colon = declaration.indexOf(":");
						return colon === -1
							? []
							: [
									[declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()] as [
										string,
										string,
									],
								];
					}),
					context,
				});
			}
			index = close;
		}
	};
	walk(css.replace(/\/\*[\s\S]*?\*\//g, ""), []);
	return rules;
}

/** The class names of the three surfaces; `.capture-*` is deliberately absent. */
const SURFACES = ["sc-source-", "sc-island-trigger", "showcase-", "studio-sheet-", "sc-drop-veil"];

const surfaceRules = [...parseCss(camera), ...parseCss(app)].filter((rule) =>
	rule.selectors.some((selector) => SURFACES.some((name) => selector.includes(name))),
);

/** Each declaration of the three surfaces for one property, with where it was written. */
function declared(...properties: string[]) {
	return surfaceRules.flatMap((rule) =>
		rule.declarations
			.filter(([property]) => properties.includes(property))
			.map(([property, value]) => ({
				where: `${rule.selectors.join(", ")} { ${property}: ${value} }`,
				value,
				coarse: rule.context.some((prelude) => prelude.includes("pointer: coarse")),
			})),
	);
}

describe("the source hub, the showcase and the drop veil read the design system", () => {
	it("find their rules, so the checks below are not vacuous", () => {
		expect(surfaceRules.length).toBeGreaterThan(80);
		expect(declared("border-radius").length).toBeGreaterThan(15);
		expect(declared("font-size").length).toBeGreaterThan(12);
		expect(declared("transition").length).toBeGreaterThan(10);
	});

	it("take every radius from the scale, nested ones as calc() of a step", () => {
		const step = "var\\(--r-(?:surface|sheet|control|field|pill)\\)";
		const allowed = new RegExp(`^(?:${step}|calc\\(${step}(?: - \\d+px)+\\)|inherit|0)$`);
		const raw = declared("border-radius")
			.filter(({ value }) => splitTopLevel(value, " ").some((part) => !allowed.test(part)))
			.map(({ where }) => where);
		expect(raw).toEqual([]);
	});

	it("take every size and weight from the studio type scale", () => {
		const sizes = declared("font-size")
			// A field types at 16px under a finger, so iOS does not zoom into it.
			.filter(({ value, coarse }) => !(coarse && value === "16px"))
			.filter(({ value }) => !/^var\(--sc-text-(?:2xs|xs|sm|md|lg)\)$/.test(value));
		const weights = declared("font-weight").filter(
			({ value }) => !/^var\(--sc-weight-(?:regular|medium|strong)\)$/.test(value),
		);
		expect([...sizes, ...weights].map(({ where }) => where)).toEqual([]);
	});

	it("fade colour, depth and opacity in 150ms, the hover every other surface has", () => {
		const off = declared("transition", "transition-duration")
			.filter(({ value }) =>
				[...value.matchAll(/(\d+(?:\.\d+)?)ms/g)].some(([, duration]) => Number(duration) !== 150),
			)
			.map(({ where }) => where);
		expect(off).toEqual([]);
	});
});

describe("reduced motion", () => {
	// The global allow-list keeps colour, opacity and shadow fades and drops
	// everything that moves, so a local `transition: none` only ever removes a fade
	// the setting does not ask to lose (SYSTEM.md Drift 8, DECISIONS D8).
	it("is the global allow-list's alone: no block turns a transition off", () => {
		const overrides: string[] = [];
		for (const [file, css] of [
			["studio-camera.css", camera],
			["app.css", app],
		] as const) {
			for (const rule of parseCss(css)) {
				if (!rule.context.some((prelude) => /prefers-reduced-motion:\s*reduce/.test(prelude))) {
					continue;
				}
				if (
					rule.declarations.some(
						([property, value]) => property === "transition" && value === "none",
					)
				) {
					overrides.push(`${file}: ${rule.selectors.join(", ")}`);
				}
			}
		}
		expect(overrides).toEqual([]);
	});
});

describe("a full-window root", () => {
	// A hidden box is still a scroll container, so one focus or scrollIntoView slid
	// the whole studio under its header; a clipped one cannot be scrolled at all
	// (DECISIONS D15). The desktop root already clips; the phone's is the shared one.
	it.each([
		["the shared scene root, which the phone's root is", app, ".sc-root"],
		["the desktop root", camera, ".studio-camera-root"],
	])("clips: %s", (_name, css, selector) => {
		const overflow = parseCss(css)
			.filter((rule) => rule.selectors.includes(selector))
			.flatMap((rule) => rule.declarations)
			.filter(([property]) => property === "overflow")
			.map(([, value]) => value);
		expect(overflow).toEqual(["clip"]);
	});
});
