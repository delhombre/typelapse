/**
 * Render by URL: a source (a GitHub pull request, commit, release or compare
 * link, or a unified diff) becomes a cloud project of the caller and a hosted
 * render job, or becomes nothing.
 *
 * The project is the one the studio and the CLI would build from the same
 * source (`import/import-source`), saved as a revision of the caller's project
 * for that source: the same source twice is the same project, a source that has
 * changed since is a new revision of it, and the job queue answers a repeated
 * request for one revision with the job it already holds. A script that retries,
 * or that renders every push to a pull request, neither multiplies projects nor
 * pays the same minutes twice.
 *
 * What it saves is an automation project: the plan's cloud-project ceiling does
 * not count it, so a script that renders every pull request never meets that
 * ceiling and never locks its owner out of saving from the studio. Only a save
 * from the studio makes it count.
 *
 * A refusal creates nothing. What can be known without writing is asked first:
 * the size against the plan, the source from GitHub, the ceilings against the
 * account's usage. The job queue stays the judge, under its own lock, so a
 * request that raced this one can still be refused after the save. The project
 * is then kept, because deleting it would delete, by cascade, whatever job the
 * winner queued on it; a retry finds it unchanged and asks the queue again.
 *
 * Relative imports on purpose: the hosted server loads this under tsx, which
 * does not resolve the "@/" path mapping unless it starts from the repository.
 */

import type { Plan } from "../../domain/value-objects/plan";
import {
	type AccountUsagePort,
	renderCeilingCrossed,
	renderPeriodStart,
} from "../billing/plan-allowance";
import {
	type ImportFailure,
	type ImportFetchers,
	type ImportSource,
	type ImportedSource,
	importFailureDetailOf,
	importFailureOf,
	importSource,
	importSourceKey,
} from "../import/import-source";
import { withReleaseCard } from "../import/release-project";
import { canonicalJson } from "../project/canonical-json";
import { migrateV1ToV2 } from "../project/migrate-v1-project";
import {
	type ProjectDocumentV2,
	THEME_NAMES,
	parseProjectDocument,
} from "../project/project-document";
import type {
	ProjectDocumentRepositoryPort,
	StoredProjectDocument,
} from "../project/project-document-repository.port";
import { withTheme } from "../project/with-theme";
import {
	type HostedRenderJob,
	type HostedRenderJobService,
	type HostedRenderOptions,
	parseHostedRenderOptions,
	resolutionLimitMessage,
} from "./hosted-render-job";
import { compileSceneTimeline } from "./scene-timeline";

/**
 * What a render of an import starts on, and what the CLI draws it at: the
 * project's own 1080p canvas, 60 frames a second, MP4. A test holds the size to
 * the canvas `projectFromDiff` gives an import.
 */
export const RENDER_SOURCE_DEFAULTS: HostedRenderOptions = {
	format: "mp4",
	width: 1920,
	height: 1080,
	fps: 60,
	// The server mixes the project's own audio, and only where there is some.
	includeAudio: true,
};

/**
 * The options a request asks for, over the defaults. Nothing asked is the
 * defaults; a size is both edges or neither, since half of one is no shape.
 * Throws the render queue's own sentence for anything it would refuse.
 */
export function parseRenderSourceOptions(input: unknown): HostedRenderOptions {
	if (input === undefined) {
		return parseHostedRenderOptions(RENDER_SOURCE_DEFAULTS);
	}
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new Error("Render options must be an object");
	}
	const asked = input as Record<string, unknown>;
	if ("width" in asked !== "height" in asked) {
		throw new Error("Send width and height together");
	}
	return parseHostedRenderOptions({ ...RENDER_SOURCE_DEFAULTS, ...asked });
}

const THEME_SENTENCE = `Hosted render theme must be ${THEME_NAMES.slice(0, -1).join(", ")} or ${THEME_NAMES.at(-1)}`;

/**
 * The theme a request asks for among its options, or undefined for the studio's
 * own. The look belongs to the saved project and not to the render job, so it is
 * read apart from the options the queue holds. Throws the sentence that names
 * the themes that exist.
 */
export function parseRenderSourceTheme(input: unknown): string | undefined {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return undefined;
	}
	const { theme } = input as Record<string, unknown>;
	if (theme === undefined) {
		return undefined;
	}
	if (typeof theme !== "string" || !(THEME_NAMES as readonly string[]).includes(theme)) {
		throw new Error(THEME_SENTENCE);
	}
	return theme;
}

