import { TEMPLATE_CATALOG, type TemplateDefinition } from "@/application/templates/catalog";
import { STAGGER_DELAY, mountVariants, springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The template gallery: six curated projects, one click from the studio.
 *
 * No account, no server, no trial. A card loads through the same path a saved
 * file takes, so what a visitor gets is exactly what an export would produce.
 *
 * Clicking a card while the studio holds the user's own work asks first, in
 * place: a browser `confirm()` would break the surface the whole app is built
 * to feel like.
 */
export function TemplateGallery() {
	const [open, setOpen] = useState(false);
	/** The template waiting on a confirm, because loading it would discard edits. */
	const [pending, setPending] = useState<TemplateDefinition | null>(null);
	const importFromJson = useSnippetStore((s) => s.importFromJson);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const reduce = useReducedMotion();

	const close = useCallback(() => {
		setOpen(false);
		setPending(null);
		// Hand focus back where it came from, so a keyboard user is not dropped
		// at the top of the document.
		triggerRef.current?.focus();
	}, []);

	const load = useCallback(
		(template: TemplateDefinition) => {
			importFromJson(JSON.stringify(template.project));
			close();
		},
		[importFromJson, close],
	);

	/** Load now, or ask first when there is work to lose. */
	const choose = useCallback(
		(template: TemplateDefinition) => {
			if (useSnippetStore.getState().hasUnsavedEdits()) {
				setPending(template);
				return;
			}
			load(template);
		},
		[load],
	);

	// showModal, not an `open` attribute: it puts the gallery in the top layer,
	// traps Tab inside it and makes the studio behind genuinely inert, none of
	// which a div with role="dialog" can do honestly.
	useEffect(() => {
		if (!open) {
			return;
		}
		dialogRef.current?.showModal();
		// showModal focuses the first focusable child, which is the backdrop.
		// Put the caret on the panel instead, so Tab starts at the first card.
		panelRef.current?.focus();
	}, [open]);

	/** Native Escape: back out one level at a time, the confirm before the gallery. */
	const handleCancel = useCallback(
		(e: React.SyntheticEvent) => {
			// Always ours to handle: letting the browser close the dialog outright
			// would skip both the exit animation and the pending confirm.
			e.preventDefault();
			if (pending) {
				setPending(null);
				return;
			}
			close();
		},
		[pending, close],
	);

	return (
		<>
			<motion.button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen(true)}
				whileTap={{ scale: 0.96 }}
				transition={springs.snappy}
				aria-haspopup="dialog"
				aria-expanded={open}
				className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors ${
					open
						? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
						: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
				}`}
			>
				<GridIcon />
				<span className="hidden sm:inline">Templates</span>
			</motion.button>

			{/* Sized to the viewport with a transparent native backdrop: the animated
			    one below is ours, so it can fade with the panel. */}
			<dialog
				ref={dialogRef}
				onCancel={handleCancel}
				aria-labelledby="template-gallery-title"
				className="m-0 h-full max-h-full w-full max-w-full bg-transparent p-0 backdrop:bg-transparent"
			>
				<AnimatePresence onExitComplete={() => dialogRef.current?.close()}>
					{open && (
						<>
							<motion.button
								type="button"
								aria-label="Close templates"
								onClick={close}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
								className="fixed inset-0 z-50 cursor-default bg-neutral-950/40 backdrop-blur-[2px]"
							/>
							<div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
								<motion.div
									ref={panelRef}
									tabIndex={-1}
									data-template-gallery
									// Materialize, don't just fade: blur + scale settle together so the
									// surface reads as a real material arriving (Apple, §12).
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
									className="pointer-events-auto my-auto w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35)] outline-none sm:p-6 dark:border-neutral-800 dark:bg-neutral-900"
								>
									<div className="flex items-start justify-between gap-4">
										<div>
											<h2
												id="template-gallery-title"
												className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
											>
												Templates
											</h2>
											<p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
												Pick one and it opens in the studio. No account, nothing to install.
											</p>
										</div>
										<button
											type="button"
											onClick={close}
											aria-label="Close"
											className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
										>
											<CloseIcon />
										</button>
									</div>

									<AnimatePresence mode="wait" initial={false}>
										{pending ? (
											<ConfirmReplace
												key="confirm"
												template={pending}
												reduce={reduce === true}
												onCancel={() => setPending(null)}
												onConfirm={() => load(pending)}
											/>
										) : (
											<motion.div
												key="grid"
												initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
												animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
												exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
												transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
											>
												<motion.div
													variants={{
														visible: {
															transition: { staggerChildren: reduce ? 0 : STAGGER_DELAY },
														},
													}}
													initial="hidden"
													animate="visible"
													className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
												>
													{TEMPLATE_CATALOG.map((template) => (
														<TemplateCard
															key={template.id}
															template={template}
															reduce={reduce === true}
															onSelect={() => choose(template)}
														/>
													))}
												</motion.div>
											</motion.div>
										)}
									</AnimatePresence>
								</motion.div>
							</div>
						</>
					)}
				</AnimatePresence>
			</dialog>
		</>
	);
}

function TemplateCard({
	template,
	reduce,
	onSelect,
}: {
	template: TemplateDefinition;
	reduce: boolean;
	onSelect: () => void;
}) {
	return (
		<motion.button
			type="button"
			onClick={onSelect}
			data-template-id={template.id}
			variants={reduce ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : mountVariants}
			transition={springs.default}
			whileHover={reduce ? undefined : { y: -2 }}
			whileTap={{ scale: 0.98 }}
			className="flex h-full flex-col gap-2 rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/40 dark:hover:border-neutral-700 dark:hover:bg-neutral-950/70"
		>
			<div className="flex items-start justify-between gap-2">
				<span className="text-[13px] font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
					{template.name}
				</span>
				<span className="mt-px shrink-0 font-mono text-[9.5px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
					{template.language}
				</span>
			</div>
			<p className="text-[11.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
				{template.description}
			</p>
			<div className="mt-auto flex flex-wrap gap-1 pt-1">
				{template.tags.map((tag) => (
					<span
						key={tag}
						className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[9.5px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
					>
						{tag}
					</span>
				))}
			</div>
		</motion.button>
	);
}

/** Asked only when there is something to lose, and it names what it would replace. */
function ConfirmReplace({
	template,
	reduce,
	onCancel,
	onConfirm,
}: {
	template: TemplateDefinition;
	reduce: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<motion.div
			data-template-confirm
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
			animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
			exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
			transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
			className="mt-5 rounded-xl border border-neutral-200/80 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
		>
			<p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-50">
				Replace what you have with “{template.name}”?
			</p>
			<p className="mt-1 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
				Your snippet has changes that are not saved anywhere. Loading this template discards them.
				Export or copy a share link first if you want to keep them.
			</p>
			<div className="mt-4 flex items-center justify-end gap-2">
				<motion.button
					type="button"
					onClick={onCancel}
					whileTap={{ scale: 0.97 }}
					transition={springs.snappy}
					className="h-8 rounded-lg px-3 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800"
				>
					Keep my snippet
				</motion.button>
				<motion.button
					type="button"
					onClick={onConfirm}
					data-template-confirm-load
					whileTap={{ scale: 0.97 }}
					transition={springs.snappy}
					className="h-8 rounded-lg bg-neutral-900 px-3 text-[12px] font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
				>
					Load template
				</motion.button>
			</div>
		</motion.div>
	);
}

function GridIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Templates</title>
			<rect x="3" y="3" width="7" height="7" rx="1.5" />
			<rect x="14" y="3" width="7" height="7" rx="1.5" />
			<rect x="14" y="14" width="7" height="7" rx="1.5" />
			<rect x="3" y="14" width="7" height="7" rx="1.5" />
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			role="img"
		>
			<title>Close</title>
			<path d="M18 6L6 18M6 6l12 12" />
		</svg>
	);
}
