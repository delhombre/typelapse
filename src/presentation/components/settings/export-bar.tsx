import {
	ASPECT_LABELS,
	RESOLUTION_TIERS,
	type RenderFormat,
	type ResolutionTier,
	dimensionsFor,
	presetFor,
} from "@/domain/entities/render-config";
import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect } from "react";

const PROGRESS_STYLES = ["reels", "bar", "none"] as const;

/**
 * What the shape and resolution chips fall back to when the stored dimensions
 * match no preset — a plan-clamped export, or a hand-edited link. Neither chip
 * row lights up in that case; these only decide what the *next* click composes
 * against, so a stray size can still be corrected in one tap.
 */
const FALLBACK_PRESET = { aspect: ASPECT_LABELS[0], tier: RESOLUTION_TIERS[0] } as const;

/** Full-width export bar at the bottom of the desktop app. */
export function ExportBar() {
	const hasSteps = useSnippetStore((s) => s.snippet.steps.length >= 2);

	return (
		<div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
			<PngButton />
			{/* Spacer: only pushes controls apart on the single-row desktop layout */}
			<div className="hidden flex-1 lg:block" />
			{hasSteps && (
				<>
					<ExportOptions />
					<ExportTargetControl />
					<ExportButton />
				</>
			)}
			<ExportStatus />
		</div>
	);
}

/**
 * Where the render happens.
 *
 * This device is the default and reads as one: it is faster, nothing is
 * uploaded, and there is no server to be running. The server option stays
 * because some browsers still have no WebCodecs — and because "we render it for
 * you" should be a choice a user makes, not one made quietly for them.
 */
export function ExportTargetControl() {
	const target = useExportStore((s) => s.target);
	const setTarget = useExportStore((s) => s.setTarget);
	const deviceSupported = useExportStore((s) => s.deviceSupported);
	const probeDevice = useExportStore((s) => s.probeDevice);

	useEffect(() => {
		if (deviceSupported === null) {
			void probeDevice();
		}
	}, [deviceSupported, probeDevice]);

	return (
		<Segmented
			id="target"
			label="Render location"
			items={[
				{
					key: "device",
					label: "This device",
					title:
						deviceSupported === false
							? "This browser has no encoder for the selected format and size."
							: "Renders in this tab. Nothing is uploaded, and no server has to be running.",
					disabled: deviceSupported === false,
				},
				{
					key: "server",
					label: "Server",
					title: "Renders with Remotion on the Typelapse API server, which has to be running.",
				},
			]}
			value={target}
			onSelect={(k) => setTarget(k as "device" | "server")}
		/>
	);
}

/**
 * What the export is doing, and what it did.
 *
 * The old bar had no success state at all: a finished render simply stopped
 * spinning, and the only evidence was the browser's download shelf — which on a
 * phone is not on screen. So this outlives the render, says which machine made
 * the file and how big it turned out, and waits to be dismissed. Failures do
 * the same in the assertive register, because a failure nobody reads is a
 * failure that gets retried identically.
 */
/** What a screen reader is told once per phase, instead of once per frame. */
const PHASE_LABELS: Record<"preparing" | "rendering" | "downloading", string> = {
	preparing: "Preparing the export.",
	rendering: "Rendering.",
	downloading: "Writing the file.",
};