export interface RenderBySourceRequest {
	readonly ownerId: string;
	/** Resolved on the server from the account, never from the request. */
	readonly plan: Plan;
	readonly source: ImportSource;
	readonly renderOptions: HostedRenderOptions;
	/**
	 * One of the studio's themes, for the project's code; absent keeps the studio's
	 * own. It is part of the saved project, so another theme for the same source is
	 * a new revision of it, and the same theme again is the same job.
	 */
	readonly theme?: string;
	readonly now: Date;
}

export type RenderBySourceResult =
	| {
			readonly outcome: "queued";
			readonly job: HostedRenderJob;
			/** Said alongside a good import: the range is not shown the way a release usually is. */
			readonly notice?: string;
	  }
	/** A ceiling of the plan: the month's minutes, the renders at once. Never the projects it keeps. */
	| {
			readonly outcome: "plan-limit";
			readonly ceiling: "hostedRenderTime" | "concurrentRenders";
			readonly used: number;
	  }
	| { readonly outcome: "resolution-limit"; readonly message: string }
	/** The source could not be read or has nothing to animate; `message` is the one sentence. */
	| {
			readonly outcome: "source-refused";
			readonly failure: ImportFailure;
			readonly message: string;
	  }
	/** A request that raced this one moved the project; asking again settles it. */
	| { readonly outcome: "conflict" };

export interface RenderBySourceService {
	submit(request: RenderBySourceRequest): Promise<RenderBySourceResult>;
}

export interface RenderBySourceDeps {
	/** It reads projects and writes automation ones: the studio's writes are out of its reach. */
	readonly projects: Pick<
		ProjectDocumentRepositoryPort,
		"findOwnedById" | "createAutomation" | "updateAutomation"
	>;
	readonly jobs: Pick<HostedRenderJobService, "submit">;
	readonly usage: AccountUsagePort;
	readonly fetchers: ImportFetchers;
	/** The longest one source may take to read; past it the request is refused. None: no limit. */
	readonly readBudgetMs?: number;
	/** A hex digest, injected so this layer stays free of the platform. */
	readonly hash: (value: string) => string;
}

const SUBJECTS: Record<ImportSource["kind"], string> = {
	pr: "That pull request",
	commit: "That commit",
	release: "That release",
	compare: "That comparison",
	diff: "That diff",
};

function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The importers speak to someone in the studio ("paste the diff instead"). To a
 * script the way out is to send the diff as the source, so say that. A private
 * repository and a missing one are the same answer from GitHub, and neither is
 * readable here: nothing sent to GitHub carries a credential.
 */
function refusalSentence(
	kind: ImportSource["kind"],
	failure: ImportFailure,
	message: string,
): string {
	const subject = SUBJECTS[kind];
	switch (failure) {
		case "not-found":
			return `${subject} was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead`;
		case "rate-limit": {
			// What GitHub said of its limit is what a script can act on: wait, or send a diff.
			const detail = importFailureDetailOf(message);
			return `GitHub's rate limit was hit${detail ? ` (${detail})` : ""}; try again later, or send a diff as the source`;
		}
		case "budget":
			// The importer's own sentence names the budget this server set.
			return `${message}; try again, or send a smaller range or a diff as the source`;
		case "range-too-large":
			return "GitHub will not compare a range this large; send a smaller range as a compare link";
		case "too-large":
			return "GitHub will not serve a diff this large; send a smaller diff as the source";
		case "timeout":
			return "GitHub did not answer within 10 seconds; try again, or send a diff as the source";
		case "unreachable":
			return "Typelapse could not reach GitHub; try again, or send a diff as the source";
		case "unfetchable":
			return `${subject} could not be fetched from GitHub`;
		case "other":
			return message
				? `${subject} could not be animated: ${lowerFirst(message.replace(/\.$/, ""))}`
				: `${subject} could not be fetched from GitHub`;
	}
}

/** Three looks at a project that keeps moving under us is a conflict, not a retry loop. */
const SAVE_ATTEMPTS = 3;

type Saved =
	| { readonly outcome: "saved"; readonly revision: number }
	| { readonly outcome: "conflict" };

const sameDocument = (stored: ProjectDocumentV2, next: ProjectDocumentV2) =>
	canonicalJson(stored) === canonicalJson(next);

/**
 * The document as a revision of the project: created when there is none, left
 * alone when it is what is stored, saved over the stored one when it has
 * changed. An automation project is outside the plan's project ceiling, so
 * nothing here is refused for it. A project that appears or moves while this
 * runs is read again rather than overwritten blind.
 */
