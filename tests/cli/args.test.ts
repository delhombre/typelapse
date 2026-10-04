// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../cli/args";
import { CliError } from "../../cli/errors";
import { expectOneSentence } from "./one-sentence";

/**
 * The flags are the contract the GitHub Action (#75) and the agent skill (#76)
 * are written against: every mistake is exit code 2 and one sentence, so a
 * workflow log or an agent can show it verbatim.
 */

function render(...argv: string[]) {
	const parsed = parseCliArgs(["render", ...argv]);
	if (parsed.command !== "render") {
		throw new Error("expected a render command");
	}
	return parsed.options;
}

function usageError(argv: string[]): CliError {
	try {
		parseCliArgs(argv);
	} catch (error) {
		expect(error).toBeInstanceOf(CliError);
		const cliError = error as CliError;
		expect(cliError.exitCode).toBe(2);
		expectOneSentence(cliError.message);
		return cliError;
	}
	throw new Error(`expected ${argv.join(" ")} to be refused`);
}

describe("typelapse render arguments", () => {
	it("takes the studio's defaults when only a source is given", () => {
		expect(render("docs/demo.project.json")).toEqual({
			source: "docs/demo.project.json",
			format: "mp4",
			open: false,
			json: false,
			warnings: [],
		});
	});

	it("reads every flag the Action and the skill pass", () => {
		expect(
			render(
				"https://github.com/octocat/Hello-World/pull/1",
				"--format",
				"webm",
				"--size",
				"1280x720",
				"--fps",
				"30",
				"--theme",
				"nord",
				"--out",
				"out/video.webm",
				"--open",
				"--json",
				"--studio-url",
				"https://studio.example/app",
			),
		).toEqual({
			source: "https://github.com/octocat/Hello-World/pull/1",
			format: "webm",
			size: { width: 1280, height: 720 },
			fps: 30,
			theme: "nord",
			out: "out/video.webm",
			open: true,
			json: true,
			studioUrl: "https://studio.example/app",
			warnings: [],
		});
	});

	it("infers the format from --out when --format is absent", () => {
		expect(render("change.diff", "--out", "demo.gif").format).toBe("gif");
	});

	it("refuses an --out extension that contradicts --format", () => {
		usageError(["render", "change.diff", "--format", "mp4", "--out", "demo.gif"]);
	});

	it("lets a loop be forced on or off, and refuses both at once", () => {
		expect(render("a.diff", "--loop").loop).toBe(true);
		expect(render("a.diff", "--no-loop").loop).toBe(false);
		expect(render("a.diff").loop).toBeUndefined();
		usageError(["render", "a.diff", "--loop", "--no-loop"]);
	});

	it("clamps a size to the renderer's bounds like the route does, and says so", () => {
		const options = render("a.diff", "--size", "9000x8");

		expect(options.size).toEqual({ width: 3840, height: 16 });
		expect(options.warnings).toHaveLength(1);
	});

	it.each([["1921x1080"], ["1920"], ["wide"], ["0x0"], ["1920x1080x2"]])(
		"refuses the size %s",
		(size) => {
			usageError(["render", "a.diff", "--size", size]);
		},
	);

	it("names the formats, rates and themes it accepts when given another", () => {
		expect(usageError(["render", "a.diff", "--format", "mov"]).message).toContain("mp4");
		expect(usageError(["render", "a.diff", "--fps", "25"]).message).toContain("24, 30 or 60");
		expect(usageError(["render", "a.diff", "--theme", "solarized"]).message).toContain("nord");
	});

	it.each([
		[[]],
		[["render"]],
		[["make", "a.diff"]],
		[["render", "a.diff", "b.diff"]],
		[["render", "a.diff", "--colour", "red"]],
		[["render", "a.diff", "--format"]],
		[["render", "a.diff", "--studio-url", "not a url"]],
	])("refuses %j with one sentence and exit code 2", (argv) => {
		usageError(argv);
	});

	it("answers --help without a source", () => {
		expect(parseCliArgs(["--help"])).toEqual({ command: "help" });
		expect(parseCliArgs(["render", "-h"])).toEqual({ command: "help" });
	});
});
