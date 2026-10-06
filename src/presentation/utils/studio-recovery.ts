/**
 * What the studio does when the project it stored is the thing that will not
 * open.
 *
 * A project that throws on arrival throws again on every reload, and "Reload to
 * pick up where you left off" is then a lie that only clearing site storage
 * ends. The way out is never to delete the project: the open project alone (its
 * library entry and the draft that mirrors it) moves under the **recovery
 * key**, one slot per project id, and a fresh project takes its place. The
 * other projects of the library are not touched, a slot is never evicted to
 * make room for another, and the default project is never kept: it is nobody's
 * work.
 */

import { activeLocalProject, nextUntitledTitle } from "@/application/project/local-project-library";
import type { ProjectPayload } from "@/application/project/project-payload";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { useExportStore } from "@/presentation/stores/export.store";
import { notify } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	loadStudioCompositionDocument,
	readStudioCompositionSnapshot,
} from "@/presentation/stores/studio-composition.store";
import {
	createLocalProject,
	deleteLocalProject,
	readLocalProjects,
} from "@/presentation/utils/local-project-storage";
import { saveJsonFile } from "@/presentation/utils/save-json-file";
import { DRAFT_STORAGE_KEY } from "@/presentation/utils/studio-storage-keys";

export const RECOVERY_STORAGE_KEY = "typelapse:recovery:v1";

/** The one line the studio says when it has set a project aside. */
export const RECOVERY_NOTICE = "The last project could not be opened; it was kept.";

/** The notice's one action: the kept project, as a file the studio opens. */
export const RECOVERY_ACTION = "Download it";

export interface KeptProject {
	/** The local project's id; the draft's own when only the draft held it. */
	readonly id: string;
	/** When it was set aside (ms since the epoch). */
	readonly keptAt: number;
	readonly title: string;
	/** The project as the library held it, or null when it was not there. */
	readonly project: ProjectPayload | null;
	/** The draft exactly as it was stored, or null when there was none. */
	readonly draft: string | null;
}

interface RecoveryShelf {
	readonly version: 1;
	readonly kept: Readonly<Record<string, KeptProject>>;
}

function readShelf(): RecoveryShelf {
	try {
		const parsed: unknown = JSON.parse(window.localStorage.getItem(RECOVERY_STORAGE_KEY) ?? "null");
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			(parsed as RecoveryShelf).version === 1 &&
			typeof (parsed as RecoveryShelf).kept === "object"
		) {
			return parsed as RecoveryShelf;
		}
	} catch {
		// Unreadable: there is nothing to add to but a new shelf.
	}
	return { version: 1, kept: {} };
}

/** Every project set aside on this device, oldest first. */
export function readKeptProjects(): KeptProject[] {
	return Object.values(readShelf().kept).sort((a, b) => a.keptAt - b.keptAt);
}

function readDraftRaw(): string | null {
	try {
		return window.localStorage.getItem(DRAFT_STORAGE_KEY);
	} catch {
		return null;
	}
}

/**
 * Same work, title aside: the fresh project a recovery opens is "Untitled 2"
 * and still nobody's work.
 */
function sameWork(a: ProjectPayload, b: ProjectPayload): boolean {
	return canonical({ ...a, title: "" }) === canonical({ ...b, title: "" });
}

/** JSON with sorted keys: a draft written by an older studio orders its fields differently. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, field: unknown) =>
		typeof field === "object" && field !== null && !Array.isArray(field)
			? Object.fromEntries(Object.entries(field).sort(([a], [b]) => a.localeCompare(b)))
			: field,
	);
}

/** A stored draft holds work unless it is, field for field, the default project. */
function draftHoldsWork(draft: string | null, defaultProject: ProjectPayload): boolean {
	if (draft === null) {
		return false;
	}
	try {
		return !sameWork(JSON.parse(draft) as ProjectPayload, defaultProject);
	} catch {
		// Unreadable is not empty: it may be all that is left of the work.
		return true;
	}
}