async function saveRevision(
	projects: RenderBySourceDeps["projects"],
	input: { readonly ownerId: string; readonly document: ProjectDocumentV2 },
	known: StoredProjectDocument | null,
): Promise<Saved> {
	const { ownerId, document } = input;
	const id = document.project.id;
	let stored = known;
	for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
		if (stored === null) {
			try {
				const created = await projects.createAutomation({ ownerId, document });
				return { outcome: "saved", revision: created.revision };
			} catch (error) {
				// Two requests for one source race to create it, and the loser meets the
				// winner's row. With no such row nothing explains the failure.
				stored = await projects.findOwnedById(ownerId, id);
				if (stored === null) {
					throw error;
				}
			}
		}
		if (sameDocument(stored.document, document)) {
			return { outcome: "saved", revision: stored.revision };
		}
		const updated = await projects.updateAutomation({
			ownerId,
			id,
			expectedRevision: stored.revision,
			document,
		});
		if (updated.outcome === "updated") {
			return { outcome: "saved", revision: updated.project.revision };
		}
		stored = await projects.findOwnedById(ownerId, id);
	}
	return { outcome: "conflict" };
}

/**
 * The V2 document of an import, as the studio's cloud save would hold it: the
 * CLI's own steps (a V1 project migrated to V2, a release's card on its blank
 * first scene) under the id the account's project for this source has.
 */
function documentOf(
	imported: ImportedSource,
	projectId: string,
	theme: string | undefined,
): ProjectDocumentV2 {
	// The theme is the code's and is set before a release's title card joins it, as the CLI does.
	const migrated = migrateV1ToV2(theme ? withTheme(imported.project, theme) : imported.project);
	const document = imported.card ? withReleaseCard(migrated, imported.card) : migrated;
	const parsed = parseProjectDocument({
		...document,
		project: { ...document.project, id: projectId },
	});
	if (parsed.schemaVersion !== 2) {
		throw new Error("An imported project is a V2 document");
	}
	return parsed.document;
}

export function createRenderBySourceService(deps: RenderBySourceDeps): RenderBySourceService {
	return {
		async submit({ ownerId, plan, source, renderOptions, theme, now }) {
			// Pure, so asked before the network and before anything is written.
			const { width, height } = renderOptions;
			if (!plan.allowsResolution(width, height)) {
				return {
					outcome: "resolution-limit",
					message: resolutionLimitMessage(plan, width, height),
				};
			}

			let imported: ImportedSource;
			try {
				imported = await importSource(
					source,
					deps.fetchers,
					deps.readBudgetMs === undefined ? {} : { budgetMs: deps.readBudgetMs },
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : "";
				const failure = importFailureOf(message);
				return {
					outcome: "source-refused",
					failure,
					message: refusalSentence(source.kind, failure, message),
				};
			}

			// The account's project for this source: owned by the hash, so another
			// account's is another id and nothing about the id can be guessed into theirs.
			const projectId = `import_${deps.hash(`${ownerId}\n${importSourceKey(source)}`).slice(0, 32)}`;
			const document = documentOf(imported, projectId, theme);
			const stored = await deps.projects.findOwnedById(ownerId, projectId);
			const unchanged = stored !== null && sameDocument(stored.document, document);

			let revision = stored?.revision ?? 0;
			if (!unchanged) {
				// A new revision is a new render, so no job of its own exists yet and the
				// ceilings can be asked now. An unchanged one goes straight to the queue,
				// which returns the job it already holds before it counts anything.
				const usage = await deps.usage.usageFor(ownerId, renderPeriodStart(now));
				const { durationMs } = compileSceneTimeline({
					document,
					fps: renderOptions.fps,
					loop: renderOptions.loop === true,
				});
				const crossed = renderCeilingCrossed(plan, usage, durationMs);
				if (crossed) {
					return { outcome: "plan-limit", ...crossed };
				}
				const saved = await saveRevision(deps.projects, { ownerId, document }, stored);
				if (saved.outcome === "conflict") {
					return { outcome: "conflict" };
				}
				revision = saved.revision;
			}

			const queued = await deps.jobs.submit({
				ownerId,
				projectId,
				revision,
				renderOptions,
				plan,
				now,
			});
			switch (queued.outcome) {
				case "accepted":
					return imported.notice
						? { outcome: "queued", job: queued.job, notice: imported.notice }
						: { outcome: "queued", job: queued.job };
				case "plan-limit":
					return { outcome: "plan-limit", ceiling: queued.ceiling, used: queued.used };
				case "resolution-limit":
					return { outcome: "resolution-limit", message: queued.message };
				default:
					// The project was deleted, or its revision moved, after it was saved.
					return { outcome: "conflict" };
			}
		},
	};
}
