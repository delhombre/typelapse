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
 *
 * The stack is mounted beside the shell, not in it, so it asks for the studio's
 * tokens by name (`studio-root sc-tokens`, as the strip an import link raises
 * does) and paints the warm opaque surface every menu does: no blur, no border
 * on a shadow, and a z-index from the scale (`--z-notice`, app.css; D9 of the
 * 2026-10-08 audit).
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
			className="studio-root sc-tokens pointer-events-none fixed right-5 z-(--z-notice) flex w-[min(360px,calc(100vw-24px))] flex-col items-stretch gap-2 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none max-sm:right-3"
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
						className="sc-notice pointer-events-auto"
					>
						<span className="sc-notice-mark" data-tone={notice.tone}>
							<AlertCircle size={16} strokeWidth={1.7} aria-hidden="true" />
						</span>
						<div className="sc-notice-copy">
							<p>{notice.message}</p>
							{notice.detail && <small>{notice.detail}</small>}
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
								className="sc-notice-action"
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
							className="sc-notice-dismiss"
						>
							<X size={14} strokeWidth={1.7} aria-hidden="true" />
						</motion.button>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
