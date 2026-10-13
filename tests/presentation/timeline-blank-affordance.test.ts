import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(__dirname, "../../src/presentation/studio-camera.css"), "utf8");

describe("Blank under Add scene (#272)", () => {
	it("is drawn as the button it is: nothing takes its outline or its fill away", () => {
		const rules = [...CSS.matchAll(/([^{}]*\.studio-timeline-add\[data-blank\][^{]*)\{([^}]*)\}/g)];

		expect(rules.length).toBeGreaterThan(0);
		for (const [, , declarations] of rules) {
			expect(declarations).not.toMatch(/border-color:\s*transparent|background:\s*transparent/);
		}
	});
});
