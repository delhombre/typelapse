import { CHANGELOG_ENTRIES, WHATS_NEW_COUNT, latestEntries } from "@/application/changelog/entries";
import {
	DOCS_HREF,
	DOCS_LABEL,
	FOCUS_EXAMPLE,
	FOCUS_INTRO,
	SCENE_LINES,
	focusExampleMeaning,
} from "@/application/help/help-content";
import { STUDIO_SHORTCUTS, keyCaps } from "@/application/shortcuts/studio-shortcuts";
import { StudioBottomSheet } from "@/presentation/components/ui/studio-bottom-sheet";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { useChangelogStore } from "@/presentation/stores/changelog.store";
import { useHelpRequestStore } from "@/presentation/stores/help-request.store";
import { currentPlatform } from "@/presentation/utils/platform";
import { motion } from "motion/react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { X } from "reicon-react";
import { useUnreadChanges } from "./new-mark";

/** The date an entry shipped, as "Oct 13". Read in UTC so the day never shifts with the zone. */
function shortDate(isoDate: string): string {
	return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
		new Date(`${isoDate}T00:00:00Z`),
	);
}

/**
 * The studio's Help: how scenes work, the focus lines format and the keyboard,
 * in plain sentences, with What's new on top while there is something unread.
 *
 * It has no button of its own. Whoever asks (the desktop island, the phone's More
 * menu) goes through `useHelpRequestStore`, the way the Showcase and the library
 * are asked for, and gets focus back when the sheet closes.
 */
export function HelpSheet() {
	const [open, setOpen] = useState(false);
	const openerRef = useRef<HTMLElement | null>(null);
	const bodyRef = useRef<HTMLDivElement>(null);

	const requested = useHelpRequestStore((state) => state.requested);
	const takeRequest = useHelpRequestStore((state) => state.take);
	useEffect(() => {
		if (requested) {
			openerRef.current = useHelpRequestStore.getState().opener;
			takeRequest();
			setOpen(true);
		}
	}, [requested, takeRequest]);

	const close = useCallback(() => setOpen(false), []);

	// The page behind a modal dialog is inert until the exit has played.
	const returnFocusToOpener = useCallback(() => {
		const opener = openerRef.current;
		openerRef.current = null;
		if (opener?.isConnected) {
			opener.focus();
		}
	}, []);

	return (
		<StudioBottomSheet
			open={open}
			onClose={close}
			onClosed={returnFocusToOpener}
			labelledBy="help-title"
			className="help-sheet"
		>
			<header className="studio-sheet-header">
				<div>
					<h2 id="help-title">Help</h2>
					<p>How scenes work, how to focus lines, and the keys.</p>
				</div>
				<button type="button" onClick={close} aria-label="Close help">
					<X size={14} aria-hidden="true" />
				</button>
			</header>
			<div className="help-body" ref={bodyRef} tabIndex={-1}>
				<WhatsNew onDismissed={() => bodyRef.current?.focus()} />
				<HelpContent />
			</div>
		</StudioBottomSheet>
	);
}

/** The latest changes, with one way to put them away. Nothing renders once they are. */
function WhatsNew({ onDismissed }: { onDismissed: () => void }) {
	const unread = useUnreadChanges();
	const dismiss = useChangelogStore((state) => state.dismiss);
	if (unread.length === 0) {
		return null;
	}
	const shown = latestEntries(CHANGELOG_ENTRIES, WHATS_NEW_COUNT);
	return (
		<section className="help-news" aria-labelledby="help-news-title">
			<div className="help-news-head">
				<h3 id="help-news-title">What's new</h3>
				<motion.button
					type="button"
					className="help-news-dismiss"
					whileTap={{ scale: 0.97 }}
					transition={springs.snappy}
					onClick={() => {
						feedback("selection");
						dismiss(shown.map((entry) => entry.id));
						onDismissed();
					}}
				>
					Dismiss
				</motion.button>
			</div>
			<ul>
				{shown.map((entry) => (
					<li key={entry.id}>
						<strong>{entry.title}</strong>
						<time dateTime={entry.date}>{shortDate(entry.date)}</time>
					</li>
				))}
			</ul>
		</section>
	);
}

function HelpContent() {
	const platform = currentPlatform();
	return (
		<>
			<section aria-labelledby="help-scenes-title">
				<h3 id="help-scenes-title">How scenes work</h3>
				<ol className="help-lines">
					{SCENE_LINES.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ol>
			</section>

			<section aria-labelledby="help-focus-title">
				<h3 id="help-focus-title">Focus lines</h3>
				<p>{FOCUS_INTRO}</p>
				<p>
					Example: <code>{FOCUS_EXAMPLE}</code> {focusExampleMeaning()}
				</p>
			</section>

			<section aria-labelledby="help-keys-title">
				<h3 id="help-keys-title">Keyboard shortcuts</h3>
				<ul className="help-shortcuts">
					{STUDIO_SHORTCUTS.map((shortcut) => (
						<li key={shortcut.id}>
							<span>{shortcut.label}</span>
							<span className="help-chords">
								{shortcut.chords.map((chord, index) => (
									<Fragment key={`${chord.modifier ?? ""}${chord.shift ?? ""}${chord.key}`}>
										{index > 0 && <span className="help-or">or</span>}
										<span className="help-chord">
											{keyCaps(chord, platform).map((cap) => (
												<kbd key={cap}>{cap}</kbd>
											))}
										</span>
									</Fragment>
								))}
							</span>
						</li>
					))}
				</ul>
			</section>

			<p className="help-docs">
				{/* A new tab: the studio keeps the project, and the page it opens is the landing's. */}
				<a href={DOCS_HREF} target="_blank" rel="noopener noreferrer">
					{DOCS_LABEL}
				</a>{" "}
				on the home page follows a project from paste to export. It opens in a new tab.
			</p>
		</>
	);
}
