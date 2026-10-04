import type { ProjectPayload } from "./project-payload";

export interface LocalProjectRecord {
	id: string;
	updatedAt: number;
	project: ProjectPayload;
}

export interface LocalProjectLibrary {
	version: 1;
	activeId: string | null;
	projects: readonly LocalProjectRecord[];
}

export const EMPTY_LOCAL_PROJECT_LIBRARY: LocalProjectLibrary = {
	version: 1,
	activeId: null,
	projects: [],
};

function isProjectPayload(value: unknown): value is ProjectPayload {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const project = value as Record<string, unknown>;
	return (
		typeof project.title === "string" &&
		project.title.trim().length > 0 &&
		typeof project.code === "string" &&
		project.code.trim().length > 0 &&
		typeof project.language === "string" &&
		typeof project.themeName === "string" &&
		typeof project.background === "string" &&
		Array.isArray(project.steps)
	);
}

function isRecord(value: unknown): value is LocalProjectRecord {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		record.id.trim().length > 0 &&
		typeof record.updatedAt === "number" &&
		Number.isFinite(record.updatedAt) &&
		isProjectPayload(record.project)
	);
}

function recentFirst(projects: readonly LocalProjectRecord[]): LocalProjectRecord[] {
	return [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function parseLocalProjectLibrary(json: string | null): LocalProjectLibrary {
	if (json === null) {
		return EMPTY_LOCAL_PROJECT_LIBRARY;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return EMPTY_LOCAL_PROJECT_LIBRARY;
	}
	if (typeof parsed !== "object" || parsed === null) {
		return EMPTY_LOCAL_PROJECT_LIBRARY;
	}
	const candidate = parsed as Record<string, unknown>;
	if (candidate.version !== 1 || !Array.isArray(candidate.projects)) {
		return EMPTY_LOCAL_PROJECT_LIBRARY;
	}
	const projects = recentFirst(candidate.projects.filter(isRecord));
	const requestedActive = typeof candidate.activeId === "string" ? candidate.activeId : null;
	const activeId = projects.some((project) => project.id === requestedActive)
		? requestedActive
		: (projects[0]?.id ?? null);
	return { version: 1, activeId, projects };
}

export function upsertLocalProject(
	library: LocalProjectLibrary,
	record: LocalProjectRecord,
): LocalProjectLibrary {
	const projects = recentFirst([
		record,
		...library.projects.filter((project) => project.id !== record.id),
	]);
	return { version: 1, activeId: record.id, projects };
}

export function selectLocalProject(library: LocalProjectLibrary, id: string): LocalProjectLibrary {
	if (!library.projects.some((project) => project.id === id)) {
		return library;
	}
	return { ...library, activeId: id };
}

export function activeLocalProject(library: LocalProjectLibrary): LocalProjectRecord | null {
	return library.projects.find((project) => project.id === library.activeId) ?? null;
}

export function removeLocalProject(library: LocalProjectLibrary, id: string): LocalProjectLibrary {
	const projects = library.projects.filter((project) => project.id !== id);
	const activeId = library.activeId === id ? (projects[0]?.id ?? null) : library.activeId;
	return { version: 1, activeId, projects };
}

const UNTITLED = "Untitled";

/**
 * The name a new project starts with: the first of "Untitled", "Untitled 2",
 * "Untitled 3" no project on the device already uses. Three projects all
 * called Untitled made the library menu three identical lines.
 */
export function nextUntitledTitle(titles: readonly string[]): string {
	const taken = new Set(titles.map((title) => title.trim().toLowerCase()));
	if (!taken.has(UNTITLED.toLowerCase())) {
		return UNTITLED;
	}
	let n = 2;
	while (taken.has(`${UNTITLED} ${n}`.toLowerCase())) {
		n += 1;
	}
	return `${UNTITLED} ${n}`;
}

/**
 * The library menu's line for each title, in order: a title repeated by an
 * older project (or chosen twice) gets "(2)", "(3)" there, so no two lines,
 * and no two "Open …" names, read the same. The project keeps its own name.
 */
export function distinctProjectLabels(titles: readonly string[]): string[] {
	const seen = new Map<string, number>();
	return titles.map((title) => {
		const key = title.trim().toLowerCase();
		const count = (seen.get(key) ?? 0) + 1;
		seen.set(key, count);
		return count === 1 ? title : `${title} (${count})`;
	});
}
