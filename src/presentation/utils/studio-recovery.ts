/**
 * What the studio does when the project it stored is the thing that will not
 * open.
 *
 * A project that throws on arrival throws again on every reload, and "Reload to
 * pick up where you left off" is then a lie that only clearing site storage
 * ends. The way out is never to delete the project: it is set aside under the
 * **recovery key**, in the same storage, and the studio starts on the default
 * project. Nothing the person made is lost; it is just no longer in the way.
 */

import { useExportStore } from "@/presentation/stores/export.store";
import { notify } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { LOCAL_PROJECTS_STORAGE_KEY } from "@/presentation/utils/local-project-storage";
import { DRAFT_STORAGE_KEY } from "@/presentation/utils/studio-storage-keys";

export const RECOVERY_STORAGE_KEY = "typelapse:recovery:v1";

/** The one line the studio says when it has set a project aside. */
export const RECOVERY_NOTICE = "The last project could not be opened; it was kept.";

/** Enough to find a project again, few enough that a loop cannot fill the storage. */
const MAX_KEPT = 5;

export interface KeptProject {
	/** When it was set aside (ms since the epoch). */
	readonly keptAt: number;
	/** The raw draft exactly as it was stored, or null when there was none. */
	readonly draft: string | null;
	/** The raw local project library exactly as it was stored, or null. */
	readonly projects: string | null;
}

/** Every project set aside on this device, oldest first. */
export function readKeptProjects(): KeptProject[] {
	try {
		const parsed: unknown = JSON.parse(window.localStorage.getItem(RECOVERY_STORAGE_KEY) ?? "[]");
		return Array.isArray(parsed) ? (parsed as KeptProject[]) : [];
	} catch {
		return [];
	}
}

function readRaw(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

/**
 * Move the stored project under the recovery key. Returns false, and leaves the
 * stored project where it is, when the copy could not be written: a project is
 * never removed before it is safe somewhere else.
 */
export function setStoredProjectAside(now = Date.now()): boolean {
	const draft = readRaw(DRAFT_STORAGE_KEY);
	const projects = readRaw(LOCAL_PROJECTS_STORAGE_KEY);
	if (draft === null && projects === null) {
		return true;
	}
	try {
		const kept = [...readKeptProjects(), { keptAt: now, draft, projects }].slice(-MAX_KEPT);
		window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(kept));
		window.localStorage.removeItem(DRAFT_STORAGE_KEY);
		window.localStorage.removeItem(LOCAL_PROJECTS_STORAGE_KEY);
		return true;
	} catch {
		return false;
	}
}

/** The studio as a first visit finds it. */
function startDefaultProject(): void {
	useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	useExportStore.setState(useExportStore.getInitialState(), true);
	useSnippetStore.getState().rebuildPlan();
}

/**
 * The stored project could not be read into the studio (the restore refused it
 * before touching anything): keep it, say so once. The studio is still the
 * default project, so there is nothing to start.
 */
export function keepUnreadableProject(): void {
	setStoredProjectAside();
	notify(RECOVERY_NOTICE, { durationMs: 10_000 });
}

/**
 * The stored project threw the studio after it was read in: keep it, start the
 * default project, say so once.
 */
export function recoverFromStoredProject(): void {
	startDefaultProject();
	keepUnreadableProject();
}
