import { create } from "zustand";

/**
 * A request, from anywhere in the studio, to open the Showcase.
 *
 * The gallery keeps owning its own `open` state (its trigger, its focus return and
 * its confirm all hang on it); this only carries the ask across, in the shape of
 * the diff dialog's hand-off (`diff-import.store.ts`): one fact and two verbs, so
 * the empty scene list does not have to know how the gallery is built.
 *
 * The ask may name the control that made it. The gallery hands focus back to that
 * control when it closes, instead of to its own header trigger the person never
 * touched.
 */
interface ShowcaseRequest {
	/** True from the ask until the gallery has picked it up. */
	requested: boolean;
	/** The control that asked, kept until the gallery picks the request up. */
	opener: HTMLElement | null;
	request: (opener?: HTMLElement | null) => void;
	take: () => void;
}

export const useShowcaseRequestStore = create<ShowcaseRequest>((set) => ({
	requested: false,
	opener: null,
	request: (opener = null) => set({ requested: true, opener }),
	take: () => set({ requested: false, opener: null }),
}));
