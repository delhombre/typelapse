import {
	type LocalProjectLibrary,
	type LocalProjectRecord,
	activeLocalProject,
	parseLocalProjectLibrary,
	removeLocalProject,
	selectLocalProject,
	upsertLocalProject,
} from "@/application/project/local-project-library";
import type { ProjectPayload } from "@/application/project/project-payload";

export const LOCAL_PROJECTS_STORAGE_KEY = "typelapse:projects:v1";
export const LOCAL_PROJECTS_CHANGED_EVENT = "typelapse:projects-changed";

interface WriteOptions {
	id?: string;
	now?: number;
}

function makeId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}
}

export function readLocalProjects(): LocalProjectLibrary {
	try {
		return parseLocalProjectLibrary(window.localStorage.getItem(LOCAL_PROJECTS_STORAGE_KEY));
	} catch {
		return parseLocalProjectLibrary(null);
	}
}

function writeLocalProjects(library: LocalProjectLibrary): void {
	try {
		window.localStorage.setItem(LOCAL_PROJECTS_STORAGE_KEY, JSON.stringify(library));
		window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED_EVENT));
	} catch {
		// Local projects are an enhancement over the single draft. The studio must
		// remain editable when storage is blocked or full.
	}
}

export function ensureActiveLocalProject(
	project: ProjectPayload,
	options: WriteOptions = {},
): LocalProjectRecord {
	const library = readLocalProjects();
	const active = activeLocalProject(library);
	if (active) {
		return active;
	}
	return createLocalProject(project, options);
}

export function createLocalProject(
	project: ProjectPayload,
	options: WriteOptions = {},
): LocalProjectRecord {
	const record: LocalProjectRecord = {
		id: options.id ?? makeId(),
		updatedAt: options.now ?? Date.now(),
		project,
	};
	writeLocalProjects(upsertLocalProject(readLocalProjects(), record));
	return record;
}

export function saveActiveLocalProject(
	project: ProjectPayload,
	now = Date.now(),
): LocalProjectRecord {
	const library = readLocalProjects();
	const active = activeLocalProject(library);
	if (!active) {
		return createLocalProject(project, { now });
	}
	const record = { ...active, project, updatedAt: now };
	writeLocalProjects(upsertLocalProject(library, record));
	return record;
}

export function activateLocalProject(id: string): LocalProjectRecord | null {
	const library = readLocalProjects();
	const selected = library.projects.find((project) => project.id === id) ?? null;
	if (!selected) {
		return null;
	}
	writeLocalProjects(selectLocalProject(library, id));
	return selected;
}

export function deleteLocalProject(id: string): LocalProjectRecord | null {
	const next = removeLocalProject(readLocalProjects(), id);
	writeLocalProjects(next);
	return activeLocalProject(next);
}

export function subscribeLocalProjects(listener: () => void): () => void {
	const storageListener = (event: StorageEvent) => {
		if (event.key === LOCAL_PROJECTS_STORAGE_KEY) {
			listener();
		}
	};
	window.addEventListener(LOCAL_PROJECTS_CHANGED_EVENT, listener);
	window.addEventListener("storage", storageListener);
	return () => {
		window.removeEventListener(LOCAL_PROJECTS_CHANGED_EVENT, listener);
		window.removeEventListener("storage", storageListener);
	};
}

export function starterProjectPayload(): ProjectPayload {
	return {
		title: "Untitled",
		code: `function greet(name: string) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Typelapse"));`,
		language: "typescript",
		themeName: "midnight",
		background: "mesh:solar",
		windowChrome: "macos",
		showLineNumbers: true,
		lineNumberStart: 1,
		framePadding: 24,
		cardMargin: 32,
		progressStyle: "reels",
		transitionMs: 650,
		width: 1920,
		height: 1080,
		steps: [],
	};
}
