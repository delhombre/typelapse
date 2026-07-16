import { Theme } from "@/domain/entities/theme";
import { BackgroundPicker } from "@/presentation/components/preview/background-picker";
import type { WindowChrome } from "@/presentation/components/preview/frame-chrome";
import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";

/** Compact horizontal settings strip — sits below the preview */
export function SettingsStrip() {
	const {
		snippet,
		background,
		setBackground,
		framePadding,
		setFramePadding,
		watermark,
		setWatermark,
		setBorderRadius,
	} = useSnippetStore();

	return (
		<div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-5 py-3">
			{/* Theme */}
			<StripCell label="Theme">
				<div className="flex items-center gap-2">
					<ThemePicker />
					<SyncToggle />
				</div>
			</StripCell>

			{/* Background */}
			<StripCell label="BG">
				<BackgroundPicker selected={background} onSelect={setBackground} />
			</StripCell>

			{/* Window chrome */}
			<StripCell label="Chrome">
				<ChromePicker />
			</StripCell>

			{/* Line numbers */}
			<StripCell label="Lines">
				<LineNumberPicker />
			</StripCell>

			{/* Padding */}
			<StripCell label="Pad">
				<PaddingPicker selected={framePadding} onSelect={setFramePadding} />
			</StripCell>

			{/* Morph tempo */}
			<StripCell label="Tempo">
				<TempoPicker />
			</StripCell>

			{/* Border Radius */}
			<StripCell label="Radius">
				<RadiusPicker selected={snippet.theme.borderRadius} onSelect={setBorderRadius} />
			</StripCell>

			{/* Font */}
			<StripCell label="Font">
				<FontPicker />
			</StripCell>

			{/* Watermark */}
			<StripCell label="Mark">
				<input
					type="text"
					value={watermark}
					onChange={(e) => setWatermark(e.target.value)}
					placeholder="@username"
					className="h-8 w-28 rounded-lg border border-neutral-200/70 bg-white px-2.5 text-[11px] text-neutral-600 outline-none transition placeholder:text-neutral-300 focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-600 dark:focus:border-neutral-700"
				/>
			</StripCell>
		</div>
	);
}

function StripCell({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-2.5 px-3">
			<span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
				{label}
			</span>
			{children}
		</div>
	);
}

/* ──────────── Sub-components ──────────── */

const THEMES = [
	{ name: "midnight", label: "Midnight", factory: () => Theme.midnight(), bg: "#0d1117" },
	{ name: "aurora", label: "Aurora", factory: () => Theme.aurora(), bg: "#1a1b2e" },
	{ name: "frost", label: "Frost", factory: () => Theme.frost(), bg: "#f0f4f8" },
	{ name: "dracula", label: "Dracula", factory: () => Theme.dracula(), bg: "#282a36" },
	{ name: "one-dark", label: "One Dark", factory: () => Theme.oneDark(), bg: "#282c34" },
	{ name: "catppuccin", label: "Catppuccin", factory: () => Theme.catppuccin(), bg: "#1e1e2e" },
	{ name: "nord", label: "Nord", factory: () => Theme.nord(), bg: "#2e3440" },
] as const;

function ThemePicker() {
	const { snippet, setTheme } = useSnippetStore();

	return (
		<div className="flex items-center gap-1">
			{THEMES.map((t) => {
				const isSelected = snippet.theme.name === t.name;
				return (
					<motion.button
						key={t.name}
						type="button"
						onClick={() => setTheme(t.factory())}
						whileTap={{ scale: 0.96 }}
						whileHover={{ scale: 1.15 }}
						transition={springs.snappy}
						className="relative flex items-center justify-center"
						title={t.label}
					>
						{isSelected && (
							<motion.div
								layoutId="theme-ring"
								className="absolute size-5 rounded-lg ring-2 ring-neutral-900 dark:ring-neutral-100"
								transition={springs.snappy}
							/>
						)}
						<div
							className="size-4 rounded-md border border-black/10 dark:border-white/10"
							style={{ background: t.bg }}
						/>
					</motion.button>
				);
			})}
		</div>
	);
}

