import {
	CHANGELOG_ENTRIES,
	WHATS_NEW_COUNT,
	latestEntries,
	undismissedEntries,
} from "@/application/changelog/entries";
import { useChangelogStore } from "@/presentation/stores/changelog.store";

/** The entries What's new shows now: the latest few that are not dismissed. */
export function useUnreadChanges() {
	const dismissed = useChangelogStore((state) => state.dismissed);
	return undismissedEntries(latestEntries(CHANGELOG_ENTRIES, WHATS_NEW_COUNT), dismissed);
}

/**
 * The dot that says something is new in Help: a dot and not a count, and in ink
 * rather than the primary, which is the one fill of its zone (DECISIONS D2). It is
 * for the eye; the control it sits on describes the news for everyone else.
 */
export function NewDot() {
	return <span className="sc-new-dot" aria-hidden="true" />;
}
