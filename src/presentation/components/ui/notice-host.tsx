import { springs } from "@/presentation/motion";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Where notices appear: a short stack of quiet cards under the top bar. The
 * region is always mounted and polite, so a screen reader hears a notice
 * without being interrupted by it; each card dismisses itself, or on a click.
 */
export function NoticeHost() {
	const notices = useNoticeStore((s) => s.notices);
	const dismiss = useNoticeStore((s) => s.dismiss);
	const reduce = useReducedMotion();

	return (
		<div
			aria-live="polite"
			className="pointer-events-none fixed inset-x-0 top-16 z-[70] flex flex-col items-center gap-2 px-4"
		>
			<AnimatePresence>
				{notices.map((notice) => (
					<motion.div
						key={notice.id}
						layout
						initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
						animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
						exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
						transition={springs.default}
						className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border border-neutral-200 bg-white py-3 pl-4 pr-2 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)] dark:border-neutral-800 dark:bg-neutral-900"
					>
						<span
							aria-hidden="true"
							className={`mt-[5px] size-1.5 shrink-0 rounded-full ${
								notice.tone === "error" ? "bg-red-500" : "bg-neutral-400 dark:bg-neutral-500"
							}`}
						/>
						<div className="min-w-0 flex-1">
							<p className="text-[13px] leading-snug text-neutral-900 dark:text-neutral-50">
								{notice.message}
							</p>
							{notice.detail && (
								<p className="mt-0.5 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
									{notice.detail}
								</p>
							)}
						</div>
						<motion.button
							type="button"
							onClick={() => dismiss(notice.id)}
							aria-label="Dismiss"
							whileTap={{ scale: 0.96 }}
							transition={springs.snappy}
							className="-mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
						>
							<CloseIcon />
						</motion.button>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}

function CloseIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			role="img"
		>
			<title>Dismiss</title>
			<path d="M18 6L6 18M6 6l12 12" />
		</svg>
	);
}
