// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Browsers that ignore <link rel="icon"> (feed readers, link unfurlers, old
 * clients) ask for /favicon.ico by name, and the host answered 404. The file is
 * generated from favicon.svg at 16, 32 and 48, and the markup lists it first
 * with its size so a browser that reads SVG still picks the vector mark.
 */

const PUBLIC = resolve(__dirname, "../../public");
const HTML = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

describe("/favicon.ico", () => {
	const ico = readFileSync(resolve(PUBLIC, "favicon.ico"));

	it("is an icon file", () => {
		expect(ico.readUInt16LE(0)).toBe(0);
		expect(ico.readUInt16LE(2)).toBe(1);
	});

	it("carries the 16, 32 and 48 pixel sizes", () => {
		const count = ico.readUInt16LE(4);
		const sizes = Array.from({ length: count }, (_, index) => ico.readUInt8(6 + index * 16));

		expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);
	});
});

describe("the document's icon links", () => {
	const icons = [...HTML.matchAll(/<link\s+rel="icon"[^>]*>/g)].map((match) => match[0]);

	it("list the .ico first, then the SVG for browsers that read it", () => {
		expect(icons).toHaveLength(2);
		expect(icons[0]).toContain('href="/favicon.ico"');
		expect(icons[0]).toContain('sizes="32x32"');
		expect(icons[1]).toContain('href="/favicon.svg"');
		expect(icons[1]).toContain('sizes="any"');
	});
});
