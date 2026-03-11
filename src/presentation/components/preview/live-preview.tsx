import { Theme } from "@/domain/entities/theme";
import { PlaybackControls } from "@/presentation/components/controls/playback-controls";
import { BackgroundPicker } from "@/presentation/components/preview/background-picker";
import { AnimatedSizeContainer } from "@/presentation/components/shared/animated-size-container";
import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import {
	getRawShikiHighlighter,
	useSnippetStore,
} from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";
import { ShikiMagicMove } from "shiki-magic-move/react";
import "shiki-magic-move/dist/style.css";
import { CodeFrame } from "./code-frame";

const SHIKI_THEME_MAP: Record<string, string> = {
	midnight: "github-dark",
	aurora: "aurora-x",
	frost: "github-light",
};

export function LivePreview() {
	const {
		snippet,
		highlightedHtml,
		isHighlighting,
		stepFrames,
		currentStepIndex,
		isPlaying,
		background,
		setBackground,
		framePadding,
		setFramePadding,
	} = useSnippetStore();

	const hasSteps = snippet.steps.length > 0 && stepFrames.length > 0;
	const shikiHighlighter = getRawShikiHighlighter();

	const displayHtml = hasSteps ? (stepFrames[currentStepIndex] ?? "") : highlightedHtml;

	if (!displayHtml && !isHighlighting) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-400">
				<svg
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1"
					role="img"
				>
					<title>Code icon</title>
					<polyline points="16 18 22 12 16 6" />
					<polyline points="8 6 2 12 8 18" />
				</svg>
				<span className="font-mono text-xs">Write code to see the preview</span>
			</div>
		);
	}

	const isTransparent = background === "transparent";

	return (
		<div className="flex h-full flex-col">
			{/* Canvas area — takes available space, scrollable if needed */}
			<div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
				<motion.div
					className={`w-full max-w-xl ${isTransparent ? "" : "rounded-2xl"} ${isPlaying && !isTransparent ? "bg-animate-playing" : ""}`}
					animate={{ background: isTransparent ? "transparent" : background }}
					transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
					style={{
						opacity: isHighlighting ? 0.7 : 1,
						padding: isTransparent ? 0 : 32,
					}}
				>
					<AnimatedSizeContainer height className="w-full">
						{hasSteps && shikiHighlighter ? (
							<MagicMoveCodeFrame
								highlighter={shikiHighlighter}
								code={snippet.steps[currentStepIndex]?.code ?? ""}
								lang={snippet.language}
								theme={snippet.theme}
								title={snippet.title}
								padding={framePadding}
							/>
						) : (
							<CodeFrame
								html={displayHtml}
								theme={snippet.theme}
								title={snippet.title}
								paddingOverride={framePadding}
							/>
						)}
					</AnimatedSizeContainer>
				</motion.div>
			</div>

			{/* Controls — fixed at bottom, never overflow */}
			<div className="shrink-0 border-t border-neutral-200/60 px-6 py-4 dark:border-neutral-700/30">
				<div className="mx-auto flex max-w-xl flex-col gap-4">
					{/* Playback */}
					<div className="flex justify-center">
						<PlaybackControls />
					</div>

					{/* Config panel */}
					<div className="flex flex-col gap-3 rounded-lg border border-neutral-200/60 bg-white/50 p-3 dark:border-neutral-700/30 dark:bg-neutral-900/50">
						<ConfigRow label="Theme">
							<div className="flex items-center justify-between gap-3">
								<ThemePicker />
								<SyncToggle />
							</div>
						</ConfigRow>

						<ConfigRow label="Background">
							<BackgroundPicker selected={background} onSelect={setBackground} />
						</ConfigRow>

						<ConfigRow label="Padding">
							<PaddingPicker selected={framePadding} onSelect={setFramePadding} />
						</ConfigRow>
					</div>

					{/* Export */}
					{hasSteps && snippet.steps.length >= 2 && <ExportButton />}
				</div>
			</div>
		</div>
	);
}

