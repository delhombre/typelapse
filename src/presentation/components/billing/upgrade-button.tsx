// Groundwork: billing UI, intentionally not mounted yet; the hosted build wires it in.
import { springs } from "@/presentation/motion";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { motion } from "motion/react";

/**
 * Plan indicator + upgrade CTA.
 *
 * NOT mounted in the local OSS app: the local build runs on Plan.local()
 * (everything unlocked), so there are no upgrade nags. The hosted (cloud) build
 * mounts this in the export bar, next to the export button, once billing is
 * server-authoritative. Kept here so the cloud build has the component ready to
 * wire.
 */
export function UpgradeButton() {
	const { plan, isUpgrading, upgrade, downgrade } = usePlanStore();

	if (plan.isPro) {
		return (
			<motion.button
				type="button"
				onClick={downgrade}
				whileTap={{ scale: 0.95 }}
				transition={springs.snappy}
				title="Pro: hosted export, no watermark, 4K/60fps. Click to reset (dev)."
				className="flex items-center gap-1 border border-amber-400/60 bg-amber-400/10 px-2 py-1 font-mono text-[10px] text-amber-600 dark:text-amber-400"
			>
				<SparkIcon />
				PRO
			</motion.button>
		);
	}

	return (
		<motion.button
			type="button"
			onClick={upgrade}
			disabled={isUpgrading}
			whileTap={{ scale: 0.97 }}
			transition={springs.snappy}
			title="Upgrade to Pro: hosted export, no watermark, 4K/60fps, longer videos"
			className="group relative flex items-center gap-1 overflow-hidden border border-neutral-300 px-2 py-1 font-mono text-[10px] text-neutral-500 transition-colors hover:border-amber-400 hover:text-amber-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-amber-400 dark:hover:text-amber-400"
		>
			<SparkIcon />
			{isUpgrading ? "..." : "Upgrade"}
			<span className="shine-effect pointer-events-none absolute -top-1/2 -left-full z-20 h-[200%] w-3/4 skew-x-[-20deg] bg-linear-to-r from-transparent via-amber-300/25 to-transparent" />
		</motion.button>
	);
}

function SparkIcon() {
	return (
		<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" role="img">
			<title>Pro</title>
			<path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
		</svg>
	);
}
