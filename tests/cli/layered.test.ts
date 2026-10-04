// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CliIO, runCli } from "../../cli/typelapse";
import { expectOneSentence } from "./one-sentence";

/**
 * A project with a text title card cannot roll back to the code-only shape the
 * V1 route draws. With no media to carry, it renders through the local
 * multimedia route, the same V2 composition the studio's Server export and the
 * hosted worker use. The launch clip is that file.
 */

const ROOT = resolve(__dirname, "../..");
const LAUNCH = "docs/launch/launch.project.json";
const BYTES = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

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
		readStdin: async () => "",
		fetchPr: async () => Promise.reject(new Error("unused")),
		fetchCommit: async () => Promise.reject(new Error("unused")),
		render: vi.fn(async () => BYTES),
		renderLayered: vi.fn(async () => BYTES),
		measure: vi.fn(async () => ({
			width: 1920,
			height: 1080,
			fps: 60,
			durationMs: 20000,
			codec: "h264",
		})),
		...overrides,
	};
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "typelapse-cli-layered-"));
	stdout = [];
	stderr = [];
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("typelapse render with a text layer", () => {
	it("renders the launch project through the multimedia route, at its own size and rate", async () => {
		const renderLayered = vi.fn(async (_document: unknown, _options: unknown) => BYTES);
		const render = vi.fn(async () => BYTES);
		const out = join(dir, "launch.mp4");

		const code = await runCli(
			["render", LAUNCH, "--format", "mp4", "--json", "--out", out],
			io({ render, renderLayered }),
		);

		expect(code).toBe(0);
		expect(render).not.toHaveBeenCalled();
		const [document, options] = renderLayered.mock.calls[0] as unknown as [
			{ project: { title: string } },
			object,
		];
		expect(document.project.title).toBe("Typelapse launch");
		expect(options).toEqual({
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 60,
			includeAudio: false,
		});
		expect(JSON.parse(stdout[0] ?? "")).toMatchObject({ ok: true, path: out, durationMs: 20000 });
		expect(new Uint8Array(readFileSync(out))).toEqual(BYTES);
	});

	it("takes --size and --fps", async () => {
		const renderLayered = vi.fn(async (_document: unknown, _options: unknown) => BYTES);

		await runCli(
			["render", LAUNCH, "--format", "webm", "--size", "1280x720", "--fps", "30", "--out", dir],
			io({ renderLayered }),
		);

		expect(renderLayered.mock.calls[0]?.[1]).toEqual({
			format: "webm",
			width: 1280,
			height: 720,
			fps: 30,
			includeAudio: false,
		});
		expect(stdout[0]).toBe(join(dir, "Typelapse_launch.webm"));
	});

	it.each([
		["a GIF", ["--format", "gif"]],
		["a theme override", ["--theme", "nord"]],
	])("refuses %s in one sentence, before rendering", async (_case, flags) => {
		const renderLayered = vi.fn(async () => BYTES);

		const code = await runCli(
			["render", LAUNCH, ...flags, "--json", "--out", join(dir, "x.gif")],
			io({ renderLayered }),
		);

		expect(code).toBe(2);
		expect(renderLayered).not.toHaveBeenCalled();
		expectOneSentence(JSON.parse(stdout[0] ?? "").error);
	});

	it("still refuses a project whose media bytes a file cannot carry", async () => {
		const launch = JSON.parse(readFileSync(resolve(ROOT, LAUNCH), "utf8"));
		launch.project.assets = [
			{
				id: "a1",
				kind: "image",
				fileName: "a.png",
				mimeType: "image/png",
				byteSize: 4,
				checksum: "c".repeat(64),
				width: 10,
				height: 10,
			},
		];
		const readText = async () => JSON.stringify(launch);

		const code = await runCli(["render", "p.json", "--json"], io({ readText }));

		expect(code).toBe(2);
		expect(JSON.parse(stdout[0] ?? "").error).toMatch(/images, video or audio/);
	});
});
