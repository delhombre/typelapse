import { isVideoExport } from "@/application/onboarding/first-video";
import {
	type FirstVideoPreference,
	readFirstVideoPreference,
	writeFirstVideoPreference,
} from "@/presentation/utils/first-video-preference";
import { create } from "zustand";
import { useExportStore } from "./export.store";

interface FirstVideoState {
	preference: FirstVideoPreference;
	/**
	 * `completed` as it was when the studio loaded. The card leaves on the load
	 * after its completion, not on the write that records it mid-session: the
	 * visitor gets to read the line they earned.
	 */
	completedAtLoad: boolean;
	/** "Later": hidden for good. */
	dismiss: () => void;
	/** A video finished rendering on this browser. */
	markRendered: () => void;
	/** The completion line was shown. */
	markCompleted: () => void;
}

const loaded = readFirstVideoPreference();

function update(
	state: FirstVideoState,
	change: Partial<FirstVideoPreference>,
): Pick<FirstVideoState, "preference"> | FirstVideoState {
	const preference = { ...state.preference, ...change };
	if (
		preference.dismissed === state.preference.dismissed &&
		preference.rendered === state.preference.rendered &&
		preference.completed === state.preference.completed
	) {
		return state;
	}
	writeFirstVideoPreference(preference);
	return { preference };
}

export const useFirstVideoStore = create<FirstVideoState>((set) => ({
	preference: loaded,
	completedAtLoad: loaded.completed,
	dismiss: () => set((state) => update(state, { dismissed: true })),
	markRendered: () => set((state) => update(state, { rendered: true })),
	markCompleted: () => set((state) => update(state, { completed: true })),
}));

// At module scope, not in the card: a render that finishes while the card is
// not on screen (the phone's sheet closed, Preview open) is still the visitor's
// first video, and the store is the only place that can remember it.
useExportStore.subscribe((state, previous) => {
	const outcome = state.outcome;
	if (outcome !== previous.outcome && outcome?.kind === "done" && isVideoExport(outcome.filename)) {
		useFirstVideoStore.getState().markRendered();
	}
});
