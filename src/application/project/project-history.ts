import { type ProjectDocumentV2, parseProjectDocument } from "./project-document";

/**
 * The project history: one list of whole project documents and a position in
 * it. Undo and redo move the position; an edit cuts the redo branch and appends.
 *
 * Whole documents, not commands: every edit the studio can make (code, timing,
 * order, settings, layers, audio, a file opened over the project) is versioned
 * without any of them knowing about history, and going back is loading a
 * document, which is idempotent. Entries share every untouched part of the
 * document, so a long history of a 40-scene project costs only what changed;
 * the encoded form stores each entry as the changes from the one before.
 */
export interface ProjectHistory {
	readonly projectId: string;
	readonly entries: readonly ProjectDocumentV2[];
	readonly index: number;
	/** The last recorded edit, while a same-field edit may still fold into it. */
	readonly lastEdit: { readonly fields: string | null; readonly at: number } | null;
}

/** The most documents kept; the oldest go first. */
export const PROJECT_HISTORY_LIMIT = 100;

/**
 * Edits to the same fields closer than this fold into one entry: typing a word,
 * dragging a layer or scrubbing a number is one step back, not forty.
 */
export const PROJECT_HISTORY_COALESCE_MS = 1_000;

type Path = readonly (string | number)[];

/** One change between two entries: a value set at a path, or a key removed. */
interface DocumentChange {
	readonly path: Path;
	readonly value?: unknown;
	readonly removed?: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectChanges(previous: unknown, next: unknown, path: Path, out: DocumentChange[]): void {
	if (Object.is(previous, next)) {
		return;
	}
	if (Array.isArray(previous) && Array.isArray(next) && previous.length === next.length) {
		for (let index = 0; index < next.length; index += 1) {
			collectChanges(previous[index], next[index], [...path, index], out);
		}
		return;
	}
	if (isRecord(previous) && isRecord(next)) {
		for (const key of Object.keys(previous)) {
			if (!(key in next)) {
				out.push({ path: [...path, key], removed: true });
			}
		}
		for (const key of Object.keys(next)) {
			if (key in previous) {
				collectChanges(previous[key], next[key], [...path, key], out);
			} else {
				out.push({ path: [...path, key], value: next[key] });
			}
		}
		return;
	}
	// A primitive changed, a type changed, or a list changed length (a scene
	// added, removed or a block deleted): the value at this path is replaced.
	out.push({ path, value: next });
}

function changesBetween(previous: unknown, next: unknown): DocumentChange[] {
	const changes: DocumentChange[] = [];
	collectChanges(previous, next, [], changes);
	return changes;
}

function applyChange(target: unknown, change: DocumentChange, depth: number): unknown {
	if (depth === change.path.length) {
		return change.value;
	}
	const key = change.path[depth] as string | number;
	if (Array.isArray(target)) {
		const copy = [...target];
		copy[key as number] = applyChange(target[key as number], change, depth + 1);
		return copy;
	}
	const record = isRecord(target) ? target : {};
	if (change.removed && depth === change.path.length - 1) {
		const { [key]: _removed, ...rest } = record;
		return rest;
	}
	return { ...record, [key]: applyChange(record[key], change, depth + 1) };
}

function applyChanges<T>(document: T, changes: readonly DocumentChange[]): T {
	let result: unknown = document;
	for (const change of changes) {
		result = applyChange(result, change, 0);
	}
	return result as T;
}

function isScalar(value: unknown): boolean {
	return value === null || typeof value !== "object";
}

/**
 * What an edit touched, when it may fold into the edit before: only changes of
 * scalar values (a character typed, a number scrubbed, a layer dragged). A
 * scene or a layer added or removed is a step of its own, however quick.
 */
function foldableFields(previous: unknown, changes: readonly DocumentChange[]): string | null {
	const fields: string[] = [];
	for (const change of changes) {
		if (change.removed || !isScalar(change.value) || !isScalar(valueAt(previous, change.path))) {
			return null;
		}
		fields.push(change.path.join("."));
	}
	return fields.sort().join("|");
}

function valueAt(target: unknown, path: Path): unknown {
	let value: unknown = target;
	for (const key of path) {
		if (typeof value !== "object" || value === null) {
			return undefined;
		}
		value = (value as Record<string | number, unknown>)[key];
	}
	return value;
}

export function createProjectHistory(document: ProjectDocumentV2): ProjectHistory {
	return { projectId: document.project.id, entries: [document], index: 0, lastEdit: null };
}

export function presentProjectDocument(history: ProjectHistory): ProjectDocumentV2 {
	return history.entries[history.index] as ProjectDocumentV2;
}

export function canUndoProjectEdit(history: ProjectHistory): boolean {
	return history.index > 0;
}

export function canRedoProjectEdit(history: ProjectHistory): boolean {
	return history.index < history.entries.length - 1;
}

/**
 * Record the document as it now stands. Returns the same history when nothing
 * changed, so recording is idempotent and safe to call on every store update.
 */
export function recordProjectEdit(
	history: ProjectHistory,
	document: ProjectDocumentV2,
	now: number,
): ProjectHistory {
	const present = presentProjectDocument(history);
	const changes = changesBetween(present, document);
	if (changes.length === 0) {
		return history;
	}
	const next = applyChanges(present, changes);
	const fields = foldableFields(present, changes);
	const folds =
		fields !== null &&
		history.lastEdit !== null &&
		history.lastEdit.fields === fields &&
		now - history.lastEdit.at < PROJECT_HISTORY_COALESCE_MS &&
		history.index > 0 &&
		history.index === history.entries.length - 1;
	if (folds) {
		const before = history.entries[history.index - 1];
		// Typed and then deleted back: the burst left nothing to undo.
		if (changesBetween(before, next).length === 0) {
			return {
				...history,
				entries: history.entries.slice(0, history.index),
				index: history.index - 1,
				lastEdit: null,
			};
		}
		return {
			...history,
			entries: [...history.entries.slice(0, history.index), next],
			lastEdit: { fields, at: now },
		};
	}
	const entries = [...history.entries.slice(0, history.index + 1), next].slice(
		-PROJECT_HISTORY_LIMIT,
	);
	return { ...history, entries, index: entries.length - 1, lastEdit: { fields, at: now } };
}

/**
 * Replace the present entry with the document as the studio actually holds it
 * after loading that entry, without making it an edit: whatever the stores
 * normalize on the way in must not later read as a change that cuts redo.
 */
export function settleProjectHistory(
	history: ProjectHistory,
	document: ProjectDocumentV2,
): ProjectHistory {
	const present = presentProjectDocument(history);
	const changes = changesBetween(present, document);
	if (changes.length === 0) {
		return history;
	}
	const entries = [...history.entries];
	entries[history.index] = applyChanges(present, changes);
	return { ...history, entries };
}

/**
 * Carry the history over to the scene ids the project was reopened with. A
 * reload rebuilds the code spine with ids of its own; without this, every entry
 * would name scenes the studio no longer has, and the first undo would only
 * swap ids. Ids are matched by position between the stored present and the
 * reopened document, and only when both have the same number of scenes.
 */
export function rekeyProjectHistory(
	history: ProjectHistory,
	document: ProjectDocumentV2,
): ProjectHistory {
	const stored = presentProjectDocument(history).project.scenes;
	const opened = document.project.scenes;
	if (stored.length !== opened.length) {
		return history;
	}
	const ids = new Map<string, string>();
	stored.forEach((scene, index) => {
		const id = opened[index]?.id;
		if (id && id !== scene.id) {
			ids.set(scene.id, id);
		}
	});
	if (ids.size === 0) {
		return history;
	}
	const rekey = (entry: ProjectDocumentV2): ProjectDocumentV2 =>
		entry.project.scenes.some((scene) => ids.has(scene.id))
			? {
					...entry,
					project: {
						...entry.project,
						scenes: entry.project.scenes.map((scene) => {
							const id = ids.get(scene.id);
							return id ? { ...scene, id } : scene;
						}),
					},
				}
			: entry;
	return { ...history, entries: history.entries.map(rekey) };
}

export function undoProjectEdit(history: ProjectHistory): ProjectHistory {
	return canUndoProjectEdit(history)
		? { ...history, index: history.index - 1, lastEdit: null }
		: history;
}

export function redoProjectEdit(history: ProjectHistory): ProjectHistory {
	return canRedoProjectEdit(history)
		? { ...history, index: history.index + 1, lastEdit: null }
		: history;
}

/** The stored form: the first document, then each entry as its changes. */
export interface EncodedProjectHistory {
	readonly version: 1;
	readonly projectId: string;
	readonly base: ProjectDocumentV2;
	readonly edits: readonly (readonly DocumentChange[])[];
	readonly index: number;
}

export function encodeProjectHistory(history: ProjectHistory): EncodedProjectHistory {
	const [base, ...rest] = history.entries as [ProjectDocumentV2, ...ProjectDocumentV2[]];
	const edits = rest.map((entry, offset) => changesBetween(history.entries[offset], entry));
	return { version: 1, projectId: history.projectId, base, edits, index: history.index };
}

function isChange(value: unknown): value is DocumentChange {
	return (
		isRecord(value) &&
		Array.isArray(value.path) &&
		value.path.every((key) => typeof key === "string" || typeof key === "number")
	);
}

function parseV2(value: unknown): ProjectDocumentV2 | null {
	try {
		const parsed = parseProjectDocument(value);
		return parsed.schemaVersion === 2 ? parsed.document : null;
	} catch {
		return null;
	}
}

/**
 * Read a stored history back, or null when it is not one this version wrote or
 * any entry fails the document validation: a corrupt history is dropped, never
 * loaded into the studio.
 */
export function decodeProjectHistory(value: unknown): ProjectHistory | null {
	if (
		!isRecord(value) ||
		value.version !== 1 ||
		typeof value.projectId !== "string" ||
		!Array.isArray(value.edits) ||
		!Number.isInteger(value.index)
	) {
		return null;
	}
	const base = parseV2(value.base);
	if (!base || base.project.id !== value.projectId) {
		return null;
	}
	const entries: ProjectDocumentV2[] = [base];
	for (const edit of value.edits) {
		if (!Array.isArray(edit) || !edit.every(isChange)) {
			return null;
		}
		const previous = entries.at(-1) as ProjectDocumentV2;
		const next = parseV2(applyChanges(previous, edit));
		if (!next) {
			return null;
		}
		// Keep the untouched parts shared with the entry before, as recording does.
		entries.push(applyChanges(previous, changesBetween(previous, next)));
	}
	const index = value.index as number;
	if (index < 0 || index >= entries.length) {
		return null;
	}
	return { projectId: value.projectId, entries, index, lastEdit: null };
}