/**
 * The open project as the device stores it, or null when what is stored is
 * only the default project.
 */
export function storedActiveProject(
	defaultProject: ProjectPayload,
	now = Date.now(),
): KeptProject | null {
	const draft = readDraftRaw();
	const active = activeLocalProject(readLocalProjects());
	const project = active && !sameWork(active.project, defaultProject) ? active.project : null;
	const keptDraft = draftHoldsWork(draft, defaultProject) ? draft : null;
	if (project === null && keptDraft === null) {
		return null;
	}
	return {
		id: active?.id ?? `draft-${now}`,
		keptAt: now,
		title: project?.title ?? titleOf(keptDraft) ?? "Untitled",
		project,
		draft: keptDraft,
	};
}

function titleOf(draft: string | null): string | null {
	try {
		const title = (JSON.parse(draft ?? "null") as { title?: unknown } | null)?.title;
		return typeof title === "string" && title.trim() !== "" ? title : null;
	} catch {
		return null;
	}
}

export type SetAside =
	| { readonly status: "kept"; readonly kept: KeptProject }
	/** What is stored is the default project: there was nothing to keep. */
	| { readonly status: "nothing" }
	/** The copy could not be written; the project is where it was. */
	| { readonly status: "failed"; readonly project: KeptProject };

/**
 * Move the open project under the recovery key and open a fresh one in its
 * place. The copy is written first; only then do the draft and the project's
 * library entry go, so a project is never removed before it is safe somewhere
 * else. A second recovery of the same project fills the same slot.
 */
export function setAsideActiveProject(defaultProject: ProjectPayload, now = Date.now()): SetAside {
	const kept = storedActiveProject(defaultProject, now);
	if (kept === null) {
		return { status: "nothing" };
	}
	try {
		const shelf = readShelf();
		window.localStorage.setItem(
			RECOVERY_STORAGE_KEY,
			JSON.stringify({ version: 1, kept: { ...shelf.kept, [kept.id]: kept } }),
		);
	} catch {
		return { status: "failed", project: kept };
	}
	try {
		window.localStorage.removeItem(DRAFT_STORAGE_KEY);
	} catch {
		// Blocked storage: the copy is written, which is what matters.
	}
	if (kept.project !== null) {
		deleteLocalProject(kept.id);
		// Explicitly a new project: left to the library, the most recent of the
		// others would become the open one and the next autosave would write the
		// default project over it.
		createLocalProject(
			{
				...defaultProject,
				title: nextUntitledTitle(readLocalProjects().projects.map((r) => r.project.title)),
			},
			{ now },
		);
	}
	return { status: "kept", kept };
}

/** The kept project as the studio's JSON: what a JSON export writes, and opens again. */
export function keptProjectJson(kept: KeptProject): string {
	if (kept.project !== null) {
		return JSON.stringify(kept.project, null, 2);
	}
	try {
		return JSON.stringify(JSON.parse(kept.draft ?? ""), null, 2);
	} catch {
		// Not JSON any more: the bytes as they were, which are still somebody's.
		return kept.draft ?? "";
	}
}

export function downloadKeptProject(kept: KeptProject): void {
	saveJsonFile(keptProjectJson(kept), kept.title);
}

/**
 * Say it once, with the way back: the notice stays until it is dismissed, since
 * its action is how the project leaves the recovery key without devtools.
 */
export function announceKeptProject(kept: KeptProject): void {
	notify(RECOVERY_NOTICE, {
		action: { label: RECOVERY_ACTION, onSelect: () => downloadKeptProject(kept) },
		durationMs: Number.POSITIVE_INFINITY,
	});
}

/** The studio as a first visit finds it, in memory only: storage is not touched. */
export function startDefaultProject(): ProjectPayload {
	useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	useExportStore.setState(useExportStore.getInitialState(), true);
	useSnippetStore.getState().rebuildPlan();
	// The composition follows: no layer of the project that threw comes along.
	loadStudioCompositionDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	return useSnippetStore.getState().toProjectPayload();
}
