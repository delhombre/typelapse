import { springs } from "@/presentation/motion";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type SyntheticEvent, useCallback, useEffect, useId, useRef } from "react";

const SNIPPET_DETAIL =
	"Your snippet has changes only this browser remembers. Loading this replaces them, and the autosaved draft with them. Export or copy a share link first if you want to keep them.";

/**
 * The one confirm every destructive load walks through.
 *
 * The template gallery grew this pattern first: ask in place, only when there
 * is work to lose, and name what would replace it. Now that a diff paste, a
 * URL fetch and a JSON file can all wipe the studio too, the card lives here
 * so all four ask with the same voice, and so the copy can tell the truth
 * about the autosaved draft in exactly one place. Its look lives with the
 * studio's other surfaces (`.sc-confirm` in studio-camera.css), read from the
 * studio's tokens, so a host that is already a surface can flatten it. A host
 * asking about something other than the snippet gives its own `detail` and
 * `keepLabel`.
 */
export function ConfirmDiscard({
	message,
	messageId,
	detail = SNIPPET_DETAIL,
	keepLabel = "Keep my snippet",
	focusKeep = false,
	confirmLabel,
	onCancel,
	onConfirm,
	className = "",
}: {
	/** Names what would replace the work: "Replace what you have with X?" */
	message: string;
	/** Lets a hosting dialog point `aria-labelledby` at the question itself. */
	messageId?: string;
	/** What else is lost, in one sentence; absent says the snippet's. */
	detail?: string;
	/** The safe answer's label; absent is the snippet's. */
	keepLabel?: string;
	/** Puts the keyboard on the safe answer when the question appears under the person's hand. */
	focusKeep?: boolean;
	confirmLabel: string;
	onCancel: () => void;
	onConfirm: () => void;
	/** Outer spacing, width and lift: the host decides how the card sits in its surface. */
	className?: string;
}) {
	const reduce = useReducedMotion();
	const keepRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (focusKeep) keepRef.current?.focus({ preventScroll: true });
	}, [focusKeep]);

	return (
		<motion.div
			data-confirm-discard
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
			animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
			exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
			transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
			className={`sc-confirm ${className}`}
		>
			<p id={messageId} className="sc-confirm-title">
				{message}
			</p>
			<p className="sc-confirm-text">{detail}</p>
			<div className="sc-confirm-actions">
				<motion.button
					ref={keepRef}
					type="button"
					onClick={onCancel}
					whileTap={{ scale: 0.97 }}
					transition={springs.snappy}
					className="sc-confirm-keep"
				>
					{keepLabel}
				</motion.button>
				<motion.button
					type="button"
					onClick={onConfirm}
					data-confirm-discard-confirm
					whileTap={{ scale: 0.97 }}
					transition={springs.snappy}
					className="sc-confirm-go"
				>
					{confirmLabel}
				</motion.button>
			</div>
		</motion.div>
	);
}

/**
 * The confirm as its own small modal, for callers with no popover to host it
 * in (the JSON file import lives behind a bare toolbar button).
 *
 * A native `<dialog>` opened with `showModal`, exactly as the template gallery
 * does it, and for a reason more concrete than doctrine: this modal is rendered
 * inside the top bar, and the top bar is `backdrop-blur`. A backdrop filter
 * makes its element the containing block for every `fixed` descendant, so a
 * plain `fixed inset-0` scrim here covers the 56px nav strip and nothing else.
 * The top layer is outside that trap, and it also traps Tab and makes the
 * studio behind genuinely inert, which a div with role="dialog" cannot.
 *
 * The dialog element itself stays mounted so the card can animate both ways:
 * AnimatePresence plays the exit, and only then is `close()` called.
 */
export function ConfirmDiscardOverlay({
	open,
	message,
	confirmLabel,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	message: string;
	confirmLabel: string;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);
	const messageId = useId();
	// The app-wide `reducedMotion="user"` floor strips transforms but not filters,
	// so the blur has to be dropped here by hand, as the gallery panel does.
	const reduce = useReducedMotion();

	useEffect(() => {
		if (!open) {
			return;
		}
		dialogRef.current?.showModal();
		// showModal focuses the first focusable child, which is the scrim button.
		// Put the caret on the card instead, so Tab starts at "Keep my snippet".
		cardRef.current?.focus();
	}, [open]);

	/** Native Escape means "keep my snippet", and keeps the exit animation. */
	const handleCancel = useCallback(
		(event: SyntheticEvent) => {
			// Letting the browser close the dialog outright would skip the exit.
			event.preventDefault();
			onCancel();
		},
		[onCancel],
	);

	return (
		// Sized to the viewport with a transparent native backdrop: the animated
		// one below is ours, so it can fade with the card.
		<dialog
			ref={dialogRef}
			onCancel={handleCancel}
			aria-labelledby={messageId}
			className="m-0 h-full max-h-full w-full max-w-full bg-transparent p-0 backdrop:bg-transparent"
		>
			<AnimatePresence onExitComplete={() => dialogRef.current?.close()}>
				{open && (
					<>
						{/* The scrim is for a pointer: it fills the window, so its focus ring falls
						    outside it and a Tab onto it showed no focus at all. A keyboard leaves by
						    Escape or by "Keep my snippet", which is also why it is hidden from a
						    screen reader, where it would read as a second copy of that button. */}
						<motion.button
							type="button"
							tabIndex={-1}
							aria-hidden="true"
							onClick={onCancel}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
							className="sc-confirm-scrim"
						/>
						<div className="pointer-events-none fixed inset-0 flex items-start justify-center p-4 pt-24">
							<motion.div
								ref={cardRef}
								tabIndex={-1}
								initial={
									reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8, filter: "blur(4px)" }
								}
								animate={
									reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }
								}
								exit={
									reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4, filter: "blur(4px)" }
								}
								transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
								className="sc-confirm-card pointer-events-auto w-full max-w-sm"
							>
								<ConfirmDiscard
									message={message}
									messageId={messageId}
									confirmLabel={confirmLabel}
									onCancel={onCancel}
									onConfirm={onConfirm}
								/>
							</motion.div>
						</div>
					</>
				)}
			</AnimatePresence>
		</dialog>
	);
}
