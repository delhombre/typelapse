/**
 * What the CLI was pointed at, read into the project the studio would hold.
 *
 * A pull request or a commit goes through the studio's own GitHub import
 * (`infrastructure/import/pr-import`, plain fetch, so it runs in Node as is) and
 * the studio's own diff-to-project step. A release or a compare range goes
 * through the release import and becomes the chaptered project behind its
 * title card. Those links are read by `application/import/import-source`, the
 * cascade the hosted render route shares. A file is a project or a diff. The
 * disk and the network are injected, so the decisions are tested without
 * either; `typelapse.ts` wires the real ones.
 */

import { isAbsolute, resolve } from "node:path";
import { looksLikeUnifiedDiff } from "@/application/import/classify-source";
import { projectFromDiff } from "@/application/import/diff-project";
import {
	type ImportFetchers,
	type RemoteKind,
	type RemoteSource,
	importFailureOf,
	importSource,
	remoteSourceOf,
} from "@/application/import/import-source";
import type { ReleaseCard } from "@/application/import/release-project";
import { projectV2ToV1 } from "@/application/project/migrate-v1-project";
import {
	type ProjectDocumentV2,
	parseProjectDocument,
} from "@/application/project/project-document";
import type { ProjectPayload } from "@/application/project/project-payload";
import { withTheme } from "@/application/project/with-theme";
import { THEMES } from "@/presentation/components/controls/control-presets";
import { encodeImportIntent } from "@/presentation/utils/import-intent";
import { CliError, EXIT_SOURCE, EXIT_USAGE } from "./errors";

export type SourceKind = "pr" | "commit" | "release" | "compare" | "diff" | "project";

export type ResolvedSource =
	| {
			kind: SourceKind;
			project: ProjectPayload;
			/** Exactly what was passed, for the progress line and for a PR's studio link. */
			arg: string;
			layered?: undefined;
			/** A release's title card, drawn on the project's blank first step. */
			card?: ReleaseCard;
			/** A line for the progress output: the range is not the usual one. */
			notice?: string;
	  }
	| {
			kind: "project";
			/**
			 * A V2 project the code-only route cannot draw (a text layer) and that
			 * names no media, so this one file is all of it: the multimedia route
			 * renders it.
			 */
			layered: ProjectDocumentV2;
			arg: string;
			project?: undefined;
	  };

export interface SourceDeps extends ImportFetchers {
	/** Where relative paths are read from: the directory the command was typed in. */
	cwd: string;
	readText: (path: string) => Promise<string>;
	readStdin: () => Promise<string>;
}

/** Any http(s) address, or a host path someone typed without the scheme. */
const LINK = /^(?:https?:\/\/|www\.)|^(?:[a-z0-9-]+\.)+[a-z]{2,}\//i;

export async function resolveSource(arg: string, deps: SourceDeps): Promise<ResolvedSource> {
	const remote = remoteSourceOf(arg);
	if (remote) {
		return fromGitHub(arg, remote, deps);
	}
	if (LINK.test(arg)) {
		throw new CliError(
			"Typelapse renders GitHub pull request, commit, release and compare links, and that link is none of them",
			EXIT_USAGE,
		);
	}
	const name = arg === "-" ? "stdin" : arg;
	const text = arg === "-" ? await deps.readStdin() : await readLocal(arg, deps);
	const kind = kindOfText(text, name);
	const read = projectFromText(text, name);
	return "schemaVersion" in read
		? { kind: "project", layered: read, arg }
		: { kind, project: read, arg };
}

async function readLocal(arg: string, deps: SourceDeps): Promise<string> {
	const path = isAbsolute(arg) ? arg : resolve(deps.cwd, arg);
	try {
		return await deps.readText(path);
	} catch {
		throw new CliError(`There is no readable file at ${arg}`, EXIT_USAGE);
	}
}

function isJsonObject(text: string): boolean {
	return text.trimStart().startsWith("{");
}

function kindOfText(text: string, name: string): SourceKind {
	if (isJsonObject(text)) {
		return "project";
	}
	if (looksLikeUnifiedDiff(text)) {
		return "diff";
	}
	throw new CliError(`${name} is neither a Typelapse project file nor a unified diff`, EXIT_USAGE);
}

function projectFromText(text: string, name: string): ProjectPayload | ProjectDocumentV2 {
	try {
		return isJsonObject(text) ? projectFromJson(text) : projectFromDiff(text);
	} catch (error) {
		const reason = error instanceof Error ? error.message.replace(/\.$/, "") : "unreadable";
		const what = isJsonObject(text) ? "a project Typelapse can render" : "a usable diff";
		throw new CliError(`${name} is not ${what}: ${lowerFirst(reason)}`, EXIT_USAGE);
	}
}

/**
 * The studio's own reader: the same validation `importFromJson` runs, and a
 * code-only V2 document rolled back to the shape the render route takes. A V2
 * document that cannot roll back (a text layer) comes back whole when it names
 * no media; images, video or audio need their bytes, which a single JSON file
 * does not carry.
 */
