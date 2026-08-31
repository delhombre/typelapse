/**
 * The studio's memory across refreshes.
 *
 * The draft is the SAME payload a JSON export writes (`toProjectPayload`, the
 * format's single producer), persisted to localStorage a beat after each change
 * and restored through the same `importFromJson` path everything else loads by.
 * One rule governs the boot: an arrival that carries its own content — a
 * `#import=` deep link from the landing hero, a `#share=` link — always wins
 * over the draft. Whoever opens one of those asked for what it carries, not for
 * whatever they left behind last time.
 */

import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";

export const DRAFT_STORAGE_KEY = "typelapse:draft";

/** A beat after the last change: long enough to coalesce typing, short enough
 * that closing the tab a moment later loses nothing worth mourning. */
const DEBOUNCE_MS = 800;

/**
 * The ceiling a pending change can never wait past.
 *
 * A plain debounce would starve: the playback loop `set`s the snippet store on
 * every animation frame, so the timer would be re-armed sixty times a second
 * and an edit made just before pressing play would sit unwritten for the whole
 * video. A change reaches storage within this window however busy the store is.
 */
const MAX_WAIT_MS = 4000;

export function readDraft(): string | null {
	try {
		return window.localStorage.getItem(DRAFT_STORAGE_KEY);
	} catch {
		// Private mode or blocked storage: the studio still works, just amnesiac.
		return null;
	}
}

export function writeDraft(json: string): void {
	try {
		window.localStorage.setItem(DRAFT_STORAGE_KEY, json);
	} catch {
		// Quota or blocked storage: the draft is a courtesy, not a promise.
	}
}

export function clearDraft(): void {
	try {
		window.localStorage.removeItem(DRAFT_STORAGE_KEY);
	} catch {
		// A stash we cannot clear is a stash we never wrote.
	}
}

/** True when the URL fragment carries content of its own to load. */
export function hasArrivalPayload(hash: string): boolean {
	return hash.startsWith("#import=") || hash.startsWith("#share=");
}

/**
 * The whole restore policy, pure so it can be stated in one place: restore
 * only on a plain arrival, only when a draft exists, and only when it differs
 * from what the studio already shows.
 */
export function shouldRestoreDraft(args: {
	hash: string;
	draft: string | null;
	pristine: string;
}): boolean {
	if (args.draft === null || hasArrivalPayload(args.hash)) {
		return false;
	}
	return args.draft !== args.pristine;
}

/**
 * Bring last session's draft back, given the hash the page ARRIVED with (the
 * import-intent boot scrubs `#import=` in its own effect, so the caller must
 * capture the hash before the effects run). Returns true when the studio was
 * replaced. A draft that fails validation is dropped rather than allowed to
 * wedge every subsequent boot.
 */
export function restoreDraftOnBoot(hash: string): boolean {
	const draft = readDraft();
	const pristine = JSON.stringify(useSnippetStore.getState().toProjectPayload());
	if (draft === null || !shouldRestoreDraft({ hash, draft, pristine })) {
		return false;
	}
	try {
		useSnippetStore.getState().importFromJson(draft);
		return true;
	} catch {
		clearDraft();
		return false;
	}
}

export interface DraftAutosave {
	/** Write any pending change now: called before the page may go away. */
	flush: () => void;
	stop: () => void;
}

/**
 * Watch both stores the payload reads from and persist a beat after things
 * settle. The write is skipped when the payload has not actually changed, so
 * playback ticks and other non-project state churn never touch localStorage.
 */
export function startDraftAutosave(
	pristine?: string,
	onSave?: (json: string) => void,
): DraftAutosave {
	let timer: ReturnType<typeof setTimeout> | null = null;
	/** When the change now waiting was first noticed, for the ceiling above. */
	let pendingSince: number | null = null;
	let lastWritten = readDraft();

	const clearTimer = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const save = () => {
		clearTimer();
		pendingSince = null;
		const json = JSON.stringify(useSnippetStore.getState().toProjectPayload());
		// A studio that still holds exactly what it booted with has nothing to say,
		// and saying it costs the visitor their work. `hasArrivalPayload` answers
		// yes to a bare `#share=` prefix, so a malformed or unreachable link skips
		// the restore and then fails to load anything: the studio sits pristine,
		// and on the way out the flush wrote that emptiness over a perfectly good
		// draft. Nothing is written until the studio differs from the state it
		// arrived in, which is the first real edit either way.
		if (pristine !== undefined && json === pristine) {
			return;
		}
		if (json !== lastWritten) {
			writeDraft(json);
			lastWritten = json;
			onSave?.(json);
		}
	};

	const schedule = () => {
		const now = Date.now();
		if (pendingSince === null) {
			pendingSince = now;
		}
		const waited = now - pendingSince;
		if (waited >= MAX_WAIT_MS) {
			save();
			return;
		}
		clearTimer();
		// Never past the ceiling, even when the store settles a beat too late.
		timer = setTimeout(save, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - waited));
	};

	// The export store owns aspect / tempo / typewriter / zoom / progress style,
	// and the payload carries them: a change there is a change to the draft too.
	const unsubscribeSnippet = useSnippetStore.subscribe(schedule);
	const unsubscribeExport = useExportStore.subscribe(schedule);

	return {
		flush: save,
		stop: () => {
			unsubscribeSnippet();
			unsubscribeExport();
			clearTimer();
			pendingSince = null;
		},
	};
}
