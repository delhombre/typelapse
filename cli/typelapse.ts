/**
 * `typelapse render <pr-url|commit-url|diff-file|project.json>`: the studio's
 * server export without the studio. Local, no account, the same route and the
 * same defaults, so the file is the one the export panel would have made.
 *
 * stdout carries the result and nothing else (the path, then the studio link
 * with --open, or one JSON object with --json), so a workflow or an agent can
 * read it; progress and the renderer's own logs go to stderr.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ProjectPayload } from "@/application/project/project-payload";
import { fetchCommitDiff, fetchPrWalkthrough } from "@/infrastructure/import/pr-import";
import { outputSettingsFor } from "../server/remotion/output-settings";
import { type CliFormat, type RenderOptions, parseCliArgs } from "./args";
import { CliError, EXIT_RENDER, EXIT_USAGE, type FailureCode } from "./errors";
import { RenderFailure, type RenderSettings, renderProject } from "./render-project";
import {
	DEFAULT_STUDIO_URL,
	type SourceDeps,
	applyOverrides,
	githubFetch,
	resolveSource,
	studioLink,
} from "./source";

/** What the file turned out to be, read back from the file rather than from the request. */
export interface MeasuredVideo {
	width: number;
	height: number;
	fps: number;
	durationMs: number;
	codec: string;
}

export interface CliIO extends SourceDeps {
	env: Record<string, string | undefined>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	render: (project: ProjectPayload, settings: RenderSettings) => Promise<Uint8Array>;
	measure: (path: string, format: CliFormat) => Promise<MeasuredVideo>;
}

export const USAGE = `Render a pull request, a commit, a diff or a Typelapse project to a video, locally.

Usage:
  typelapse render <source> [options]

Source:
  https://github.com/<owner>/<repo>/pull/<n>     a pull request (whole change)
  https://github.com/<owner>/<repo>/commit/<sha> a commit
  change.diff                                    a unified diff file (- reads stdin)
  project.json                                   a project exported from the studio

Options:
  --format mp4|webm|gif   default mp4, or the --out extension
  --size WxH              even edges, default the project's size or 1920x1080
  --fps 24|30|60          default the project's rate or 60 (a GIF is capped at 20)
  --theme <name>          midnight, aurora, frost, dracula, one-dark, catppuccin, nord
  --out, -o <path>        file or directory, default ./<title>.<format>
  --loop, --no-loop       morph the end back to the start, default on for a GIF only
  --open                  also print a studio link that opens the same project
  --studio-url <url>      studio for --open, default $TYPELAPSE_STUDIO_URL or ${DEFAULT_STUDIO_URL}
  --json                  print one JSON result: path, bytes, width, height, fps, durationMs, codec
  --help, -h              this text

Environment:
  GITHUB_TOKEN            read private repositories and lift GitHub's rate limit

Exit codes:
  0 written   2 bad arguments or file   3 GitHub source unreadable   4 render failed`;

export async function runCli(argv: string[], io: CliIO): Promise<0 | FailureCode> {
	const wantsJson = argv.includes("--json");
	try {
		const parsed = parseCliArgs(argv);
		if (parsed.command === "help") {
			io.stdout(USAGE);
			return 0;
		}
		await render(parsed.options, io);
		return 0;
	} catch (error) {
		const failure =
			error instanceof CliError
				? error
				: new CliError(
						`Something unexpected failed: ${firstLine(error instanceof Error ? error.message : String(error))}`,
						EXIT_RENDER,
					);
		io.stderr(`typelapse: ${failure.message}`);
		if (wantsJson) {
			io.stdout(JSON.stringify({ ok: false, exitCode: failure.exitCode, error: failure.message }));
		}
		return failure.exitCode;
	}
}

