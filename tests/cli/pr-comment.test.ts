// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	COMMENT_MARKER,
	type CliResult,
	commentBody,
	writeCommentFromEnv,
} from "../../cli/pr-comment";

/**
 * The pull request comment the GitHub Action posts, built from the CLI's --json
 * line. The Action edits the comment that carries the marker instead of adding
 * one per push, so the marker is part of the interface, and the body must never
 * promise what the run did not produce.
 */

const OK = {
	ok: true as const,
	path: "/runner/temp/typelapse/Trim_the_name.mp4",
	format: "mp4",
	bytes: 3_250_585,
	width: 1920,
	height: 1080,
	fps: 60,
	durationMs: 12_400,
	codec: "h264",
	studioUrl: "https://studio.example.com/app#import=abc",
};

const RUN = "https://github.com/o/r/actions/runs/1";
const ARTIFACT = "https://github.com/o/r/actions/runs/1/artifacts/9";
const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("the Action's pull request comment", () => {
	it("opens with the marker the Action finds again on the next push", () => {
		const body = commentBody({ result: OK, artifactUrl: ARTIFACT, runUrl: RUN, sha: SHA });

		expect(body.startsWith(`${COMMENT_MARKER}\n`)).toBe(true);
		expect(body).toContain("0123456");
		expect(body).not.toContain(SHA);
	});

	it("links the video, says what it is as measured, and opens the same project in the studio", () => {
		const body = commentBody({ result: OK, artifactUrl: ARTIFACT, runUrl: RUN, sha: SHA });

		expect(body).toContain(`[Download Trim_the_name.mp4](${ARTIFACT})`);
		expect(body).toContain("1920x1080, 60 fps, 12.4 s, H.264, 3.1 MB");
		expect(body).toContain(`](${OK.studioUrl})`);
	});

	it("says the hosted output in one sentence that points at the studio, with no price", () => {
		const body = commentBody({ result: OK, artifactUrl: ARTIFACT, runUrl: RUN, sha: SHA });
		const hosted = body.split("\n").filter((line) => line.includes("Creator"));

		expect(hosted).toHaveLength(1);
		const [line = ""] = hosted;
		expect(line).toContain(`](${OK.studioUrl})`);
		expect(line).not.toMatch(/[$€£]|\d+\s*(usd|eur)|per month|\/mo/i);
		expect(line.replace(/<\/?sub>/g, "").match(/[.!?](\s|$)/g)).toHaveLength(1);
	});

	it("tells a reader that a localhost link needs a local studio running", () => {
		const local = { ...OK, studioUrl: "http://localhost:5173/app#import=abc" };
		const body = commentBody({ result: local, artifactUrl: ARTIFACT, runUrl: RUN, sha: SHA });

		expect(body).toContain("pnpm dev");
	});

	it("says the CLI's notice under the video, as one sentence", () => {
		const body = commentBody({
			result: { ...OK, notice: "46 commits, shown as one change" },
			artifactUrl: ARTIFACT,
			runUrl: RUN,
			sha: SHA,
		});
		const lines = body.split("\n");
		const download = lines.findIndex((line) => line.startsWith("[Download"));

		expect(lines.slice(download + 1, download + 3)).toEqual([
			"",
			"46 commits, shown as one change.",
		]);
		expect(commentBody({ result: OK, artifactUrl: ARTIFACT, runUrl: RUN })).not.toContain(
			"shown as one change",
		);
	});

	it("points at the run when the artifact link is missing, instead of a dead link", () => {
		const body = commentBody({ result: OK, artifactUrl: "", runUrl: RUN, sha: SHA });

		expect(body).toContain(`](${RUN})`);
		expect(body).not.toContain("]()");
	});

	it("leaves the studio lines out when the run printed no studio link", () => {
		const { studioUrl: _, ...noLink } = OK;
		const body = commentBody({ result: noLink, artifactUrl: ARTIFACT, runUrl: RUN, sha: SHA });

		expect(body).not.toContain("studio");
		expect(body).not.toContain("Creator");
	});

	it("quotes the CLI's own sentence on a failure and links the run, with no video promised", () => {
		const failed: CliResult = {
			ok: false,
			exitCode: 3,
			error: "GitHub would not serve that pull request: it is private or does not exist.",
		};
		const body = commentBody({ result: failed, artifactUrl: "", runUrl: RUN, sha: SHA });

		expect(body.startsWith(COMMENT_MARKER)).toBe(true);
		expect(body).toContain(failed.error);
		expect(body).toContain(`](${RUN})`);
		expect(body).not.toContain("Download");
	});

	it("still says something true when the CLI died before printing a result", () => {
		const body = commentBody({ result: null, artifactUrl: "", runUrl: RUN, sha: SHA });

		expect(body).toContain("could not render");
		expect(body).toContain(`](${RUN})`);
	});
});

describe("writing the comment from the Action's environment", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "typelapse-comment-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("reads the result file and writes the body where the next step reads it", () => {
		writeFileSync(join(dir, "result.json"), `${JSON.stringify(OK)}\n`);
		const out = join(dir, "comment.md");

		writeCommentFromEnv({
			TYPELAPSE_RESULT: join(dir, "result.json"),
			TYPELAPSE_COMMENT: out,
			TYPELAPSE_ARTIFACT_URL: ARTIFACT,
			TYPELAPSE_RUN_URL: RUN,
			TYPELAPSE_SHA: SHA,
		});

		expect(readFileSync(out, "utf8")).toContain(`[Download Trim_the_name.mp4](${ARTIFACT})`);
	});

	it("treats a missing or empty result file as a run that printed nothing", () => {
		writeFileSync(join(dir, "result.json"), "");
		const out = join(dir, "comment.md");

		writeCommentFromEnv({
			TYPELAPSE_RESULT: join(dir, "result.json"),
			TYPELAPSE_COMMENT: out,
			TYPELAPSE_RUN_URL: RUN,
		});

		expect(readFileSync(out, "utf8")).toContain("could not render");
	});
});
