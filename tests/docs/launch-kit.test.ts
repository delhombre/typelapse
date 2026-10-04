// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseProjectDocument } from "@/application/project/project-document";
import { describe, expect, it } from "vitest";

/**
 * The launch kit (viability D6 step 5) makes public claims, so the claims are
 * pinned to what the repository measures, and the clip to the file the CLI
 * renders.
 *
 * The posts and the checklist move to the owner's notes on opening day, so a
 * check whose file is gone is skipped rather than failed: the move is a pure
 * file move, with no edit to this test.
 */

const DIR = resolve(__dirname, "../../docs/launch");
const read = (name: string) => readFileSync(resolve(DIR, name), "utf8");
const present = (name: string) => existsSync(resolve(DIR, name));
const DOCS = ["product-hunt.md", "x-thread.md", "assets.md", "checklist.md"].filter(present);
const POSTS = ["product-hunt.md", "x-thread.md"].filter(present);
const SHARPNESS = JSON.parse(
	readFileSync(resolve(__dirname, "../../docs/sharpness/sharpness.json"), "utf8"),
) as { files: { label: string; psnr: number }[] };

function psnr(label: string): string {
	const file = SHARPNESS.files.find((entry) => entry.label === label);
	if (!file) throw new Error(`no ${label} in the manifest`);
	return file.psnr.toFixed(2);
}

/** The quoted lines of each "## n." section: the posts as they will be pasted. */
function posts(): string[] {
	return read("x-thread.md")
		.split(/^## \d+\. /m)
		.slice(1)
		.map((section) =>
			section
				.split("\n")
				.filter((line) => line.startsWith(">"))
				.map((line) => line.replace(/^> ?/, ""))
				.join("\n")
				.replace(/\s*\[\d+\]/g, "")
				.trim(),
		);
}

describe("the launch kit", () => {
	it("is written without em-dashes or superlatives", () => {
		for (const name of DOCS) {
			const text = read(name);
			expect(text, name).not.toContain("—");
			expect(text, name).not.toMatch(
				/\b(sharpest|best|fastest|easiest|simplest|first-ever|revolutionary|seamless(ly)?)\b/i,
			);
		}
	});

	it.skipIf(!present("product-hunt.md"))("gives Product Hunt a tagline under 60 characters", () => {
		const tagline = read("product-hunt.md").match(/## Tagline[^\n]*\n\n([^\n]+)/)?.[1] ?? "";
		expect(tagline.length).toBeGreaterThan(0);
		expect(tagline.length).toBeLessThan(60);
	});

	it.skipIf(POSTS.length === 0)("quotes the sharpness numbers the manifest measured", () => {
		for (const name of POSTS) {
			expect(read(name), name).toContain(`${psnr("AV1 4:4:4")} dB`);
			expect(read(name), name).toContain(`${psnr("H.264 4:2:0")} dB`);
		}
	});

	it.skipIf(!present("x-thread.md"))("threads six posts that each fit in one post on X", () => {
		const thread = posts();
		expect(thread).toHaveLength(6);
		for (const post of thread) {
			expect(post.length, post).toBeLessThanOrEqual(280);
		}
	});
});

describe("the launch clip's project", () => {
	const parsed = parseProjectDocument(JSON.parse(read("launch.project.json")));
	if (parsed.schemaVersion !== 2) throw new Error("the launch project is a V2 document");
	const { project } = parsed.document;

	it("opens on a text title card, then a pull request and a code scene, with no media", () => {
		const [title, ...rest] = project.scenes;
		expect(title?.blocks.map((block) => block.kind)).toEqual(["text"]);
		expect(rest.length).toBeGreaterThanOrEqual(2);
		for (const scene of rest) {
			expect(scene.blocks.some((block) => block.kind === "code")).toBe(true);
		}
		expect(project.assets).toEqual([]);
	});

	it("runs 20 seconds: the scene holds plus the transitions between them", () => {
		const holds = project.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
		const transitions = (project.scenes.length - 1) * (project.settings.transitionMs ?? 650);
		expect(holds + transitions).toBe(20_000);
	});
});
