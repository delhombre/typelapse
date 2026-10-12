import { create } from "zustand";

/**
 * A request, from anywhere in the studio, to open the Showcase.
 *
 * The gallery keeps owning its own `open` state (its trigger, its focus return and
 * its confirm all hang on it); this only carries the ask across, in the shape of
 * the diff dialog's hand-off (`diff-import.store.ts`): one fact and two verbs, so
 * the empty scene list does not have to know how the gallery is built.
 */
interface ShowcaseRequest {
	/** True from the ask until the gallery has picked it up. */
	requested: boolean;
	request: () => void;
	take: () => void;
}

export const useShowcaseRequestStore = create<ShowcaseRequest>((set) => ({
	requested: false,
	request: () => set({ requested: true }),
	take: () => set({ requested: false }),
}));
