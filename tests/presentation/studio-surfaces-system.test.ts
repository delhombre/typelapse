import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOUCH_CELL } from "@/presentation/utils/playback-readout";
import { describe, expect, it } from "vitest";

/* The source hub, the showcase and the drop veil were the studio's last surfaces
   that wrote their own radii, sizes and timings (docs/design/SYSTEM.md, Drift 5,
   8, 9, 12 and 17). The design system says which value a role takes, and a
   stylesheet is where a drive-by edit would put a raw one back, so the rules of
   these surfaces are read the way the docs test reads the documents.

   The capture library shares the sheet and is read the same way since its own
   pass (ticket #142): its `.capture-*` rules are among the selectors below.

   The export dock's follow-up (ticket #140) reads the same way: the rail's
   selected segments, the menus that hold text and the replace question are
   checked against the doctrine in their own blocks at the end. */

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

/** The class names of the surfaces, the capture library's among them. */
const SURFACES = [
	"sc-source-",
	"sc-island-trigger",
	"showcase-",
	"studio-sheet-",
	"sc-drop-veil",
	"sc-confirm",
	"capture-",
];

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

describe("the source hub, the showcase, the drop veil and the capture library read the design system", () => {
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

describe("a sheet", () => {
	// A bottom sheet as wide as a 1440px window put its title 1352px from its close
	// button and left a capture or two against one edge of a field of paper. On a
	// desktop a sheet is as wide as its content, centred, and each sheet names that
	// width; on a phone it is the screen's, as a bottom sheet is.
	const shell = parseCss(camera).filter((rule) => rule.selectors.includes(".studio-sheet-panel"));
	const last = (declarations: Rule["declarations"], property: string) =>
		declarations
			.filter(([name]) => name === property)
			.map(([, value]) => value)
			.at(-1);

	it("is centred and as wide as the width it names, clear of the window's sides, on a desktop", () => {
		const desktop = shell
			.filter((rule) => rule.context.some((prelude) => /min-width:\s*721px/.test(prelude)))
			.flatMap((rule) => rule.declarations);
		expect(last(desktop, "margin-inline")).toBe("auto");
		expect(last(desktop, "width")).toContain("var(--sheet-width");
		expect(last(desktop, "width")).toContain("var(--sheet-margin");
	});

	it("spans the screen everywhere else", () => {
		const base = shell
			.filter((rule) => rule.context.length === 0)
			.flatMap((rule) => rule.declarations);
		expect([last(base, "left"), last(base, "right")]).toEqual(["0", "0"]);
		expect(last(base, "width")).toBeUndefined();
	});

	it.each([".capture-library-sheet", ".showcase-sheet"])("%s names its own width", (selector) => {
		const named = parseCss(camera)
			.filter((rule) => rule.selectors.includes(selector))
			.flatMap((rule) => rule.declarations)
			.filter(([property]) => property === "--sheet-width");
		expect(named.length).toBeGreaterThan(0);
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

/**
 * The declarations a stylesheet gives one selector, in source order. Every rule counts
 * unless `context` narrows it: a pattern keeps the rules inside a matching at-rule, and
 * `null` keeps the rules outside every at-rule.
 */
function declarationsOf(css: string, selector: string, context?: RegExp | null) {
	return parseCss(css)
		.filter(
			(rule) =>
				rule.selectors.includes(selector) &&
				(context === undefined ||
					(context === null
						? rule.context.length === 0
						: rule.context.some((prelude) => context.test(prelude)))),
		)
		.flatMap((rule) => rule.declarations);
}

/** The last value a selector gives a property: the one the cascade keeps among equals. */
function lastValue(css: string, selector: string, property: string, context?: RegExp | null) {
	return declarationsOf(css, selector, context)
		.filter(([name]) => name === property)
		.map(([, value]) => value)
		.at(-1);
}

describe("menus that hold rows of text (DECISIONS D5, next-wave D6)", () => {
	// On a phone the source menu, its popovers and the project menu cover the stage, and
	// the 12% of the 88% material that was not paper showed the mesh through their lower
	// rows as a blotch. A surface that carries text is the opaque studio surface.
	const MENUS = [".sc-source-menu", ".sc-source-form-popover", ".sc-project-menu"];

	it.each(MENUS)("%s paints the opaque studio surface, with no blur behind it", (selector) => {
		expect(lastValue(camera, selector, "background")).toBe("var(--camera-surface)");
		const blurs = declarationsOf(camera, selector).filter(([name]) =>
			name.endsWith("backdrop-filter"),
		);
		expect(blurs).toEqual([]);
	});

	it.each(MENUS)("%s keeps the ring inside the floating shadow stack", (selector) => {
		expect(lastValue(camera, selector, "box-shadow")).toBe("var(--camera-material-shadow)");
	});
});

describe("the rail's selected segments (SYSTEM.md Colour, DECISIONS D2 and D4)", () => {
	// The export button wears --color-primary, so a selected segment beside it cannot wear
	// the older, lighter yellow its washes were written in.
	const rail = parseCss(camera).filter((rule) =>
		rule.selectors.some((selector) => selector.includes(".si-")),
	);

	it("find the rail's rules, so the checks below are not vacuous", () => {
		expect(rail.length).toBeGreaterThan(40);
	});

	it("wear the primary token: no literal yellow is written in a rail rule", () => {
		const literal = /255\s+213\s+11|#ffd[0-9a-f]{3}|#ffe[0-9a-f]{3}/i;
		const found = rail.flatMap((rule) =>
			rule.declarations
				.filter(([, value]) => literal.test(value))
				.map(([property, value]) => `${rule.selectors.join(", ")} { ${property}: ${value} }`),
		);
		expect(found).toEqual([]);
	});

	it("wash a selected segment's plate in the token", () => {
		const plate = ".studio-camera-root .si-dock-timeline .si-button[data-selected] .si-plate";
		expect(lastValue(camera, plate, "background")).toContain("var(--camera-amber)");
		expect(lastValue(camera, plate, "box-shadow")).toContain("var(--camera-amber)");
	});

	it("sit beside an export button whose ink and hover are the primary's own tokens", () => {
		const cta = ".studio-camera-root .si-cta";
		expect(lastValue(camera, cta, "background")).toBe("var(--camera-amber)");
		expect(lastValue(camera, cta, "color")).toBe("var(--color-on-primary)");
		const hover = `${cta}:hover:not(:disabled):not([aria-disabled="true"]):not([data-open])`;
		expect(lastValue(camera, hover, "background")).toBe("var(--color-primary-hover)");
	});

	it("answer a hover by moving the plate, never the ink", () => {
		const selected = ".studio-camera-root .si-dock-timeline .si-button[data-selected]";
		const resting = lastValue(camera, selected, "color");
		expect(resting).toBe("var(--camera-amber)");
		const hovered = rail.filter(
			(rule) =>
				rule.context.some((prelude) => prelude.includes("hover: hover")) &&
				rule.selectors.some((selector) => selector.includes("[data-selected]:hover")),
		);
		expect(hovered.length).toBeGreaterThan(0);
		// The app's own selected-hover rule paints the dark ink of the white plate, so the
		// rail restates its resting ink there; it may never state another.
		const inks = hovered.flatMap((rule) =>
			rule.declarations.filter(([property]) => property === "color").map(([, value]) => value),
		);
		expect(inks.filter((ink) => ink !== resting)).toEqual([]);
	});
});

describe("the replace question (ConfirmDiscard, ticket #140)", () => {
	// Asked in four places: a source popover, the Showcase, a modal of its own for a project
	// file and the strip an import link raises. It used to inherit Tailwind's cold neutral ramp,
	// a yellow glow under its one button and, as a modal, the browser's ring around the card.
	const rules = parseCss(camera).filter((rule) =>
		rule.selectors.some((selector) => selector.includes("sc-confirm")),
	);

	it("has its rules in the studio stylesheet, so the checks below are not vacuous", () => {
		expect(rules.length).toBeGreaterThan(8);
	});

	it("is one card on the opaque studio surface, its ring inside the shadow stack", () => {
		expect(lastValue(camera, ".sc-confirm", "background")).toBe("var(--camera-surface)");
		expect(lastValue(camera, ".sc-confirm", "box-shadow")).toBe("var(--camera-raised)");
		expect(lastValue(camera, ".sc-confirm", "border-radius")).toBe("var(--r-surface)");
		expect(declarationsOf(camera, ".sc-confirm").filter(([name]) => name === "border")).toEqual([]);
	});

	it("fills its one shape with the primary, and nothing glows under it", () => {
		expect(lastValue(camera, ".sc-confirm-go", "background")).toBe("var(--color-primary)");
		expect(lastValue(camera, ".sc-confirm-go", "color")).toBe("var(--color-on-primary)");
		const shadows = rules.flatMap((rule) =>
			rule.declarations.filter(
				([property, value]) => property === "box-shadow" && /glow|inset/.test(value),
			),
		);
		expect(shadows).toEqual([]);
	});

	it("takes its colour from the studio's tokens: no literal, no Tailwind ramp", () => {
		const literal = rules.flatMap((rule) =>
			rule.declarations
				.filter(([, value]) => /#[0-9a-f]{3,8}\b|rgb\(|neutral-/i.test(value))
				.map(([property, value]) => `${rule.selectors.join(", ")} { ${property}: ${value} }`),
		);
		// The scrim is the dark paper at 40%, the one the sheets draw: it names the ramp's end.
		expect(literal.filter((line) => !line.includes("scrim"))).toEqual([]);
	});

	it("draws no ring on its card: a container that is focused by script marks nothing to press", () => {
		expect(lastValue(camera, ".sc-confirm-card:focus-visible", "outline")).toBe("none");
		// The buttons keep the keyboard's own ring (the global accent, DECISIONS D9): no rule
		// of this surface restyles a `:focus-visible` but the card's.
		const rings = rules
			.filter((rule) => rule.selectors.some((selector) => selector.includes(":focus-visible")))
			.flatMap((rule) => rule.selectors)
			.filter((selector) => !selector.startsWith(".sc-confirm-card"));
		expect(rings).toEqual([]);
	});

	it("draws, behind its modal, the scrim the sheets draw", () => {
		for (const property of ["background", "backdrop-filter"]) {
			expect(lastValue(camera, ".sc-confirm-scrim", property), property).toBe(
				lastValue(camera, ".studio-sheet-backdrop", property),
			);
		}
	});

	it("is a 44px target under a finger, drawn at 32px", () => {
		const coarse = /pointer:\s*coarse/;
		expect(lastValue(camera, ".sc-confirm-actions button", "height", null)).toBe("32px");
		expect(lastValue(camera, ".sc-confirm-actions button", "height", coarse)).toBe("44px");
	});
});

describe("the phone's island under a finger (ticket #140)", () => {
	// The scene dots were 24px wide and Export 31px tall. Under a coarse pointer the phone's
	// root row tiles 44px cells in a 48px plate, and the dots that fit are counted in JS.
	const touch = parseCss(app).filter((rule) =>
		rule.context.some((prelude) =>
			/pointer:\s*coarse\)\s*and\s*\(max-width:\s*639px/.test(prelude),
		),
	);

	it("finds its rules, so the checks below are not vacuous", () => {
		expect(touch.length).toBeGreaterThan(5);
	});

	it("is the phone's alone: no rule of it resizes the rail a touch laptop shows", () => {
		const loose = touch
			.flatMap((rule) => rule.selectors)
			.filter((selector) => selector.includes(".si-") && !selector.startsWith(".sc-root-mobile "));
		expect(loose).toEqual([]);
	});

	it("draws a 48px plate and the cell the dot budget counts in", () => {
		const phone = (selector: string, property: string) =>
			lastValue(app, selector, property, /pointer:\s*coarse\)\s*and\s*\(max-width:\s*639px/);
		expect(phone(".sc-root-mobile .si-island", "height")).toBe("48px");
		expect(phone(".sc-root-mobile .si-row[data-dots]", "--island-cell")).toBe(`${TOUCH_CELL}px`);
		expect(phone(".sc-root-mobile .si-row[data-dots] .si-dot", "width")).toBe("var(--island-cell)");
		// Round inside a round island (DECISIONS D3): a dot's ring follows the capsule.
		expect(phone(".sc-root-mobile .si-row[data-dots] .si-dot", "border-radius")).toBe(
			"var(--r-pill)",
		);
	});
});