export function ExportStatus() {
	const progress = useExportStore((s) => s.progress);
	const outcome = useExportStore((s) => s.outcome);
	const dismissOutcome = useExportStore((s) => s.dismissOutcome);
	const cancelExport = useExportStore((s) => s.cancelExport);

	return (
		<AnimatePresence mode="wait">
			{progress && (
				<motion.output
					key="progress"
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={springs.snappy}
					data-testid="export-status"
					className="flex w-full items-center gap-3 rounded-lg bg-neutral-100/70 px-3 py-2 dark:bg-neutral-900/70"
				>
					{/* The bar and the percentage are for eyes. A live region that
					    re-announced a number every few frames would be unusable, so the
					    screen reader is told the phase once and left alone. */}
					<span className="sr-only">{PHASE_LABELS[progress.phase]}</span>
					<div
						aria-hidden="true"
						className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-neutral-300/60 dark:bg-neutral-700/60"
					>
						<motion.div
							className="h-full rounded-full bg-accent"
							// An indeterminate phase gets a third of a bar rather than a fake
							// number: the server streams nothing back and cannot be quoted.
							animate={{ width: `${(progress.ratio ?? 0.33) * 100}%` }}
							transition={springs.default}
						/>
					</div>
					<span
						aria-hidden="true"
						className="shrink-0 text-xs tabular-nums text-neutral-600 dark:text-neutral-300"
					>
						{progress.message}
					</span>
					<button
						type="button"
						onClick={cancelExport}
						className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
					>
						Cancel
					</button>
				</motion.output>
			)}

			{!progress && outcome && (
				<motion.div
					key={outcome.kind}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={springs.snappy}
					role={outcome.kind === "failed" ? "alert" : "status"}
					aria-live={outcome.kind === "failed" ? "assertive" : "polite"}
					data-testid="export-status"
					className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-xs ${
						outcome.kind === "done"
							? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
							: "bg-red-500/10 text-red-700 dark:text-red-300"
					}`}
				>
					<span aria-hidden="true" className="pt-px font-semibold">
						{outcome.kind === "done" ? "✓" : "!"}
					</span>
					<span className="min-w-0 flex-1">
						{outcome.kind === "done" ? (
							<>
								Saved <span className="font-medium">{outcome.filename}</span> ·{" "}
								{formatBytes(outcome.bytes)} · {(outcome.elapsedMs / 1000).toFixed(1)}s{" "}
								{outcome.target === "device" ? "on this device" : "on the server"}
								{outcome.note ? ` · ${outcome.note}` : ""}
							</>
						) : (
							outcome.message
						)}
					</span>
					<button
						type="button"
						onClick={dismissOutcome}
						aria-label="Dismiss export status"
						className="-my-1 -mr-1 shrink-0 rounded-md px-2 py-1 text-current/70 transition hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
					>
						×
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) {
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** PNG snapshot action: available regardless of step count. */
export function PngButton() {
	const isExporting = useExportStore((s) => s.isExporting);
	const exportPng = useExportStore((s) => s.exportPng);

	return (
		<motion.button
			type="button"
			onClick={exportPng}
			disabled={isExporting}
			whileTap={{ scale: 0.97 }}
			transition={springs.snappy}
			className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200/70 px-3 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
		>
			<CameraIcon />
			PNG
		</motion.button>
	);
}

/** Video export controls: format, aspect ratio, and the reels/typewriter/loop toggles. */
export function ExportOptions() {
	const {
		format,
		width,
		height,
		loop,
		typewriter,
		focusZoom,
		sound,
		progressStyle,
		setFormat,
		setResolution,
		setLoop,
		setTypewriter,
		setFocusZoom,
		setSound,
		setProgressStyle,
	} = useExportStore();

	// Shape and resolution are two views of one stored pixel size: selecting
	// either one recomposes the pair, so they can never contradict each other.
	const selected = presetFor(width, height);
	const current = selected ?? FALLBACK_PRESET;

	return (
		<>
			<Segmented
				id="format"
				items={[
					{ key: "mp4", label: "MP4" },
					{ key: "webm", label: "WebM" },
					{ key: "gif", label: "GIF" },
				]}
				value={format}
				onSelect={(k) => setFormat(k as RenderFormat)}
			/>

			<Segmented
				id="aspect"
				items={ASPECT_LABELS.map((aspect) => {
					const dims = dimensionsFor(aspect, current.tier);
					return { key: aspect, label: aspect, title: `${dims.width}×${dims.height}` };
				})}
				value={selected?.aspect ?? ""}
				onSelect={(k) => {
					const dims = dimensionsFor(k as (typeof ASPECT_LABELS)[number], current.tier);
					setResolution(dims.width, dims.height);
				}}
			/>

			<Segmented
				id="resolution"
				items={RESOLUTION_TIERS.map((tier) => {
					const dims = dimensionsFor(current.aspect, tier);
					return { key: tier, label: tier, title: `${dims.width}×${dims.height}` };
				})}
				value={selected?.tier ?? ""}
				onSelect={(k) => {
					const dims = dimensionsFor(current.aspect, k as ResolutionTier);
					setResolution(dims.width, dims.height);
				}}
			/>

			<Chip
				onClick={() => {
					const i = PROGRESS_STYLES.indexOf(progressStyle);
					const next = PROGRESS_STYLES[(i + 1) % PROGRESS_STYLES.length];
					if (next) {
						setProgressStyle(next);
					}
				}}
				title="Progress indicator style"
			>
				{progressStyle}
			</Chip>

			<Chip
				active={typewriter}
				onClick={() => setTypewriter(!typewriter)}
				title="Typewriter: type the first step out character by character"
			>
				type
			</Chip>

			<Chip
				active={focusZoom}
				onClick={() => setFocusZoom(!focusZoom)}
				title="Zoom: push in on focused lines"
			>
				zoom
			</Chip>

			<Chip
				active={sound}
				onClick={() => setSound(!sound)}
				title="Sound: synthesized key ticks and morph thumps"
			>
				sound
			</Chip>

			<Chip
				active={loop}
				onClick={() => setLoop(!loop)}
				title="Loop: last step morphs back to the first"
			>
				loop
			</Chip>
		</>
	);
}

/** Primary video export button: shows a spinner and live progress while rendering. */
export function ExportButton() {
	const isExporting = useExportStore((s) => s.isExporting);
	const progress = useExportStore((s) => s.progress);
	const target = useExportStore((s) => s.target);
	const exportVideo = useExportStore((s) => s.exportVideo);

	return (
		<motion.button
			type="button"
			onClick={exportVideo}
			disabled={isExporting}
			whileTap={{ scale: 0.97 }}
			transition={springs.snappy}
			className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 text-xs font-semibold text-[var(--color-on-primary)] shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_4px_16px_-4px_var(--color-primary-glow)] transition-colors duration-200 hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
		>
			{isExporting ? (
				<>
					<span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
					<span className="tabular-nums">
						{progress?.ratio == null ? "Exporting…" : `${Math.round(progress.ratio * 100)}%`}
					</span>
				</>
			) : (
				<>
					<VideoIcon />
					{target === "device" ? "Export here" : "Export"}
				</>
			)}
		</motion.button>
	);
}

interface SegmentedItem {
	key: string;
	label: string;
	title?: string;
	disabled?: boolean;
}

function Segmented({
	id,
	items,
	value,
	onSelect,
	label,
}: {
	id: string;
	items: SegmentedItem[];
	value: string;
	onSelect: (key: string) => void;
	label?: string;
}) {
	return (
		<div
			aria-label={label}
			className="flex items-center gap-0.5 rounded-lg border border-neutral-200/70 p-0.5 dark:border-neutral-800"
		>
			{items.map((item) => {
				const isSelected = item.key === value;
				return (
					<motion.button
						key={item.key}
						type="button"
						onClick={() => onSelect(item.key)}
						disabled={item.disabled}
						aria-pressed={isSelected}
						whileTap={{ scale: 0.96 }}
						transition={springs.snappy}
						title={item.title}
						className={`relative rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
							isSelected
								? "text-white dark:text-neutral-900"
								: "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
						}`}
					>
						{isSelected && (
							<motion.span
								layoutId={`segmented-${id}`}
								className="absolute inset-0 rounded-md bg-neutral-900 dark:bg-neutral-100"
								transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
							/>
						)}
						<span className="relative z-10">{item.label}</span>
					</motion.button>
				);
			})}
		</div>
	);
}

function Chip({
	active = false,
	onClick,
	title,
	children,
}: {
	active?: boolean;
	onClick: () => void;
	title: string;
	children: ReactNode;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileTap={{ scale: 0.95 }}
			transition={springs.snappy}
			title={title}
			className={`h-9 rounded-lg border px-3 text-[11px] font-medium capitalize transition-colors ${
				active
					? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
					: "border-neutral-200/70 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
			}`}
		>
			{children}
		</motion.button>
	);
}

function CameraIcon() {
	return (
		<svg
			width="10"
			height="10"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			role="img"
		>
			<title>Screenshot</title>
			<rect x="3" y="3" width="18" height="18" rx="0" />
			<circle cx="8.5" cy="8.5" r="1.5" />
			<path d="M21 15l-5-5L5 21" />
		</svg>
	);
}

function VideoIcon() {
	return (
		<svg
			width="10"
			height="10"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			role="img"
		>
			<title>Export video</title>
			<rect x="2" y="4" width="20" height="16" rx="0" />
			<path d="M10 9l5 3-5 3V9z" />
		</svg>
	);
}
