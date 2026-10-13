import { isVideoExport } from "@/application/onboarding/first-video";
import {
	type FirstVideoPreference,
	readFirstVideoPreference,
	writeFirstVideoPreference,
} from "@/presentation/utils/first-video-preference";
import { create } from "zustand";
import { useExportStore } from "./export.store";
import { useHostedRenderJobsStore } from "./hosted-render-jobs.store";

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

/**
 * Read, merge, write: another tab may have hidden the card, or seen a render,
 * since this one loaded, and writing this tab's older copy back would erase it.
 * Each fact only ever turns on, so the merge is an OR of what this tab knows and
 * what is stored: with storage blocked the read returns defaults, and the OR
 * keeps what this tab already holds in memory.
 */
function update(
	known: FirstVideoPreference,
	change: Partial<FirstVideoPreference>,
): { preference: FirstVideoPreference } {
	const stored = readFirstVideoPreference();
	const preference = {
		dismissed: known.dismissed || stored.dismissed,
		rendered: known.rendered || stored.rendered,
		completed: known.completed || stored.completed,
		...change,
	};
	writeFirstVideoPreference(preference);
	return { preference };
}

export const useFirstVideoStore = create<FirstVideoState>((set) => ({
	preference: loaded,
	completedAtLoad: loaded.completed,
	dismiss: () => set((state) => update(state.preference, { dismissed: true })),
	markRendered: () => set((state) => update(state.preference, { rendered: true })),
	markCompleted: () => set((state) => update(state.preference, { completed: true })),
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

// A hosted Cloud render sets no export outcome: its phase is the fact. A job
// that succeeds, or a reload that resumes straight onto one, is a first video.
useHostedRenderJobsStore.subscribe((state, previous) => {
	const phase = state.phase;
	if (phase.kind !== "succeeded") {
		return;
	}
	if (previous.phase.kind !== "succeeded" || previous.phase.jobId !== phase.jobId) {
		useFirstVideoStore.getState().markRendered();
	}
});
