import { create } from "zustand";

/**
 * The studio's exceptional feedback surface.
 *
 * Until now the only feedback the studio gave was export-only; everything else
 * either worked silently or died in the console. A notice is the small honest
 * middle: it names what happened, waits politely, and leaves on its own. Direct
 * manipulation owns feedback beside the changed object; this store is for
 * failures that have no stable local surface. It is never a dialog — anything
 * that needs an answer belongs in a confirm, not here.
 */

export type NoticeTone = "info" | "error";

export interface StudioNotice {
	id: number;
	/** Human prose, set in the UI face (Geist). */
	message: string;
	/** Machine text (a filename, a size), rendered in mono beside the prose. */
	detail?: string;
	tone: NoticeTone;
	/** One exceptional recovery path (for example retry). Direct Undo stays local. */
	action?: NoticeAction;
}

export interface NoticeAction {
	label: string;
	onSelect: () => void;
}

export interface NotifyOptions {
	detail?: string;
	tone?: NoticeTone;
	action?: NoticeAction;
	/** How long the notice dwells before dismissing itself. */
	durationMs?: number;
}

interface NoticeState {
	notices: StudioNotice[];
	/** Post a notice; returns its id so a caller can dismiss it early. */
	notify: (message: string, options?: NotifyOptions) => number;
	dismiss: (id: number) => void;
}

/** Long enough to read a sentence and a filename, short enough to not nag. */
const AUTO_DISMISS_MS = 5000;

let nextId = 1;

/** Auto-dismiss timers, kept out of the state: they are plumbing, not data. */
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useNoticeStore = create<NoticeState>((set, get) => ({
	notices: [],

	notify: (message, options) => {
		const id = nextId++;
		const notice: StudioNotice = {
			id,
			message,
			tone: options?.tone ?? "info",
			...(options?.detail !== undefined ? { detail: options.detail } : {}),
			...(options?.action !== undefined ? { action: options.action } : {}),
		};
		set({ notices: [...get().notices, notice] });
		timers.set(
			id,
			setTimeout(() => get().dismiss(id), options?.durationMs ?? AUTO_DISMISS_MS),
		);
		return id;
	},

	dismiss: (id) => {
		const timer = timers.get(id);
		if (timer !== undefined) {
			clearTimeout(timer);
			timers.delete(id);
		}
		set({ notices: get().notices.filter((notice) => notice.id !== id) });
	},
}));

/**
 * Imperative doorway for event handlers and non-React code: most callers hold
 * no hook context when something goes wrong.
 */
export function notify(message: string, options?: NotifyOptions): number {
	return useNoticeStore.getState().notify(message, options);
}
