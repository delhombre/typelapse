import { springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { TEMPLATES, type Template } from "@/presentation/templates";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

/** Crafted popover that loads a curated starter template. */
export function TemplatesMenu() {
	const [open, setOpen] = useState(false);
	const importFromJson = useSnippetStore((s) => s.importFromJson);

	useEffect(() => {
		if (!open) {
			return;
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setOpen(false);
			}
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open]);

	function load(template: Template) {
		importFromJson(JSON.stringify(template));
		setOpen(false);
	}

	return (
		<div className="relative">
			<motion.button
				type="button"
				onClick={() => setOpen((v) => !v)}
				whileTap={{ scale: 0.96 }}
				transition={springs.snappy}
				className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors ${
					open
						? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
						: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
				}`}
			>
				<GridIcon />
				Templates
			</motion.button>

			<AnimatePresence>
				{open && (
					<>
						{/* Backdrop — a click anywhere outside closes the menu. */}
						<button
							type="button"
							aria-label="Close templates"
							className="fixed inset-0 z-40 cursor-default"
							onClick={() => setOpen(false)}
						/>
						<motion.div
							// Materialize, don't just fade: blur + scale settle together so the
							// surface reads as a real material arriving (Apple, §12).
							initial={{ opacity: 0, scale: 0.96, y: -4, filter: "blur(4px)" }}
							animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
							exit={{ opacity: 0, scale: 0.97, y: -4, filter: "blur(4px)" }}
							transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
							style={{ transformOrigin: "top left" }}
							className="absolute left-0 top-full z-50 mt-2 w-60 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)] dark:border-neutral-800 dark:bg-neutral-900"
						>
							{TEMPLATES.map((template) => (
								<button
									key={template.id}
									type="button"
									onClick={() => load(template)}
									className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
								>
									<span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">
										{template.name}
									</span>
									<span className="font-mono text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
										{template.language}
									</span>
								</button>
							))}
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</div>
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
