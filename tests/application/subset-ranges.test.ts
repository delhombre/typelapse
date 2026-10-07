import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SUBSET_RANGES } from "@/application/fonts/code-fonts";
import { describe, expect, it } from "vitest";

/** The script's range constants, and the registry's name for each. */
const SCRIPT_RANGES = {
	LATIN: "latin",
	LATIN_EXT: "latin-ext",
	CYRILLIC: "cyrillic",
	GREEK: "greek",
	SYMBOLS: "symbols",
} as const;

describe("scripts/subset-fonts.py", () => {
	const script = readFileSync(resolve("scripts/subset-fonts.py"), "utf8");

	it("cuts the files at the unicode ranges the registry serves them at", () => {
		// A file cut at one range and registered at another draws a missing glyph
		// for a character the registry promised it held.
		for (const [constant, subset] of Object.entries(SCRIPT_RANGES)) {
			const found = new RegExp(`^${constant} = "([^"]+)"$`, "m").exec(script);
			expect(found?.[1], constant).toBe(SUBSET_RANGES[subset as keyof typeof SUBSET_RANGES]);
		}
	});

	it("names every subset the registry has", () => {
		expect(Object.values(SCRIPT_RANGES).sort()).toEqual(Object.keys(SUBSET_RANGES).sort());
	});

	it("pins the tools it runs on", () => {
		expect(script).toMatch(/fonttools==\d+\.\d+\.\d+/);
		expect(script).toMatch(/brotli==\d+\.\d+\.\d+/);
	});
});
