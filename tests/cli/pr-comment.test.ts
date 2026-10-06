// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	COMMENT_MARKER,
	type CliResult,
	type HostedResult,
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

describe("the Action's comment when Typelapse rendered it", () => {
	const PAGE = "https://typelapse.example/v/job_1";
	const STUDIO = "https://typelapse.example/app#import=abc";
	const RENDERED: HostedResult = {
		outcome: "rendered",
		jobId: "job_1",
		pageUrl: PAGE,
		studioUrl: STUDIO,
	};

	it("links the share page and the studio, under the marker the next push finds again", () => {
		const body = commentBody({
			result: null,
			hosted: RENDERED,
			artifactUrl: "",
			runUrl: RUN,
			sha: SHA,
		});

		expect(body.startsWith(`${COMMENT_MARKER}\n`)).toBe(true);
		expect(body).toContain("### Typelapse video at 0123456");
		expect(body).toContain(`](${PAGE})`);
		expect(body).toContain(`](${STUDIO})`);
	});

	it("has no artifact to download and no promise of one", () => {
		const body = commentBody({
			result: OK,
			hosted: RENDERED,
			artifactUrl: ARTIFACT,
			runUrl: RUN,
			sha: SHA,
		});

		expect(body).not.toContain("Download");
		expect(body).not.toContain(ARTIFACT);
		expect(body).not.toContain("Creator");
		expect(body).not.toMatch(/[$€£]/);
	});

	it("says the importer's notice under the link, as one sentence", () => {
		const body = commentBody({
			result: null,
			hosted: { ...RENDERED, notice: "46 commits, shown as one change" },
			artifactUrl: "",
			runUrl: RUN,
		});
		const lines = body.split("\n");
		const page = lines.findIndex((line) => line.includes(`](${PAGE})`));

		expect(lines.slice(page + 1, page + 3)).toEqual(["", "46 commits, shown as one change."]);
	});

	it("is the same body for the job summary as for the pull request", () => {
		const dir = mkdtempSync(join(tmpdir(), "typelapse-comment-hosted-"));
		try {
			writeFileSync(join(dir, "hosted.json"), `${JSON.stringify(RENDERED)}\n`);
			const out = join(dir, "comment.md");

			const body = writeCommentFromEnv({
				TYPELAPSE_HOSTED: join(dir, "hosted.json"),
				TYPELAPSE_COMMENT: out,
				TYPELAPSE_RUN_URL: RUN,
				TYPELAPSE_SHA: SHA,
			});

			expect(readFileSync(out, "utf8")).toBe(body);
			expect(body).toContain(`](${PAGE})`);
			expect(body).toContain(`](${STUDIO})`);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("the Action's comment when Typelapse did not render it", () => {
	const FREE: HostedResult = {
		outcome: "free",
		studioUrl: "https://typelapse.example/app#import=abc",
	};

	it("keeps the runner's video and says, for a free account, that the hosted video comes with Creator", () => {
		const body = commentBody({
			result: OK,
			hosted: FREE,
			artifactUrl: ARTIFACT,
			runUrl: RUN,
			sha: SHA,
		});
		const creator = body.split("\n").filter((line) => line.includes("Creator"));

		expect(body).toContain(`[Download Trim_the_name.mp4](${ARTIFACT})`);
		expect(body).toContain(`](${OK.studioUrl})`);
		expect(creator).toHaveLength(1);
		const [line = ""] = creator;
		expect(line).toContain("free account");
		expect(line).toContain("hosted video comes with Creator");
		// No marketing numbers in copy: no price, no minutes, no count.
		expect(line.replace(/<\/?sub>/g, "")).not.toMatch(/[$€£]|\d/);
		expect(line.replace(/<\/?sub>/g, "").match(/[.!?](\s|$)/g)).toHaveLength(1);
	});

	it("says why there is no hosted video, in the server's own words and one sentence of ours", () => {
		const body = commentBody({
			result: OK,
			hosted: {
				outcome: "unavailable",
				error: "This API key is not valid: it may be unknown, revoked or expired",
			},
			artifactUrl: ARTIFACT,
			runUrl: RUN,
			sha: SHA,
		});

		expect(body).toContain(`[Download Trim_the_name.mp4](${ARTIFACT})`);
		expect(body).toContain(
			"<sub>This API key is not valid: it may be unknown, revoked or expired. The video above rendered on this runner instead.</sub>",
		);
		expect(body).not.toContain("Creator renders it on our servers");
	});

	it("keeps the generic line about Creator when there was no key to ask with", () => {
		const body = commentBody({
			result: OK,
			hosted: null,
			artifactUrl: ARTIFACT,
			runUrl: RUN,
			sha: SHA,
		});

		expect(body).toBe(commentBody({ result: OK, artifactUrl: ARTIFACT, runUrl: RUN, sha: SHA }));
		expect(body).toContain("Creator renders it on our servers");
	});

	it("says nothing of Typelapse's servers when the runner's render failed too", () => {
		const failed: CliResult = { ok: false, exitCode: 3, error: "That pull request was not found." };
		const body = commentBody({
			result: failed,
			hosted: { outcome: "unavailable", error: "This API key is not valid" },
			artifactUrl: "",
			runUrl: RUN,
			sha: SHA,
		});

		expect(body).toContain(failed.error);
		expect(body).not.toContain("API key");
	});
});

describe("reading what the hosted step wrote", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "typelapse-comment-read-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	function written(env: Record<string, string>) {
		return writeCommentFromEnv({
			TYPELAPSE_RESULT: join(dir, "result.json"),
			TYPELAPSE_COMMENT: join(dir, "comment.md"),
			TYPELAPSE_ARTIFACT_URL: ARTIFACT,
			TYPELAPSE_RUN_URL: RUN,
			TYPELAPSE_SHA: SHA,
			...env,
		});
	}

	it("leaves the artifact comment exactly as it was when the step wrote nothing", () => {
		writeFileSync(join(dir, "result.json"), `${JSON.stringify(OK)}\n`);

		const withoutStep = written({});
		const missing = written({ TYPELAPSE_HOSTED: join(dir, "nothing.json") });
		writeFileSync(join(dir, "hosted.json"), "");
		const empty = written({ TYPELAPSE_HOSTED: join(dir, "hosted.json") });

		expect(withoutStep).toContain(`[Download Trim_the_name.mp4](${ARTIFACT})`);
		expect(missing).toBe(withoutStep);
		expect(empty).toBe(withoutStep);
	});

	it("puts a free account's note under the runner's video", () => {
		writeFileSync(join(dir, "result.json"), `${JSON.stringify(OK)}\n`);
		writeFileSync(
			join(dir, "hosted.json"),
			`${JSON.stringify({ outcome: "free", studioUrl: "https://typelapse.example/app#import=x" })}\n`,
		);

		const body = written({ TYPELAPSE_HOSTED: join(dir, "hosted.json") });

		expect(body).toContain("free account");
	});
});