async function render(options: RenderOptions, io: CliIO): Promise<void> {
	for (const warning of options.warnings) {
		io.stderr(`typelapse: ${warning}`);
	}
	// Checked before the render, so a bad link setting fails in a second, not a minute.
	const studioBase = options.open ? studioBaseOf(options, io.env) : null;

	const source = await resolveSource(options.source, io);
	const project = applyOverrides(source.project, {
		theme: options.theme,
		size: options.size,
		fps: options.fps,
	});
	const settings: RenderSettings = {
		format: options.format,
		// The export panel's default, for a project saved before it recorded a rate.
		fps: project.fps ?? 60,
		loop: options.loop ?? options.format === "gif",
	};
	const path = await outputPath(options.out, project.title, options.format, io.cwd);

	// The route's own decision, so the line says what will render, GIF caps included.
	const planned = outputSettingsFor(
		options.format,
		project.width ?? 1920,
		project.height ?? 1080,
		settings.fps,
	);
	const capped = planned.downscaled ? " (a GIF is capped at 960 px and 20 fps)" : "";
	io.stderr(
		`Rendering ${source.arg} as ${options.format}, ${planned.width}x${planned.height} at ${planned.fps} fps${capped}…`,
	);

	const bytes = await renderOrFail(io, project, settings);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, bytes);

	let measured: MeasuredVideo;
	try {
		measured = await io.measure(path, options.format);
	} catch (error) {
		throw new CliError(
			`The file was written to ${path} but could not be read back: ${firstLine(error instanceof Error ? error.message : String(error))}`,
			EXIT_RENDER,
		);
	}
	const studioUrl = studioBase ? studioLink(source, project, studioBase) : null;

	if (options.json) {
		io.stdout(
			JSON.stringify({
				ok: true,
				path,
				format: options.format,
				bytes: bytes.length,
				...measured,
				...(studioUrl ? { studioUrl } : {}),
			}),
		);
	} else {
		io.stdout(path);
		if (studioUrl) {
			io.stdout(studioUrl);
		}
	}
	io.stderr(
		`Wrote ${(bytes.length / 1024 / 1024).toFixed(2)} MB, ${measured.width}x${measured.height}, ${measured.fps} fps, ${(measured.durationMs / 1000).toFixed(2)} s, ${measured.codec}.`,
	);
}

async function renderOrFail(
	io: CliIO,
	project: ProjectPayload,
	settings: RenderSettings,
): Promise<Uint8Array> {
	try {
		return await io.render(project, settings);
	} catch (error) {
		if (error instanceof RenderFailure && (error.status === 400 || error.status === 413)) {
			// The route judged the request, not the machine: the project needs fixing.
			throw new CliError(
				`The renderer refused this project: ${lowerFirst(firstLine(error.message))}`,
				EXIT_USAGE,
			);
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new CliError(`The render failed: ${lowerFirst(firstLine(message))}`, EXIT_RENDER);
	}
}

function studioBaseOf(options: RenderOptions, env: CliIO["env"]): string {
	const base = options.studioUrl ?? env.TYPELAPSE_STUDIO_URL ?? DEFAULT_STUDIO_URL;
	try {
		new URL(base);
		return base;
	} catch {
		throw new CliError(`TYPELAPSE_STUDIO_URL is not an address: '${base}'`, EXIT_USAGE);
	}
}

/** --out as a file, or as a directory that exists; otherwise the studio's download name. */
async function outputPath(
	out: string | undefined,
	title: string,
	format: CliFormat,
	cwd: string,
): Promise<string> {
	// The route's Content-Disposition rule, which is the name the studio downloads under.
	const fileName = `${title.replace(/[^a-zA-Z0-9-_]/g, "_") || "typelapse"}.${format}`;
	if (out === undefined) {
		return join(cwd, fileName);
	}
	const path = isAbsolute(out) ? out : resolve(cwd, out);
	const existing = await stat(path).catch(() => null);
	return existing?.isDirectory() ? join(path, fileName) : path;
}

function firstLine(text: string): string {
	const line = text.trim().split("\n")[0] ?? "";
	return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Remotion reads the file back with its own bundled ffprobe, so nothing extra is needed on PATH. */
async function measureVideo(path: string, format: CliFormat): Promise<MeasuredVideo> {
	const { getVideoMetadata } = await import("@remotion/renderer");
	const metadata = await getVideoMetadata(path);
	if (metadata.durationInSeconds === null) {
		throw new Error("it has no duration");
	}
	return {
		width: metadata.width,
		height: metadata.height,
		fps: Math.round(metadata.fps * 1000) / 1000,
		durationMs: Math.round(metadata.durationInSeconds * 1000),
		// Remotion names video codecs but answers "unknown" for a GIF.
		codec:
			metadata.codec === "unknown"
				? outputSettingsFor(format, metadata.width, metadata.height, metadata.fps).codec
				: metadata.codec,
	};
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

/** The real machine: disk, GitHub, the shipped render route. */
export function defaultIO(): CliIO {
	const env = process.env;
	// The PR import calls the global fetch; this is the one place a CLI run can sign it.
	globalThis.fetch = githubFetch(globalThis.fetch, env.GITHUB_TOKEN || env.GH_TOKEN);
	return {
		// pnpm and npm run scripts from the package root and keep the caller's
		// directory here, which is where a relative path was typed.
		cwd: env.INIT_CWD || process.cwd(),
		env,
		stdout: (text) => process.stdout.write(`${text}\n`),
		stderr: (text) => process.stderr.write(`${text}\n`),
		readText: (path) => readFile(path, "utf8"),
		readStdin,
		fetchPr: fetchPrWalkthrough,
		fetchCommit: fetchCommitDiff,
		render: renderProject,
		measure: measureVideo,
	};
}
