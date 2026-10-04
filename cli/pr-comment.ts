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

export interface CommentInput {
	/** null when the CLI died before printing a result. */
	result: CliResult | null;
	/** Empty when the upload was skipped or failed. */
	artifactUrl: string;
	runUrl: string;
	sha?: string;
}

/** Remotion's codec names, said the way a reviewer reads them. */
const CODEC_NAMES: Record<string, string> = { h264: "H.264", vp8: "VP8", vp9: "VP9", gif: "GIF" };

export function commentBody({ result, artifactUrl, runUrl, sha }: CommentInput): string {
	const at = sha ? ` at ${sha.slice(0, 7)}` : "";
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
		const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(result.studioUrl)
			? " It opens in a local studio, so run `pnpm dev` in a Typelapse checkout first."
			: "";
		lines.push(
			"",
			`[Open it in the studio](${result.studioUrl}) to change the scenes, the theme or the format and export again.${local}`,
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

/** The Action's step: environment in, the body file out. */
export function writeCommentFromEnv(env: Record<string, string | undefined>): string {
	const body = commentBody({
		result: readResult(env.TYPELAPSE_RESULT),
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