/** CodeFrame with shiki-magic-move for smooth token morphing transitions */
function MagicMoveCodeFrame({
	highlighter,
	code,
	lang,
	theme,
	title,
	padding,
}: {
	highlighter: Parameters<typeof ShikiMagicMove>[0]["highlighter"];
	code: string;
	lang: string;
	theme: Theme;
	title: string;
	padding: number;
}) {
	const shikiTheme = SHIKI_THEME_MAP[theme.name] ?? "github-dark";

	return (
		<div
			className="code-frame-glow overflow-hidden rounded-xl"
			style={{ background: theme.background }}
		>
			{/* macOS window chrome */}
			<div
				className="flex items-center gap-2 px-4 py-3"
				style={{ borderBottom: `1px solid ${theme.foreground}08` }}
			>
				<div className="size-[11px] rounded-full bg-[#ff5f57]" />
				<div className="size-[11px] rounded-full bg-[#febc2e]" />
				<div className="size-[11px] rounded-full bg-[#28c840]" />
				{title && (
					<span
						className="ml-2 font-mono text-[11px] tracking-tight"
						style={{ color: `${theme.foreground}35` }}
					>
						{title}
					</span>
				)}
			</div>

			{/* Code with magic-move transitions */}
			<div
				style={{
					padding: `0 ${padding}px ${padding}px ${padding}px`,
					fontFamily: theme.fontFamily,
					fontSize: theme.fontSize,
				}}
			>
				<ShikiMagicMove
					highlighter={highlighter}
					lang={lang}
					theme={shikiTheme}
					code={code}
					options={{
						duration: 500,
						stagger: 0.3,
						lineNumbers: true,
						animateContainer: true,
					}}
					className="!bg-transparent"
				/>
			</div>
		</div>
	);
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-600">
				{label}
			</span>
			{children}
		</div>
	);
}

const THEMES = [
	{ name: "midnight", label: "Midnight", factory: () => Theme.midnight(), bg: "#0d1117" },
	{ name: "aurora", label: "Aurora", factory: () => Theme.aurora(), bg: "#1a1b2e" },
	{ name: "frost", label: "Frost", factory: () => Theme.frost(), bg: "#f0f4f8" },
] as const;