function SyncToggle() {
	const { syncEditorTheme, setSyncEditorTheme } = useSnippetStore();

	return (
		<motion.button
			type="button"
			onClick={() => setSyncEditorTheme(!syncEditorTheme)}
			whileTap={{ scale: 0.96 }}
			transition={springs.snappy}
			className={`flex size-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${
				syncEditorTheme
					? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-900"
					: "border-neutral-200 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 dark:border-neutral-800 dark:text-neutral-600 dark:hover:text-neutral-400"
			}`}
			title={syncEditorTheme ? "Editor mirrors preview theme" : "Editor uses app theme"}
		>
			<svg
				width="8"
				height="8"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
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
		</motion.button>
	);
}

const RADIUS_PRESETS = [0, 4, 8, 12, 16, 24] as const;

function RadiusPicker({ selected, onSelect }: { selected: number; onSelect: (v: number) => void }) {
	return (
		<div className="flex items-center gap-1">
			{RADIUS_PRESETS.map((value) => {
				const isSelected = selected === value;
				return (
					<motion.button
						key={value}
						type="button"
						onClick={() => onSelect(value)}
						whileTap={{ scale: 0.96 }}
						transition={springs.snappy}
						className={`relative flex size-5 items-center justify-center transition-colors ${
							isSelected
								? "text-neutral-900 dark:text-neutral-100"
								: "text-neutral-300 hover:text-neutral-600 dark:text-neutral-700 dark:hover:text-neutral-400"
						}`}
						title={`${value}px`}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							aria-hidden="true"
						>
							<rect x="1" y="1" width="14" height="14" rx={value * (14 / 24)} />
						</svg>
						{isSelected && (
							<motion.div
								layoutId="radius-indicator"
								className="absolute -bottom-0.5 h-px w-3 bg-neutral-900 dark:bg-neutral-100"
								transition={springs.snappy}
							/>
						)}
					</motion.button>
				);
			})}
		</div>
	);
}

const PADDING_PRESETS = [16, 24, 32, 48, 64] as const;

function PaddingPicker({
	selected,
	onSelect,
}: { selected: number; onSelect: (v: number) => void }) {
	return (
		<div className="flex items-center gap-0.5 rounded-lg border border-neutral-200/70 p-0.5 dark:border-neutral-800">
			{PADDING_PRESETS.map((value) => {
				const isSelected = selected === value;
				return (
					<motion.button
						key={value}
						type="button"
						onClick={() => onSelect(value)}
						whileTap={{ scale: 0.96 }}
						transition={springs.snappy}
						className={`rounded-md px-2 py-1 text-[10px] font-medium tabular-nums transition-colors ${
							isSelected
								? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
								: "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
						}`}
					>
						{value}
					</motion.button>
				);
			})}
		</div>
	);
}

const CHROME_PRESETS: { value: WindowChrome; label: string; title: string }[] = [
	{ value: "macos", label: "macOS", title: "macOS traffic lights" },
	{ value: "browser", label: "Web", title: "Browser address bar" },
	{ value: "terminal", label: "Term", title: "Terminal prompt" },
	{ value: "none", label: "None", title: "No window chrome" },
];

