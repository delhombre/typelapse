import {
	PLATFORM_LABELS,
	type SocialPlatform,
	platformsForAspect,
} from "@/application/social/safe-zones";
import { AnimatedSizeContainer } from "@/presentation/components/ui/animated-size-container";
import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSocialPreviewStore } from "@/presentation/stores/social-preview.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo } from "react";

/**
 * The social-preview control pill: a master "Social" toggle that, when on,
 * springs open to reveal the platforms valid for the current export aspect and
 * a "Guides" sub-toggle. Lives in the preview's bottom control row (shared by
 * the desktop and mobile shells). Reads the export aspect and the ephemeral
 * social-preview view store; touches neither the snippet nor the export payload.
 */
export function SocialControls() {
	const width = useExportStore((s) => s.width);
	const height = useExportStore((s) => s.height);
	const enabled = useSocialPreviewStore((s) => s.enabled);
	const platform = useSocialPreviewStore((s) => s.platform);
	const showGuides = useSocialPreviewStore((s) => s.showGuides);
	const setEnabled = useSocialPreviewStore((s) => s.setEnabled);
	const setPlatform = useSocialPreviewStore((s) => s.setPlatform);
	const setShowGuides = useSocialPreviewStore((s) => s.setShowGuides);
	const reduce = useReducedMotion();

	const platforms = useMemo(() => platformsForAspect(width, height), [width, height]);
	const hasPlatforms = platforms.length > 0;

	// Keep the stored platform valid for the current aspect, so the picker
	// highlights (and the overlay shows) a platform that uses this aspect. Runs
	// on enable and whenever the aspect changes underneath an open panel.
	useEffect(() => {
		if (!enabled || platforms.length === 0) {
			return;
		}
		const first = platforms[0];
		if (first && !platforms.includes(platform)) {
			setPlatform(first);
		}
	}, [enabled, platforms, platform, setPlatform]);

	return (
		<AnimatedSizeContainer
			width
			transition={reduce ? { duration: 0 } : undefined}
			className="rounded-full border border-black/10 bg-white shadow-[0_10px_30px_-12px_rgb(0_0_0/0.18)] dark:border-white/10 dark:bg-neutral-900"
		>
			<div className="flex items-center gap-1.5 px-2 py-1.5">
				<MasterToggle active={enabled} onClick={() => setEnabled(!enabled)} />
				<AnimatePresence initial={false}>
					{enabled && (
						<motion.div
							className="flex items-center gap-1.5"
							initial={reduce ? false : { opacity: 0, x: -4 }}
							animate={{ opacity: 1, x: 0 }}
							exit={reduce ? { opacity: 0 } : { opacity: 0, x: -4 }}
							transition={reduce ? { duration: 0 } : springs.default}
						>
							<Divider />
							{hasPlatforms ? (
								<>
									<PlatformSegmented
										platforms={platforms}
										value={platform}
										onSelect={setPlatform}
									/>
									<GuidesToggle active={showGuides} onClick={() => setShowGuides(!showGuides)} />
								</>
							) : (
								<span className="px-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
									Set a 9:16, 1:1 or 4:5 ratio
								</span>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</AnimatedSizeContainer>
	);
}

function MasterToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileTap={{ scale: 0.96 }}
			transition={springs.snappy}
			title="Social preview: see your export inside a platform feed"
			className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors ${
				active
					? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
					: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
			}`}
		>
			<FeedIcon />
			Social
		</motion.button>
	);
}

function PlatformSegmented({
	platforms,
	value,
	onSelect,
}: {
	platforms: SocialPlatform[];
	value: SocialPlatform;
	onSelect: (platform: SocialPlatform) => void;
}) {
	return (
		<div className="flex items-center gap-0.5 rounded-full border border-neutral-200/70 p-0.5 dark:border-neutral-800">
			{platforms.map((p) => {
				const isSelected = p === value;
				return (
					<motion.button
						key={p}
						type="button"
						onClick={() => onSelect(p)}
						whileTap={{ scale: 0.96 }}
						transition={springs.snappy}
						className={`relative rounded-full px-2 py-1 text-[11px] font-medium transition-colors duration-150 ${
							isSelected
								? "text-white dark:text-neutral-900"
								: "text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
						}`}
					>
						{isSelected && (
							<motion.span
								layoutId="social-platform"
								className="absolute inset-0 rounded-full bg-neutral-900 dark:bg-neutral-100"
								transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
							/>
						)}
						<span className="relative z-10">{PLATFORM_LABELS[p]}</span>
					</motion.button>
				);
			})}
		</div>
	);
}

function GuidesToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileTap={{ scale: 0.95 }}
			transition={springs.snappy}
			title="Safe-zone guides: dim the regions the platform UI covers"
			className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
				active
					? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
					: "border-neutral-200/70 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
			}`}
		>
			<GuidesIcon />
			Guides
		</motion.button>
	);
}

function Divider() {
	return <div className="h-4 w-px shrink-0 bg-black/10 dark:bg-white/10" />;
}

function FeedIcon() {
	return (
		<svg
			width="11"
			height="11"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			role="img"
		>
			<title>Social feed</title>
			<rect x="6" y="2.5" width="12" height="19" rx="2.5" />
			<line x1="10" y1="18.5" x2="14" y2="18.5" strokeLinecap="round" />
		</svg>
	);
}

function GuidesIcon() {
	return (
		<svg
			width="11"
			height="11"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeDasharray="3 3"
			role="img"
		>
			<title>Safe zones</title>
			<rect x="3" y="3" width="18" height="18" rx="3" />
		</svg>
	);
}