function SyncToggle() {
	const { syncEditorTheme, setSyncEditorTheme } = useSnippetStore();

	return (
		<motion.button
			type="button"
			onClick={() => setSyncEditorTheme(!syncEditorTheme)}
			whileTap={{ scale: 0.95 }}
			transition={springs.snappy}
			className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors ${
				syncEditorTheme
					? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
					: "border-neutral-200/60 text-neutral-400 hover:border-neutral-400 dark:border-neutral-700/30 dark:hover:border-neutral-500"
			}`}
			title={syncEditorTheme ? "Editor mirrors preview theme" : "Editor uses app theme"}
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				role="img"
			>
				<title>{syncEditorTheme ? "Synced" : "Not synced"}</title>
				{syncEditorTheme ? (
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
				) : (
					<>
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
						<line x1="2" y1="2" x2="22" y2="22" />
					</>
				)}
			</svg>
			<span className="font-mono text-[9px] uppercase tracking-wider">Sync</span>
		</motion.button>
	);
}

const PADDING_PRESETS = [16, 24, 32, 48, 64] as const;

function PaddingPicker({
	selected,
	onSelect,
}: { selected: number; onSelect: (v: number) => void }) {
	return (
		<div className="flex items-center gap-2">
			{PADDING_PRESETS.map((value) => {
				const isSelected = selected === value;
				return (
					<motion.button
						key={value}
						type="button"
						onClick={() => onSelect(value)}
						whileTap={{ scale: 0.95 }}
						transition={springs.snappy}
						className={`rounded-md border px-3 py-1.5 transition-colors ${
							isSelected
								? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
								: "border-neutral-200/60 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700/30 dark:hover:border-neutral-500"
						}`}
						title={`${value}px padding`}
					>
						<span className="font-mono text-[10px]">{value}</span>
					</motion.button>
				);
			})}
		</div>
	);
}

const RESOLUTION_PRESETS = [
	{ label: "720p", width: 1280, height: 720 },
	{ label: "1080p", width: 1920, height: 1080 },
] as const;

function ExportButton() {
	const {
		isExporting,
		progress,
		error,
		format,
		width,
		height,
		exportVideo,
		setFormat,
		setResolution,
	} = useExportStore();

	const handleExport = () => {
		exportVideo();
	};

	const selectedResLabel =
		RESOLUTION_PRESETS.find((r) => r.width === width && r.height === height)?.label ?? "Custom";

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-neutral-200/60 bg-white/50 p-3 dark:border-neutral-700/30 dark:bg-neutral-900/50">
			<ConfigRow label="Export">
				<div className="flex items-center gap-2">
					{/* Format picker */}
					{(["mp4", "webm", "gif"] as const).map((f) => {
						const isSelected = format === f;
						return (
							<motion.button
								key={f}
								type="button"
								onClick={() => setFormat(f)}
								whileTap={{ scale: 0.95 }}
								transition={springs.snappy}
								className={`rounded-md border px-3 py-1.5 transition-colors ${
									isSelected
										? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
										: "border-neutral-200/60 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700/30 dark:hover:border-neutral-500"
								}`}
							>
								<span className="font-mono text-[10px] uppercase">{f}</span>
							</motion.button>
						);
					})}

					{/* Resolution picker */}
					{RESOLUTION_PRESETS.map((r) => {
						const isSelected = width === r.width && height === r.height;
						return (
							<motion.button
								key={r.label}
								type="button"
								onClick={() => setResolution(r.width, r.height)}
								whileTap={{ scale: 0.95 }}
								transition={springs.snappy}
								className={`rounded-md border px-3 py-1.5 transition-colors ${
									isSelected
										? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
										: "border-neutral-200/60 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700/30 dark:hover:border-neutral-500"
								}`}
							>
								<span className="font-mono text-[10px]">{r.label}</span>
							</motion.button>
						);
					})}

					{/* Export button */}
					<motion.button
						type="button"
						onClick={handleExport}
						disabled={isExporting}
						whileTap={{ scale: 0.95 }}
						transition={springs.snappy}
						className="ml-auto flex items-center gap-2 rounded-md border border-neutral-900 bg-neutral-900 px-4 py-1.5 text-white transition-colors disabled:opacity-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
					>
						{isExporting ? (
							<>
								<span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
								<span className="font-mono text-[10px]">{progress?.message ?? "Exporting..."}</span>
							</>
						) : (
							<>
								<ExportVideoIcon />
								<span className="font-mono text-[10px]">Export {selectedResLabel}</span>
							</>
						)}
					</motion.button>
				</div>
			</ConfigRow>

			{error && <span className="font-mono text-[10px] text-red-500">{error}</span>}
		</div>
	);
}

function ExportVideoIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			role="img"
		>
			<title>Export video</title>
			<rect x="2" y="4" width="20" height="16" rx="2" />
			<path d="M10 9l5 3-5 3V9z" />
		</svg>
	);
}

function ThemePicker() {
	const { snippet, setTheme } = useSnippetStore();

	return (
		<div className="flex items-center gap-2">
			{THEMES.map((t) => {
				const isSelected = snippet.theme.name === t.name;
				return (
					<motion.button
						key={t.name}
						type="button"
						onClick={() => setTheme(t.factory())}
						whileTap={{ scale: 0.97 }}
						transition={springs.snappy}
						className={`flex items-center gap-2 rounded-md border px-3 py-1.5 transition-colors ${
							isSelected
								? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
								: "border-neutral-200/60 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700/30 dark:hover:border-neutral-500"
						}`}
						title={t.label}
					>
						<div className="size-3 rounded-full" style={{ background: t.bg }} />
						<span className="font-mono text-[10px]">{t.label}</span>
					</motion.button>
				);
			})}
		</div>
	);
}