/** Window chrome variant drawn atop the code frame (preview + export). */
function ChromePicker() {
	const windowChrome = useSnippetStore((s) => s.windowChrome);
	const setWindowChrome = useSnippetStore((s) => s.setWindowChrome);

	return (
		<div className="flex items-center gap-0.5 rounded-lg border border-neutral-200/70 p-0.5 dark:border-neutral-800">
			{CHROME_PRESETS.map((chrome) => {
				const isSelected = windowChrome === chrome.value;
				return (
					<motion.button
						key={chrome.value}
						type="button"
						onClick={() => setWindowChrome(chrome.value)}
						whileTap={{ scale: 0.96 }}
						transition={springs.snappy}
						title={chrome.title}
						className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
							isSelected
								? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
								: "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
						}`}
					>
						{chrome.label}
					</motion.button>
				);
			})}
		</div>
	);
}

/** Line-number gutter toggle + starting number (preview + export). */
function LineNumberPicker() {
	const showLineNumbers = useSnippetStore((s) => s.showLineNumbers);
	const setShowLineNumbers = useSnippetStore((s) => s.setShowLineNumbers);
	const lineNumberStart = useSnippetStore((s) => s.lineNumberStart);
	const setLineNumberStart = useSnippetStore((s) => s.setLineNumberStart);

	return (
		<div className="flex items-center gap-2">
			<motion.button
				type="button"
				onClick={() => setShowLineNumbers(!showLineNumbers)}
				whileTap={{ scale: 0.96 }}
				transition={springs.snappy}
				className={`flex size-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${
					showLineNumbers
						? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-900"
						: "border-neutral-200 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 dark:border-neutral-800 dark:text-neutral-600 dark:hover:text-neutral-400"
				}`}
				title={showLineNumbers ? "Line numbers on" : "Line numbers off"}
			>
				<HashIcon />
			</motion.button>
			{showLineNumbers && (
				<input
					type="number"
					min={1}
					value={lineNumberStart}
					onChange={(e) => {
						const next = Number.parseInt(e.target.value, 10);
						if (Number.isFinite(next)) {
							setLineNumberStart(next);
						}
					}}
					title="First line number"
					className="h-8 w-14 rounded-lg border border-neutral-200/70 bg-white px-2 text-[11px] text-neutral-600 tabular-nums outline-none transition focus:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-neutral-700"
				/>
			)}
		</div>
	);
}

function HashIcon() {
	return (
		<svg
			width="9"
			height="9"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			role="img"
		>
			<title>Line numbers</title>
			<line x1="4" y1="9" x2="20" y2="9" />
			<line x1="4" y1="15" x2="20" y2="15" />
			<line x1="10" y1="3" x2="8" y2="21" />
			<line x1="16" y1="3" x2="14" y2="21" />
		</svg>
	);
}

const TEMPO_PRESETS = [
	{ ms: 400, label: "Snappy", title: "Snappy: 400 ms morph" },
	{ ms: 650, label: "Smooth", title: "Smooth: 650 ms morph" },
	{ ms: 1000, label: "Cine", title: "Cinematic: 1000 ms morph" },
] as const;

/** Morph tempo — how long each step-to-step transition takes (preview + export). */
function TempoPicker() {
	const transitionMs = useExportStore((s) => s.transitionMs);
	const setTransitionMs = useExportStore((s) => s.setTransitionMs);

	return (
		<div className="flex items-center gap-0.5 rounded-lg border border-neutral-200/70 p-0.5 dark:border-neutral-800">
			{TEMPO_PRESETS.map((tempo) => {
				const isSelected = transitionMs === tempo.ms;
				return (
					<motion.button
						key={tempo.ms}
						type="button"
						onClick={() => setTransitionMs(tempo.ms)}
						whileTap={{ scale: 0.96 }}
						transition={springs.snappy}
						title={tempo.title}
						className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
							isSelected
								? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
								: "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
						}`}
					>
						{tempo.label}
					</motion.button>
				);
			})}
		</div>
	);
}

const FONT_PRESETS = [
	{ label: "JetBrains", value: "JetBrains Mono, monospace", google: "JetBrains+Mono" },
	{ label: "Fira", value: "Fira Code, monospace", google: "Fira+Code" },
	{ label: "Source", value: "Source Code Pro, monospace", google: "Source+Code+Pro" },
	{ label: "IBM", value: "IBM Plex Mono, monospace", google: "IBM+Plex+Mono" },
	{ label: "Cascadia", value: "Cascadia Code, monospace", google: "Cascadia+Code" },
] as const;

const loadedFonts = new Set<string>();

function loadGoogleFont(googleName: string) {
	if (loadedFonts.has(googleName)) {
		return;
	}
	loadedFonts.add(googleName);
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = `https://fonts.googleapis.com/css2?family=${googleName}:wght@400;500;700&display=swap`;
	document.head.appendChild(link);
}

loadGoogleFont("JetBrains+Mono");

function FontPicker() {
	const { snippet, setFont } = useSnippetStore();
	const currentFont = snippet.theme.fontFamily;

	return (
		<div className="flex items-center gap-0.5">
			{FONT_PRESETS.map((f) => {
				const isSelected = currentFont.startsWith(f.label) || currentFont.includes(f.label);
				return (
					<motion.button
						key={f.label}
						type="button"
						onClick={() => {
							loadGoogleFont(f.google);
							setFont(f.value);
						}}
						whileTap={{ scale: 0.95 }}
						transition={springs.snappy}
						className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
							isSelected
								? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
								: "border-neutral-200/70 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:border-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
						}`}
						title={f.label}
					>
						{f.label}
					</motion.button>
				);
			})}
		</div>
	);
}