function projectFromJson(text: string): ProjectPayload | ProjectDocumentV2 {
	const parsed = parseProjectDocument(JSON.parse(text));
	if (parsed.schemaVersion === 1) {
		return parsed.document;
	}
	try {
		return projectV2ToV1(parsed.document);
	} catch {
		if (parsed.document.project.assets.length === 0) {
			return parsed.document;
		}
		throw new Error("it holds images, video or audio, whose bytes a project file does not carry");
	}
}

/** The studio's own import of a link, with the CLI's sentence when it fails. */
async function fromGitHub(
	arg: string,
	remote: RemoteSource,
	fetchers: ImportFetchers,
): Promise<ResolvedSource> {
	try {
		return { ...(await importSource(remote, fetchers)), arg };
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		throw new CliError(remoteSentence(message, remote.kind), EXIT_SOURCE);
	}
}

const SUBJECTS: Record<RemoteKind, string> = {
	pr: "That pull request",
	commit: "That commit",
	release: "That release",
	compare: "That comparison",
};

/**
 * The PR import speaks to someone in the studio ("paste the diff instead").
 * On a command line the way out is a token or a diff file, so say that.
 */
function remoteSentence(message: string, kind: RemoteKind): string {
	const subject = SUBJECTS[kind];
	switch (importFailureOf(message)) {
		case "not-found":
			return `${subject} was not found, or its repository is private; set GITHUB_TOKEN to read a private one`;
		case "rate-limit":
			return "GitHub's rate limit was hit; set GITHUB_TOKEN, or pass the diff as a file";
		case "range-too-large":
			return "GitHub will not compare a range this large; pass a smaller range as a compare link";
		case "too-large":
			return "GitHub will not serve a diff this large; pass a smaller diff as a file";
		case "timeout":
			return "GitHub did not answer within 10 seconds; try again, or pass the diff as a file";
		case "unreachable":
			return "Could not reach GitHub; check the connection, or pass the diff as a file";
		case "unfetchable":
			return `${subject} could not be fetched from GitHub`;
		// The CLI sets no budget, so this is only here to say what a caller that did meant.
		case "budget":
		case "other":
			return message
				? `${subject} could not be animated: ${lowerFirst(message.replace(/\.$/, ""))}`
				: `${subject} could not be fetched from GitHub`;
	}
}

function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The flags that the project file also records. `--theme` swaps
 * the whole theme, font and radius included, exactly as the studio's theme
 * picker does, so the font of the old theme does not linger on the new one.
 */
export function applyOverrides(
	project: ProjectPayload,
	overrides: {
		theme?: string;
		size?: { width: number; height: number };
		fps?: 24 | 30 | 60;
	},
): ProjectPayload {
	let next = project;
	if (overrides.theme !== undefined) {
		next = withTheme(next, overrides.theme);
	}
	if (overrides.size !== undefined) {
		next = { ...next, width: overrides.size.width, height: overrides.size.height };
	}
	if (overrides.fps !== undefined) {
		next = { ...next, fps: overrides.fps };
	}
	if (!THEMES.some((theme) => theme.name === next.themeName)) {
		throw new CliError(
			`The project uses the theme '${next.themeName}', which this studio does not have; pass --theme`,
			EXIT_USAGE,
		);
	}
	return next;
}

/** Where `--open` points when neither the flag nor TYPELAPSE_STUDIO_URL says: `pnpm dev`. */
export const DEFAULT_STUDIO_URL = "http://localhost:5173/app";

/**
 * The studio link that opens what was rendered.
 *
 * A pull request, a commit or a release is linked by its URL (`#import=`), the
 * link the landing page makes: short enough for a PR comment, and the studio fetches
 * the change itself. The studio applies its own look on arrival, so `--theme`
 * and `--size` are not carried. A file is carried whole (`#share=`, the
 * studio's share-link format), overrides included, because there is nothing
 * to fetch it back from.
 */
export function studioLink(source: ResolvedSource, project: ProjectPayload, base: string): string {
	const url = new URL(base);
	if (url.pathname === "/" || url.pathname === "") {
		url.pathname = "/app";
	}
	url.hash = "";
	const studio = url.toString();
	if (
		source.kind === "pr" ||
		source.kind === "commit" ||
		source.kind === "release" ||
		source.kind === "compare"
	) {
		return `${studio}${encodeImportIntent({ source: source.arg })}`;
	}
	// The same bytes as the studio's encodeShareLink: base64 of the UTF-8 JSON.
	const share = Buffer.from(JSON.stringify(project), "utf8").toString("base64");
	return `${studio}#share=${share}`;
}

/**
 * Sign api.github.com requests with a token when one is set. Unauthenticated
 * calls get 60 an hour per address, which a shared CI runner exhausts, and a
 * private repository answers 404 without one. Nothing else is touched.
 */
export function githubFetch(inner: typeof fetch, token: string | undefined): typeof fetch {
	if (!token) {
		return inner;
	}
	return (input, init) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		if (new URL(url).hostname !== "api.github.com") {
			return inner(input, init);
		}
		const headers = new Headers(init?.headers);
		headers.set("Authorization", `Bearer ${token}`);
		return inner(input, { ...init, headers });
	};
}
