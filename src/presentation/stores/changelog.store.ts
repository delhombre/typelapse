import {
	readDismissedEntryIds,
	writeDismissedEntryIds,
} from "@/presentation/utils/changelog-dismissals";
import { create } from "zustand";

interface ChangelogState {
	/** The entries this browser has dismissed. */
	dismissed: ReadonlySet<string>;
	/** Dismiss entries, and remember it: the card and the dot in More read the same fact. */
	dismiss: (ids: readonly string[]) => void;
}

export const useChangelogStore = create<ChangelogState>((set, get) => ({
	dismissed: readDismissedEntryIds(),
	dismiss: (ids) => {
		const dismissed = new Set([...get().dismissed, ...ids]);
		writeDismissedEntryIds(dismissed);
		set({ dismissed });
	},
}));
