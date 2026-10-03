import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The README's demo has to stay reproducible, and it has to stay sharp.
 *
 * Both used to be nobody's job. The asset was a one-off with no committed
 * source, and it was 800 px wide displayed at 720 — a fraction, so every screen
 * resampled it and the code inside came out soft. These are the two facts that,
 * had anything checked them, would have caught it: the payload exists and
 * describes the file on disk, and the file's pixel width is a whole multiple of
 * the width the README asks for.
 */

const ROOT = resolve(__dirname, "../..");
const README = readFileSync(resolve(ROOT, "README.md"), "utf8");
const PROJECT = JSON.parse(readFileSync(resolve(ROOT, "docs/demo.project.json"), "utf8"));

/** Width and height of a GIF, read from its own header (bytes 6..9, little-endian). */
function gifSize(path: string): { width: number; height: number } {
	const bytes = readFileSync(path);
	expect(bytes.subarray(0, 3).toString("ascii")).toBe("GIF");
	return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

/** The `<img>` the README draws the demo with. */
function demoImageTag(): string {
	const tag = README.match(/<img[^>]*docs\/demo\.gif[^>]*>/)?.[0];
	expect(tag, "README should show docs/demo.gif").toBeDefined();
	return tag as string;
}

function attribute(tag: string, name: string): number {
	const value = tag.match(new RegExp(`${name}="(\\d+)"`))?.[1];
	expect(value, `<img> should declare ${name}`).toBeDefined();
	return Number(value);
}

describe("the README demo", () => {
	it("is rendered from a committed project, not from a memory", () => {
		expect(PROJECT.steps.length).toBeGreaterThanOrEqual(2);
		expect(PROJECT.title).toBeTruthy();
		expect(PROJECT.code).toBeTruthy();
		expect(PROJECT.language).toBeTruthy();
		expect(PROJECT.themeName).toBeTruthy();
		expect(PROJECT.width).toBeGreaterThan(0);
		expect(PROJECT.height).toBeGreaterThan(0);
	});

	it("ships the file that project describes", () => {
		const gif = gifSize(resolve(ROOT, "docs/demo.gif"));

		expect(gif).toEqual({ width: PROJECT.width, height: PROJECT.height });
	});

	/**
	 * 1x or 2x, never 1.11x. A whole ratio is the only one a browser can draw
	 * without inventing pixels, and inventing them is what soft text is.
	 */
	it("is displayed at a whole fraction of its own size", () => {
		const tag = demoImageTag();
		const gif = gifSize(resolve(ROOT, "docs/demo.gif"));

		const ratio = gif.width / attribute(tag, "width");

		expect([1, 2]).toContain(ratio);
	});

	/** Declaring both sides reserves the space, so the README does not jump as it loads. */
	it("declares both of its dimensions, in its own aspect", () => {
		const tag = demoImageTag();
		const gif = gifSize(resolve(ROOT, "docs/demo.gif"));

		expect(attribute(tag, "width") / attribute(tag, "height")).toBeCloseTo(
			gif.width / gif.height,
			5,
		);
	});
});
