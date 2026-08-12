import type { RenderFormat } from "@/domain/entities/render-config";
import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Aspect-ratio presets for social-ready exports (wide, square, reels, portrait, tall). */
const ASPECT_PRESETS = [
	{ label: "16:9", width: 1920, height: 1080 },
	{ label: "1:1", width: 1080, height: 1080 },
	{ label: "9:16", width: 1080, height: 1920 },
	{ label: "4:5", width: 1080, height: 1350 },
	{ label: "3:4", width: 1080, height: 1440 },
] as const;

const PROGRESS_STYLES = ["reels", "bar", "none"] as const;

/** Full-width export bar at the bottom of the desktop app. */
export function ExportBar() {
	const hasSteps = useSnippetStore((s) => s.snippet.steps.length >= 2);
	const error = useExportStore((s) => s.error);

	return (
		<div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
			<PngButton />
			{/* Spacer: only pushes controls apart on the single-row desktop layout */}
			<div className="hidden flex-1 lg:block" />
			{hasSteps && (
				<>
					<ExportOptions />
					<ExportButton />
				</>
			)}
			{error && <span className="text-xs text-red-500">{error}</span>}
		</div>
	);
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

	const selectedAspect =
		ASPECT_PRESETS.find((r) => r.width === width && r.height === height)?.label ?? "";

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
				items={ASPECT_PRESETS.map((r) => ({
					key: r.label,
					label: r.label,
					title: `${r.width}×${r.height}`,
				}))}
				value={selectedAspect}
				onSelect={(k) => {
					const r = ASPECT_PRESETS.find((x) => x.label === k);
					if (r) {
						setResolution(r.width, r.height);
					}
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
					{progress?.message ?? "Exporting…"}
				</>
			) : (
				<>
					<VideoIcon />
					Export
				</>
			)}
		</motion.button>
	);
}

interface SegmentedItem {
	key: string;
	label: string;
	title?: string;
}

function Segmented({
	id,
	items,
	value,
	onSelect,
}: {
	id: string;
	items: SegmentedItem[];
	value: string;
	onSelect: (key: string) => void;
}) {
	return (
		<div className="flex items-center gap-0.5 rounded-lg border border-neutral-200/70 p-0.5 dark:border-neutral-800">
			{items.map((item) => {
				const isSelected = item.key === value;
				return (
					<motion.button
						key={item.key}
						type="button"
						onClick={() => onSelect(item.key)}
						whileTap={{ scale: 0.96 }}
						transition={springs.snappy}
						title={item.title}
						className={`relative rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 ${
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
