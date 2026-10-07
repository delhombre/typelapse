import { SurfaceTop } from "@/presentation/hooks/use-phone-surface-top";
import { springs } from "@/presentation/motion";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { useTransientSurfaceStore } from "@/presentation/stores/transient-surface.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, X } from "reicon-react";

/**
 * Global notices are reserved for failures without a better local surface
 * (broken imports and refused uploads). They sit beside the utilities that
 * initiated those actions, rather than over the work in the middle of the
 * canvas. Reversible direct manipulation, such as scene deletion, owns its
 * feedback in the timeline instead.
 *
 * From 1280px they start at the desktop header's 76px line. Under it the corner
 * row is the header: they start where every transient surface does, one stage
 * gap under it, and under the import pill or the replace question when one is
 * showing, never over a control or over each other (after-the-gate D6, #207).
 */
const DESKTOP_NOTICE_TOP = 76;
/** Between the import surface and the first notice: the notices' own gap. */
const SURFACE_GAP = 8;

export function NoticeHost() {
	return (
		<SurfaceTop desktop={DESKTOP_NOTICE_TOP}>
			{(top, phone) => <NoticeStack top={top} phone={phone} />}
		</SurfaceTop>
	);
}

function NoticeStack({ top, phone }: { top: number | string; phone: boolean }) {
	const notices = useNoticeStore((s) => s.notices);
	const dismiss = useNoticeStore((s) => s.dismiss);
	const reduce = useReducedMotion();
	const occupied = useTransientSurfaceStore((s) => s.occupied);
	// The room under the import surface is a transform, not a `top`, so the notices glide
	// out of its way on the compositor when it arrives or leaves.
	const below = phone && occupied > 0 ? occupied + SURFACE_GAP : 0;

	return (
		<div
			aria-live="polite"
			data-testid="notice-host"
			style={{ top, transform: `translateY(${below}px)` }}
			className="pointer-events-none fixed right-5 z-[70] flex w-[min(360px,calc(100vw-24px))] flex-col items-stretch gap-2 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none max-sm:right-3"
		>
			<AnimatePresence>
				{notices.map((notice) => (
					<motion.div
						key={notice.id}
						data-testid="notice"
						layout
						initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8, scale: 0.985 }}
						animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
						exit={reduce ? { opacity: 0 } : { opacity: 0, x: 6, scale: 0.99 }}
						transition={springs.default}
						className="pointer-events-auto flex w-full items-start gap-2.5 rounded-[18px] border border-neutral-200/80 bg-white/95 p-2 shadow-[0_1px_2px_rgb(15_23_42/0.08),0_12px_32px_-14px_rgb(15_23_42/0.28)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/95 dark:shadow-[0_1px_2px_rgb(0_0_0/0.35),0_14px_36px_-14px_rgb(0_0_0/0.65)]"
					>
						<span
							className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
								notice.tone === "error"
									? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300"
									: "bg-neutral-100 text-neutral-600 dark:bg-white/8 dark:text-neutral-300"
							}`}
						>
							<AlertCircle size={16} strokeWidth={1.7} aria-hidden="true" />
						</span>
						<div className="min-w-0 flex-1 py-1">
							<p className="text-[13px] leading-[1.35] font-medium tracking-[-0.01em] text-neutral-900 dark:text-neutral-50">
								{notice.message}
							</p>
							{notice.detail && (
								<p className="mt-0.5 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
									{notice.detail}
								</p>
							)}
						</div>
						{notice.action && (
							<motion.button
								type="button"
								onClick={() => {
									notice.action?.onSelect();
									dismiss(notice.id);
								}}
								whileTap={{ scale: 0.96 }}
								transition={springs.snappy}
								className="inline-flex min-h-10 shrink-0 items-center rounded-xl px-3 text-xs font-semibold text-neutral-900 transition-colors duration-150 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:text-neutral-50 dark:hover:bg-neutral-800 dark:focus-visible:outline-white"
							>
								{notice.action.label}
							</motion.button>
						)}
						<motion.button
							type="button"
							onClick={() => dismiss(notice.id)}
							aria-label="Dismiss"
							whileTap={{ scale: 0.96 }}
							transition={springs.snappy}
							className="flex size-10 shrink-0 items-center justify-center rounded-[12px] text-neutral-400 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
						>
							<X size={14} strokeWidth={1.7} aria-hidden="true" />
						</motion.button>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
