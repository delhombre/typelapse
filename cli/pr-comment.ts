/**
 * The pull request comment the GitHub Action posts, built from the CLI's --json
 * line. A step of its own writes it to a file, so the same body lands in the
 * job summary (which a fork's read-only token can still write) and in the
 * comment, and a local run of the Action's steps can be read without GitHub.
 *
 * No `@/` imports: the Action runs this with plain tsx, outside the CLI's loader.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The Action edits the comment that carries this instead of adding one per push. */
export const COMMENT_MARKER = "<!-- typelapse:render-pr -->";

/** The --json line: a written file, or the one-sentence failure and its exit code. */
export type CliResult =
	| {
			ok: true;
			path: string;
			bytes: number;
			width: number;
			height: number;
			fps: number;
			durationMs: number;
			codec: string;
			studioUrl?: string;
			/** How the source was shown when it is not the usual way: "46 commits, shown as one change". */
			notice?: string;
	  }
	| { ok: false; exitCode: number; error: string };

/**
 * What asking Typelapse to render the source came to, written by the hosted step
 * (`hosted-render.ts`) when the workflow gave the Action an API key. Only the
 * first outcome replaces the runner's render; the others say why it did not.
 */
export type HostedResult =
	/** Rendered on Typelapse, and its page is public: the video lives there. */
	| {
			outcome: "rendered";
			jobId: string;
			pageUrl: string;
			studioUrl: string;
			/** How the source was shown when it is not the usual way: "46 commits, shown as one change". */
			notice?: string;
	  }
	/** A free account: nothing was rendered there, and the studio opens on the source. */
	| { outcome: "free"; studioUrl: string; notice?: string }
	/** Anything else, in one sentence with no full stop: why there is no hosted video. */
	| { outcome: "unavailable"; error: string };

export interface CommentInput {
	/** null when the CLI died before printing a result. */
	result: CliResult | null;
	/** What asking Typelapse came to; absent when the workflow gave the Action no key. */
	hosted?: HostedResult | null;
	/** Empty when the upload was skipped or failed. */
	artifactUrl: string;
	runUrl: string;
	sha?: string;
}

/** Remotion's codec names, said the way a reviewer reads them. */
const CODEC_NAMES: Record<string, string> = { h264: "H.264", vp8: "VP8", vp9: "VP9", gif: "GIF" };

/** The link to the studio, with the hint a local one needs. */
function studioLine(studioUrl: string): string {
	const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(studioUrl)
		? " It opens in a local studio, so run `pnpm dev` in a Typelapse checkout first."
		: "";
	return `[Open it in the studio](${studioUrl}) to change the scenes, the theme or the format and export again.${local}`;
}

/** Why the video above came from the runner, when the workflow asked Typelapse and it did not deliver. */
function hostedNote(hosted: Exclude<HostedResult, { outcome: "rendered" }>): string {
	return hosted.outcome === "free"
		? "<sub>This API key belongs to a free account, so the video above rendered on this runner; the hosted video comes with Creator.</sub>"
		: `<sub>${hosted.error}. The video above rendered on this runner instead.</sub>`;
}

/** The video lives on its Typelapse page, so there is no artifact to link. */
function hostedBody(hosted: Extract<HostedResult, { outcome: "rendered" }>, at: string): string {
	const lines = [
		COMMENT_MARKER,
		`### Typelapse video${at}`,
		"",
		`[Watch the video](${hosted.pageUrl}), rendered on Typelapse's servers.`,
	];
	if (hosted.notice) {
		lines.push("", `${hosted.notice.replace(/\.$/, "")}.`);
	}
	lines.push("", studioLine(hosted.studioUrl), "");
	return lines.join("\n");
}

export function commentBody({ result, hosted, artifactUrl, runUrl, sha }: CommentInput): string {
	const at = sha ? ` at ${sha.slice(0, 7)}` : "";
	if (hosted?.outcome === "rendered") {
		return hostedBody(hosted, at);
	}
	if (!result?.ok) {
		const reason = result?.error ?? "The command stopped before it printed a result.";
		return [
			COMMENT_MARKER,
			`### Typelapse could not render this pull request${at}`,
			"",
			`${reason} [See the run](${runUrl}).`,
			"",
		].join("\n");
	}

	const name = result.path.split(/[\\/]/).pop() ?? result.path;
	const facts = [
		`${result.width}x${result.height}`,
		`${result.fps} fps`,
		`${(result.durationMs / 1000).toFixed(1)} s`,
		CODEC_NAMES[result.codec] ?? result.codec,
		`${(result.bytes / 1024 / 1024).toFixed(1)} MB`,
	].join(", ");
	// An artifact link needs the upload to have happened; the run always exists.
	const download = artifactUrl
		? `[Download ${name}](${artifactUrl})`
		: `[${name} is in this run's artifacts](${runUrl})`;

	const lines = [COMMENT_MARKER, `### Typelapse video${at}`, "", `${download}: ${facts}.`];
	if (result.notice) {
		lines.push("", `${result.notice.replace(/\.$/, "")}.`);
	}
	if (result.studioUrl) {
		lines.push("", studioLine(result.studioUrl));
	}
	if (hosted) {
		lines.push("", hostedNote(hosted));
	} else if (result.studioUrl) {
		lines.push(
			"",
			`<sub>Creator renders it on our servers from the [studio](${result.studioUrl}) and links the video here in place of the artifact.</sub>`,
		);
	}
	lines.push("");
	return lines.join("\n");
}

function readResult(path: string | undefined): CliResult | null {
	if (!path) {
		return null;
	}
	try {
		const text = readFileSync(path, "utf8").trim();
		// The CLI prints one JSON line on stdout; keep the last in case anything else slipped in.
		const last = text.split("\n").pop();
		return last ? (JSON.parse(last) as CliResult) : null;
	} catch {
		return null;
	}
}

/** What the hosted step wrote; null when it did not run or wrote nothing. */
function readHosted(path: string | undefined): HostedResult | null {
	if (!path) {
		return null;
	}
	try {
		const text = readFileSync(path, "utf8").trim();
		return text ? (JSON.parse(text) as HostedResult) : null;
	} catch {
		return null;
	}
}

/** The Action's step: environment in, the body file out. */
export function writeCommentFromEnv(env: Record<string, string | undefined>): string {
	const body = commentBody({
		result: readResult(env.TYPELAPSE_RESULT),
		hosted: readHosted(env.TYPELAPSE_HOSTED),
		artifactUrl: env.TYPELAPSE_ARTIFACT_URL ?? "",
		runUrl: env.TYPELAPSE_RUN_URL ?? "",
		sha: env.TYPELAPSE_SHA,
	});
	const out = env.TYPELAPSE_COMMENT;
	if (!out) {
		throw new Error("TYPELAPSE_COMMENT must name the file to write the comment to");
	}
	writeFileSync(out, body);
	return body;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	writeCommentFromEnv(process.env);
}
