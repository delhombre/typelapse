/**
 * `typelapse render <source> [flags]`, parsed into what the run needs, or one
 * sentence and exit code 2. Pure: no disk, no network, so every refusal is a
 * unit test and the Action and the skill can rely on the exact wording class.
 */

import { extname } from "node:path";
import { parseArgs } from "node:util";
import { MAX_RENDER_DIMENSION, MIN_RENDER_DIMENSION } from "@/domain/entities/render-config";
import { THEMES } from "@/presentation/components/controls/control-presets";
import { CliError, EXIT_USAGE } from "./errors";

export const FORMATS = ["mp4", "webm", "gif"] as const;
export type CliFormat = (typeof FORMATS)[number];

/** The route snaps any other rate to one of these; the CLI refuses instead of guessing. */
export const FPS_CHOICES = [24, 30, 60] as const;
export type CliFps = (typeof FPS_CHOICES)[number];

export interface RenderOptions {
	source: string;
	format: CliFormat;
	/** Absent: the project's own size, or the studio's 1920x1080 for a PR or a diff. */
	size?: { width: number; height: number };
	/** Absent: the project's own rate, else the studio's 60. A GIF is capped by the route. */
	fps?: CliFps;
	theme?: string;
	out?: string;
	open: boolean;
	json: boolean;
	/** Absent: a GIF loops (it replays forever anyway), a video does not, as in the studio. */
	loop?: boolean;
	studioUrl?: string;
	/** Things the run should say on stderr without failing, such as a clamped size. */
	warnings: string[];
}

export type CliCommand = { command: "help" } | { command: "render"; options: RenderOptions };

const OPTIONS = {
	format: { type: "string" },
	size: { type: "string" },
	fps: { type: "string" },
	theme: { type: "string" },
	out: { type: "string", short: "o" },
	open: { type: "boolean" },
	json: { type: "boolean" },
	loop: { type: "boolean" },
	"no-loop": { type: "boolean" },
	"studio-url": { type: "string" },
	help: { type: "boolean", short: "h" },
} as const;

function usage(message: string): CliError {
	return new CliError(message, EXIT_USAGE);
}

/** node:util's parse errors, said in the CLI's voice. */
function parseError(error: unknown): CliError {
	const code = (error as { code?: string }).code;
	const message = error instanceof Error ? error.message : "";
	const option = message.match(/'(-{1,2}[\w-]+)/)?.[1];
	if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
		return usage(`Unknown option ${option ?? ""}; run typelapse --help for the list`);
	}
	if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
		return usage(`${option ?? "That option"} needs a value; run typelapse --help for the list`);
	}
	return usage("Those arguments could not be read; run typelapse --help for usage");
}

export function parseCliArgs(argv: string[]): CliCommand {
	let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
	try {
		parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
	} catch (error) {
		throw parseError(error);
	}
	const { values, positionals } = parsed;
	if (values.help) {
		return { command: "help" };
	}
	const [command, source, ...extra] = positionals;
	if (command !== "render") {
		throw usage(
			command
				? `Unknown command '${command}'; the only one is typelapse render <source>`
				: "Say what to render: typelapse render <pr-url|commit-url|diff-file|project.json>",
		);
	}
	if (!source) {
		throw usage("Pass a pull request URL, a commit URL, a diff file or a project file to render");
	}
	if (extra.length > 0) {
		throw usage(`Render one source at a time, not ${positionals.length - 1}`);
	}

	const warnings: string[] = [];
	const options: RenderOptions = {
		source,
		format: formatOf(values.format, values.out),
		open: values.open === true,
		json: values.json === true,
		warnings,
	};
	if (values.fps !== undefined) {
		options.fps = fpsOf(values.fps);
	}
	if (values.size !== undefined) {
		options.size = sizeOf(values.size, warnings);
	}
	if (values.theme !== undefined) {
		options.theme = themeOf(values.theme);
	}
	if (values.out !== undefined) {
		options.out = values.out;
	}
	if (values.loop && values["no-loop"]) {
		throw usage("Pass --loop or --no-loop, not both");
	}
	if (values.loop || values["no-loop"]) {
		options.loop = values.loop === true;
	}
	if (values["studio-url"] !== undefined) {
		options.studioUrl = studioUrlOf(values["studio-url"]);
	}
	return { command: "render", options };
}

function isFormat(value: string): value is CliFormat {
	return (FORMATS as readonly string[]).includes(value);
}

/** --format wins; else the --out extension says it; else the studio's mp4. */
function formatOf(format: string | undefined, out: string | undefined): CliFormat {
	const fromOut = out ? extname(out).slice(1).toLowerCase() : "";
	if (format !== undefined) {
		const asked = format.toLowerCase();
		if (!isFormat(asked)) {
			throw usage(`--format takes mp4, webm or gif, not '${format}'`);
		}
		if (isFormat(fromOut) && fromOut !== asked) {
			throw usage(`--out ends in .${fromOut} but --format asks for ${asked}; make them agree`);
		}
		return asked;
	}
	return isFormat(fromOut) ? fromOut : "mp4";
}

function fpsOf(value: string): CliFps {
	const fps = Number(value);
	const choice = FPS_CHOICES.find((rate) => rate === fps);
	if (choice === undefined) {
		throw usage(`--fps takes 24, 30 or 60, not '${value}'`);
	}
	return choice;
}

/**
 * WIDTHxHEIGHT, each axis clamped to the renderer's bounds exactly as the route
 * clamps it, then required even: H.264 and VP9 in 4:2:0 cannot encode an odd
 * edge, and rounding it here would render a size nobody asked for.
 */
function sizeOf(value: string, warnings: string[]): { width: number; height: number } {
	const match = value.match(/^(\d+)x(\d+)$/i);
	if (!match) {
		throw usage(`--size takes WIDTHxHEIGHT such as 1920x1080, not '${value}'`);
	}
	const clamp = (edge: number) =>
		Math.min(MAX_RENDER_DIMENSION, Math.max(MIN_RENDER_DIMENSION, edge));
	const askedWidth = Number(match[1]);
	const askedHeight = Number(match[2]);
	if (askedWidth === 0 || askedHeight === 0) {
		throw usage(`--size needs two edges above zero, not '${value}'`);
	}
	const width = clamp(askedWidth);
	const height = clamp(askedHeight);
	if (width % 2 !== 0 || height % 2 !== 0) {
		throw usage(`--size needs two even numbers, and ${width}x${height} has an odd edge`);
	}
	if (width !== askedWidth || height !== askedHeight) {
		warnings.push(
			`--size ${value} is outside ${MIN_RENDER_DIMENSION} to ${MAX_RENDER_DIMENSION} px per edge, so it renders at ${width}x${height}.`,
		);
	}
	return { width, height };
}

function themeOf(value: string): string {
	const names = THEMES.map((theme) => theme.name as string);
	if (!names.includes(value)) {
		throw usage(`--theme takes ${names.join(", ")}, not '${value}'`);
	}
	return value;
}

function studioUrlOf(value: string): string {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("not http");
		}
		return value;
	} catch {
		throw usage(`--studio-url takes an http or https address, not '${value}'`);
	}
}
