import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";

const SHEET_EASE = [0.32, 0.72, 0, 1] as const;
const SHEET_ENTER_SECONDS = 0.3;
const SHEET_EXIT_SECONDS = 0.21;

/**
 * A bottom sheet has a spatial origin: the bottom edge it is attached to.
 * Keeping the values together also guarantees that its veil and panel arrive
 * and leave on the same beat instead of reading as two unrelated effects.
 */
export function bottomSheetMotion(reduce: boolean) {
	const enter = { duration: reduce ? 0 : SHEET_ENTER_SECONDS, ease: SHEET_EASE };
	const exit = { duration: reduce ? 0 : SHEET_EXIT_SECONDS, ease: SHEET_EASE };

	return {
		backdrop: {
			initial: reduce ? (false as const) : { opacity: 0 },
			animate: { opacity: 1, transition: enter },
			exit: { opacity: 0, transition: exit },
		},
		panel: {
			initial: reduce ? (false as const) : { y: "100%" },
			animate: { y: 0, transition: enter },
			exit: { y: reduce ? 0 : "100%", transition: exit },
		},
	};
}

export function StudioBottomSheet({
	open,
	onClose,
	labelledBy,
	children,
	className = "",
	onClosed,
}: {
	open: boolean;
	onClose: () => void;
	labelledBy: string;
	children: ReactNode;
	className?: string;
	/**
	 * Called once the exit has played and the dialog is closed: the page behind a modal
	 * dialog is inert until then, so whatever must take focus elsewhere waits for this.
	 */
	onClosed?: () => void;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const panelRef = useRef<HTMLElement>(null);
	const reduce = useReducedMotion() === true;
	const sheetMotion = bottomSheetMotion(reduce);

	useEffect(() => {
		if (!open) {
			return;
		}
		const dialog = dialogRef.current;
		if (!dialog || dialog.open) {
			return;
		}
		try {
			if (typeof dialog.showModal === "function") {
				dialog.showModal();
			} else {
				dialog.setAttribute("open", "");
			}
		} catch {
			dialog.setAttribute("open", "");
		}
		// The panel takes the focus the dialog gave its first control, unless something in
		// the sheet has taken it on purpose already (a field, a chosen tab).
		requestAnimationFrame(() => {
			const panel = panelRef.current;
			if (panel && !panel.contains(document.activeElement)) panel.focus();
		});
	}, [open]);

	const finishClose = () => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}
		if (typeof dialog.close === "function") {
			dialog.close();
		} else {
			dialog.removeAttribute("open");
		}
		onClosed?.();
	};

	return (
		<dialog
			ref={dialogRef}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			// The phone's drawer claims Escape on the document, and a key whose default is
			// prevented raises no cancel, so the sheet answers the key itself. Handled here,
			// the key raises no cancel on a desktop either: the sheet closes once.
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onClose();
				}
			}}
			aria-labelledby={labelledBy}
			className="studio-sheet-dialog"
		>
			<AnimatePresence onExitComplete={finishClose}>
				{open && (
					<>
						<motion.button
							type="button"
							aria-label="Close sheet"
							className="studio-sheet-backdrop"
							onClick={onClose}
							{...sheetMotion.backdrop}
						/>
						<motion.section
							ref={panelRef}
							tabIndex={-1}
							className={`studio-sheet-panel ${className}`}
							{...sheetMotion.panel}
						>
							<span className="studio-sheet-grip" aria-hidden="true" />
							{children}
						</motion.section>
					</>
				)}
			</AnimatePresence>
		</dialog>
	);
}
