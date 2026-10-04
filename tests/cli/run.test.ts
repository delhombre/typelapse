// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderFailure } from "../../cli/render-project";
import { type CliIO, runCli } from "../../cli/typelapse";
import { expectOneSentence } from "./one-sentence";

/**
 * The whole command with the renderer swapped for a fake: what it writes, what
 * it prints, and which exit code it ends on. The machine-readable result is the
 * interface the Action and the skill parse, so its shape is pinned here.
 */

const ROOT = resolve(__dirname, "../..");
const DIFF = readFileSync(resolve(__dirname, "fixtures/greet.diff"), "utf8");
const BYTES = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 2, 3]);

let dir: string;
let stdout: string[];
let stderr: string[];

function io(overrides: Partial<CliIO> = {}): CliIO {
	return {
		cwd: ROOT,
		env: {},
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
		readText: async (path) => readFileSync(path, "utf8"),
		readStdin: async () => DIFF,
		fetchPr: async () => ({ diffText: DIFF, title: "Trim the name" }),
		fetchCommit: async () => ({ diffText: DIFF, title: "trim" }),
		fetchRelease: async () => ({
			card: { title: "Friendlier greetings" },
			chapters: [{ title: "trim before greeting", diffText: DIFF }],
			notice: "v1.2.0 is the first tag, so the video runs from the first commit",
		}),
		render: vi.fn(async () => BYTES),
		renderLayered: vi.fn(async () => BYTES),
		measure: vi.fn(async () => ({
			width: 1920,
			height: 1080,
			fps: 60,
			durationMs: 3850,
			codec: "h264",
		})),
		...overrides,
	};
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "typelapse-cli-test-"));
	stdout = [];
	stderr = [];
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("typelapse render", () => {
	it("writes the rendered file and prints one JSON result with --json", async () => {
		const out = join(dir, "nested", "greet.mp4");

		const code = await runCli(
			["render", "tests/cli/fixtures/greet.diff", "--json", "--out", out],
			io(),
		);

		expect(code).toBe(0);
		expect(stdout).toHaveLength(1);
		expect(JSON.parse(stdout[0] ?? "")).toEqual({
			ok: true,
			path: out,
			format: "mp4",
			bytes: BYTES.length,
			width: 1920,
			height: 1080,
			fps: 60,
			durationMs: 3850,
			codec: "h264",
		});
		expect(new Uint8Array(readFileSync(out))).toEqual(BYTES);
	});

	it("adds the studio link to the result with --open", async () => {
		const code = await runCli(
			["render", "https://github.com/o/r/pull/1", "--json", "--open", "--out", join(dir, "pr.mp4")],
			io({ env: { TYPELAPSE_STUDIO_URL: "https://studio.example/app" } }),
		);

		expect(code).toBe(0);
		const result = JSON.parse(stdout[0] ?? "");
		expect(result.studioUrl.startsWith("https://studio.example/app#import=")).toBe(true);
	});

	it("prints the path, then the studio link, and nothing else on stdout", async () => {
		const out = join(dir, "greet.mp4");

		await runCli(["render", "tests/cli/fixtures/greet.diff", "--open", "--out", out], io());

		expect(stdout).toHaveLength(2);
		expect(stdout[0]).toBe(out);
		expect(stdout[1]?.startsWith("http://localhost:5173/app#share=")).toBe(true);
	});

	it("names the file after the project's title when --out is absent, as the studio's download does", async () => {
		await runCli(["render", "https://github.com/o/r/pull/1"], io({ cwd: dir }));

		expect(stdout[0]).toBe(join(dir, "Trim_the_name.mp4"));
	});

	it("asks the renderer for the format, rate and size, and loops only a GIF by default", async () => {
		const render = vi.fn(async (_project: unknown, _settings: unknown) => BYTES);

		await runCli(
			[
				"render",
				"tests/cli/fixtures/greet.diff",
				"--format",
				"gif",
				"--fps",
				"30",
				"--size",
				"1280x720",
				"--out",
				join(dir, "a.gif"),
			],
			io({ render }),
		);
		await runCli(
			["render", "tests/cli/fixtures/greet.diff", "--out", join(dir, "b.mp4")],
			io({ render }),
		);

		const [gifProject, gifSettings] = render.mock.calls[0] as unknown as [
			{ width: number; height: number },
			object,
		];
		expect(gifProject).toMatchObject({ width: 1280, height: 720 });
		expect(gifSettings).toEqual({ format: "gif", fps: 30, loop: true });
		expect(render.mock.calls[1]?.[1]).toEqual({ format: "mp4", fps: 60, loop: false });
	});

	it("renders at the project's own frame rate unless --fps says otherwise", async () => {
		const render = vi.fn(async (_project: unknown, _settings: unknown) => BYTES);
		const project = JSON.stringify({
			...JSON.parse(readFileSync(resolve(ROOT, "docs/demo.project.json"), "utf8")),
			fps: 24,
		});
		const readText = async () => project;

		await runCli(["render", "p.json", "--out", join(dir, "a.mp4")], io({ render, readText }));
		await runCli(
			["render", "p.json", "--fps", "30", "--out", join(dir, "b.mp4")],
			io({ render, readText }),
		);

		expect(render.mock.calls[0]?.[1]).toMatchObject({ fps: 24 });
		expect(render.mock.calls[1]?.[1]).toMatchObject({ fps: 30 });
		expect(render.mock.calls[1]?.[0]).toMatchObject({ fps: 30 });
	});

	it.each([
		["a bad argument", ["render", "x.diff", "--fps", "25"], {}, 2],
		[
			"a missing PR",
			["render", "https://github.com/o/r/pull/404"],
			{
				fetchPr: async () =>
					Promise.reject(new Error("PR not found (or the repository is private)")),
			},
			3,
		],
		[
			"a render the route refused",
			["render", "tests/cli/fixtures/greet.diff"],
			{ render: async () => Promise.reject(new RenderFailure(400, "At least 2 steps required")) },
			2,
		],
		[
			"a render that failed",
			["render", "tests/cli/fixtures/greet.diff"],
			{ render: async () => Promise.reject(new RenderFailure(500, "Chrome crashed")) },
			4,
		],
	] as const)(
		"ends %s on its exit code with one sentence",
		async (_case, argv, overrides, exitCode) => {
			const code = await runCli(
				[...argv, "--json", "--out", join(dir, "x.mp4")],
				io(overrides as Partial<CliIO>),
			);

			expect(code).toBe(exitCode);
			const result = JSON.parse(stdout[0] ?? "");
			expect(result).toEqual({ ok: false, exitCode, error: expect.any(String) });
			expectOneSentence(result.error);
			expect(stderr.at(-1)).toContain(result.error);
		},
	);

	it("renders a release through the multimedia route, its title on the first scene", async () => {
		const renderLayered = vi.fn(async (_document: unknown, _options: unknown) => BYTES);
		const render = vi.fn(async () => BYTES);

		const code = await runCli(
			[
				"render",
				"https://github.com/o/r/releases/tag/v1.2.0",
				"--json",
				"--open",
				"--theme",
				"nord",
				"--out",
				join(dir, "release.mp4"),
			],
			io({ render, renderLayered }),
		);

		expect(code).toBe(0);
		expect(render).not.toHaveBeenCalled();
		const [document, options] = renderLayered.mock.calls[0] as unknown as [
			{
				project: {
					title: string;
					scenes: { blocks: { kind: string; text?: string; themeName?: string }[] }[];
				};
			},
			{ format: string; width: number; height: number; fps: number },
		];
		const [card, ...chapters] = document.project.scenes;
		expect(card?.blocks).toEqual([
			expect.objectContaining({ kind: "text", text: "Friendlier greetings" }),
		]);
		// --theme reaches the code card: it is applied before the title card joins it.
		expect(chapters.flatMap((scene) => scene.blocks).every((b) => b.themeName === "nord")).toBe(
			true,
		);
		expect(options).toMatchObject({ format: "mp4", width: 1920, height: 1080, fps: 60 });
		expect(JSON.parse(stdout[0] ?? "").studioUrl).toMatch(/#import=/);
		expect(stderr).toContain(
			"typelapse: v1.2.0 is the first tag, so the video runs from the first commit",
		);
	});

	it("refuses a release as a GIF in one sentence, since a text layer needs the multimedia route", async () => {
		const code = await runCli(
			["render", "https://github.com/o/r/releases/tag/v1.2.0", "--format", "gif"],
			io({ cwd: dir }),
		);

		expect(code).toBe(2);
		expect(stderr.at(-1)).toBe(
			"typelapse: A release opens on a title card, so it renders as mp4 or webm, not gif.",
		);
		expectOneSentence((stderr.at(-1) ?? "").replace(/^typelapse: /, ""));
	});

	it("prints usage on --help and exits 0", async () => {
		const code = await runCli(["--help"], io());

		expect(code).toBe(0);
		expect(stdout.join("\n")).toContain("typelapse render <source>");
	});
});
