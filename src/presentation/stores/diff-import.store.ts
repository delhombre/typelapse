import { create } from "zustand";

/**
 * A counter between the two import controls in the nav.
 *
 * The URL importer can recognise a pull request URL and cannot do anything with
 * one: it fetches a single file's contents, and a PR is a walkthrough. The diff
 * dialog sitting immediately beside it accepts exactly that URL, offers the
 * whole-change or by-commit choice, and knows how to fetch it. Refusing the
 * paste with "Unsupported URL" while the control next door was waiting for it
 * made the user do the routing by hand.
 *
 * Deliberately one fact and two verbs rather than a lifted `open`/`text` pair.
 * The dialog keeps owning its own state; this only carries the request across,
 * so neither control has to know how the other is built.
 */
interface DiffImportHandoff {
	/**
	 * Text handed over by another control, waiting for the dialog to pick it up.
	 * An empty string hands over no text: the dialog just opens, as it is.
	 */
	pending: string | null;
	/**
	 * The control that handed over, kept until the dialog picks the hand-off up:
	 * the dialog gives focus back to it when it closes.
	 */
	opener: HTMLElement | null;
	handOff: (text: string, opener?: HTMLElement | null) => void;
	take: () => void;
}

export const useDiffImportStore = create<DiffImportHandoff>((set) => ({
	pending: null,
	opener: null,
	handOff: (text, opener = null) => set({ pending: text, opener }),
	take: () => set({ pending: null, opener: null }),
}));
