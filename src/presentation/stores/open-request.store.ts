import { create } from "zustand";

/**
 * A request, from anywhere in the studio, to open a sheet that keeps its own `open`
 * state (the Showcase, the capture library): one fact and two verbs, so the asker
 * does not have to know how the sheet is built.
 *
 * The ask may name the control that made it. The sheet hands focus back to that
 * control when it closes, instead of to its own trigger the person never touched
 * (and which, on a phone, is not drawn at all: the More menu asks).
 */
export interface OpenRequest {
	/** True from the ask until the sheet has picked it up. */
	requested: boolean;
	/** The control that asked, kept until the sheet picks the request up. */
	opener: HTMLElement | null;
	request: (opener?: HTMLElement | null) => void;
	take: () => void;
}

export function createOpenRequestStore() {
	return create<OpenRequest>((set) => ({
		requested: false,
		opener: null,
		request: (opener = null) => set({ requested: true, opener }),
		take: () => set({ requested: false, opener: null }),
	}));
}
