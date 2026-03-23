import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";

const RESOLUTION_PRESETS = [
	{ label: "720p", width: 1280, height: 720 },
	{ label: "1080p", width: 1920, height: 1080 },
] as const;

/** Full-width export bar at the bottom of the app */
export function ExportBar() {
	const hasSteps = useSnippetStore((s) => s.snippet.steps.length >= 2);
	const {
		isExporting,
		progress,
		error,
		format,
		width,
		height,
		exportVideo,
		exportPng,
		setFormat,
		setResolution,
	} = useExportStore();

	const selectedRes =
		RESOLUTION_PRESETS.find((r) => r.width === width && r.height === height)?.label ?? "Custom";

	return (
		<div className="flex h-full items-center gap-3 px-4">
			{/* Screenshot */}
			<motion.button
				type="button"
				onClick={exportPng}
				disabled={isExporting}
				whileTap={{ scale: 0.97 }}
				transition={springs.snappy}
				className="group relative flex items-center gap-1.5 overflow-hidden border border-neutral-200 px-3 py-1 font-mono text-[10px] text-neutral-500 transition-colors hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-200 dark:hover:text-neutral-200"
			>
				<CameraIcon />
				PNG
				<span className="shine-effect pointer-events-none absolute -top-1/2 -left-full z-20 h-[200%] w-3/4 skew-x-[-20deg] bg-linear-to-r from-transparent via-white/20 to-transparent" />
			</motion.button>

			{/* Spacer */}
			<div className="flex-1" />

			{hasSteps && (
				<>
					{/* Format toggle */}
					<div className="flex items-center border border-neutral-200 dark:border-neutral-800">
						{(["mp4", "webm", "gif"] as const).map((f, i) => {
							const isSelected = format === f;
							return (
								<motion.button
									key={f}
									type="button"
									onClick={() => setFormat(f)}
									whileTap={{ scale: 0.95 }}
									transition={springs.snappy}
									className={`px-2.5 py-0.5 font-mono text-[10px] uppercase transition-colors ${i > 0 ? "border-l border-neutral-200 dark:border-neutral-800" : ""} ${
										isSelected
											? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
											: "text-neutral-400 hover:text-neutral-700 dark:text-neutral-600 dark:hover:text-neutral-300"
									}`}
								>
									{f}
								</motion.button>
							);
						})}
					</div>

					{/* Resolution toggle */}
					<div className="flex items-center border border-neutral-200 dark:border-neutral-800">
						{RESOLUTION_PRESETS.map((r, i) => {
							const isSelected = width === r.width && height === r.height;
							return (
								<motion.button
									key={r.label}
									type="button"
									onClick={() => setResolution(r.width, r.height)}
									whileTap={{ scale: 0.95 }}
									transition={springs.snappy}
									className={`px-2.5 py-0.5 font-mono text-[10px] transition-colors ${i > 0 ? "border-l border-neutral-200 dark:border-neutral-800" : ""} ${
										isSelected
											? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
											: "text-neutral-400 hover:text-neutral-700 dark:text-neutral-600 dark:hover:text-neutral-300"
									}`}
								>
									{r.label}
								</motion.button>
							);
						})}
					</div>

					{/* Export button */}
					<motion.button
						type="button"
						onClick={exportVideo}
						disabled={isExporting}
						whileTap={{ scale: 0.97 }}
						transition={springs.snappy}
						className="group relative flex items-center gap-1.5 overflow-hidden bg-neutral-900 px-4 py-1 font-mono text-[10px] text-white transition-opacity disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
					>
						{isExporting ? (
							<>
								<span className="inline-block size-3 animate-spin border-2 border-current border-t-transparent" />
								{progress?.message ?? "Exporting..."}
							</>
						) : (
							<>
								<VideoIcon />
								Export {selectedRes}
							</>
						)}
						<span className="shine-effect pointer-events-none absolute -top-1/2 -left-full z-20 h-[200%] w-3/4 skew-x-[-20deg] bg-linear-to-r from-transparent via-white/15 to-transparent" />
					</motion.button>
				</>
			)}

			{error && <span className="font-mono text-[10px] text-red-500">{error}</span>}
		</div>
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
