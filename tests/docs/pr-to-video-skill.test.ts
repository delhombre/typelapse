import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { USAGE } from "../../cli/typelapse";

/**
 * The agent skill is prose an agent follows literally, so a stale line is a
 * wrong command run on someone's machine. These are the facts that drift: the
 * folder layout `npx skills add` discovers, the flags and exit codes the CLI
 * really has, and the measured figures the README quotes beside the crops.
 */

const ROOT = resolve(__dirname, "../..");
const DIR = resolve(ROOT, "skills/typelapse-pr-to-video");
const SKILL = readFileSync(resolve(DIR, "SKILL.md"), "utf8");
const README = readFileSync(resolve(DIR, "README.md"), "utf8");
const SHARPNESS = JSON.parse(readFileSync(resolve(ROOT, "docs/sharpness/sharpness.json"), "utf8"));
const ERRORS = readFileSync(resolve(ROOT, "cli/errors.ts"), "utf8");

function frontmatter(): Record<string, string> {
	const block = SKILL.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
	return Object.fromEntries(
		block.split("\n").map((line) => {
			const at = line.indexOf(":");
			return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
		}),
	);
}

describe("the typelapse-pr-to-video skill", () => {
	it("is where npx skills add finds it, named after its folder", () => {
		const meta = frontmatter();

		expect(meta.name).toBe("typelapse-pr-to-video");
		expect(meta.description?.length).toBeGreaterThan(40);
		// The description is always in context: it stays one tight paragraph.
		expect(meta.description?.length).toBeLessThan(400);
	});

	it("runs only flags the CLI has", () => {
		// git, gh and pnpm keep their own flags; every other one is the CLI's.
		const ours = SKILL.split("\n")
			.filter((line) => !/git clone|gh pr view|install --frozen-lockfile/.test(line))
			.join("\n")
			.replace(/pnpm (--silent )?--dir/g, "");
		const flags = new Set(ours.match(/(?<![\w-])--[a-z][a-z-]+/g));

		expect(flags.size).toBeGreaterThan(0);
		for (const flag of flags) {
			expect(USAGE, flag).toContain(flag);
		}
	});

	it("branches on every exit code the CLI defines, and on no other", () => {
		const defined = [...ERRORS.matchAll(/export const EXIT_\w+ = (\d)/g)].map((m) => m[1]);
		const handled = [...SKILL.matchAll(/^\s*[-|] \*\*Exit (\d)\*\*/gm)].map((m) => m[1]);

		expect(handled.sort()).toEqual(["0", ...defined].sort());
	});

	it("never says an em-dash", () => {
		expect(SKILL).not.toContain("—");
		expect(README).not.toContain("—");
	});
});

describe("the skill's README", () => {
	it("shows the two committed crops and quotes the figures the manifest measured", () => {
		for (const file of SHARPNESS.files) {
			const src = `../../docs/sharpness/${file.crop}`;

			expect(README, file.crop).toContain(src);
			expect(existsSync(resolve(DIR, src))).toBe(true);
			expect(README, file.label).toContain(`${file.psnr} dB`);
			expect(README).toContain(file.label);
		}
	});

	it("says which side of the comparison the skill's own file is", () => {
		// The CLI renders through the server route: H.264 4:2:0 for an MP4.
		const prose = README.replace(/\s+/g, " ");
		expect(prose).toMatch(/skill[^.]*H\.264 4:2:0/i);
		expect(prose).toMatch(/studio[^.]*AV1 4:4:4/i);
	});
});
