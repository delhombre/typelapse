import { useKeyboardShortcuts } from "@/presentation/hooks/use-keyboard-shortcuts";
import { mountVariants, springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { copyToClipboard, decodeShareLink, encodeShareLink } from "@/presentation/utils/share-link";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ExportBar } from "../settings/export-bar";
import { SettingsStrip } from "../settings/settings-panel";

interface AppShellProps {
	editor: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

export function AppShell({ editor, stepBuilder, preview }: AppShellProps) {
	useKeyboardShortcuts();
	const { mode, toggle } = useThemeModeStore();
	const exportToJson = useSnippetStore((s) => s.exportToJson);
	const importFromJson = useSnippetStore((s) => s.importFromJson);
	const snippetTitle = useSnippetStore((s) => s.snippet.title);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [shareCopied, setShareCopied] = useState(false);

	// Load from share link on mount
	useEffect(() => {
		const shareData = decodeShareLink();
		if (shareData) {
			try {
				importFromJson(JSON.stringify(shareData));
				history.replaceState(null, "", window.location.pathname);
			} catch {
				// Invalid share data
			}
		}
	}, [importFromJson]);

	const handleShare = useCallback(async () => {
		const state = useSnippetStore.getState();
		const { snippet, background } = state;
		const link = encodeShareLink({
			title: snippet.title,
			code: snippet.code,
			language: snippet.language,
			themeName: snippet.theme.name,
			background,
			steps: snippet.steps.map((s) => ({ code: s.code, duration: s.duration })),
		});
		const copied = await copyToClipboard(link);
		if (copied) {
			setShareCopied(true);
			setTimeout(() => setShareCopied(false), 2000);
		}
	}, []);

	const handleExport = useCallback(() => {
		const json = exportToJson();
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${snippetTitle.replace(/\s+/g, "-").toLowerCase()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}, [exportToJson, snippetTitle]);

	const handleImport = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) {
				return;
			}
			const reader = new FileReader();
			reader.onload = (ev) => {
				const text = ev.target?.result;
				if (typeof text === "string") {
					try {
						importFromJson(text);
					} catch (err) {
						console.error("Import failed:", err);
					}
				}
			};
			reader.readAsText(file);
			e.target.value = "";
		},
		[importFromJson],
	);

	return (
		<div className="grid h-dvh w-screen grid-cols-[280px_1fr] grid-rows-[40px_1fr_40px] overflow-hidden bg-neutral-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<input
				ref={fileInputRef}
				type="file"
				accept=".json"
				onChange={handleFileChange}
				className="hidden"
			/>

			{/* ── Nav bar ── */}
			<nav className="col-span-2 flex items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
				<div className="flex items-center gap-3">
					<span className="font-mono text-[11px] font-semibold tracking-tight">Typelapse</span>
					<span className="font-mono text-[8px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-600">
						v0.1.0
					</span>
				</div>
				<div className="flex items-center gap-1">
					<NavButton onClick={handleImport} title="Import JSON">
						<UploadIcon />
					</NavButton>
					<NavButton onClick={handleExport} title="Export JSON">
						<DownloadIcon />
					</NavButton>
					<NavButton
						onClick={handleShare}
						title={shareCopied ? "Copied!" : "Share link"}
						active={shareCopied}
					>
						{shareCopied ? <CheckIcon /> : <ShareIcon />}
					</NavButton>
					<div className="mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />
					<NavButton onClick={toggle} title={mode === "dark" ? "Light mode" : "Dark mode"}>
						{mode === "dark" ? <SunIcon /> : <MoonIcon />}
					</NavButton>
				</div>
			</nav>

			{/* ── Left panel ── */}
			<motion.div
				className="relative flex flex-col overflow-hidden border-r border-neutral-200 dark:border-neutral-800"
				variants={mountVariants}
				initial="hidden"
				animate="visible"
				transition={springs.gentle}
			>
				{/* Corner brackets */}
				<CornerBrackets />

				{/* Code section */}
				<div className="flex min-h-0 flex-1 flex-col">
					<SectionLabel>Code</SectionLabel>
					<div className="flex min-h-0 flex-1 flex-col px-3 pb-3">{editor}</div>
				</div>

				{/* Divider with dot */}
				<div className="relative border-t border-neutral-200 dark:border-neutral-800">
					<GridDot position="top-left" />
				</div>

				{/* Steps section */}
				<div className="shrink-0">
					<SectionLabel>Steps</SectionLabel>
					<div className="px-3 pb-3">{stepBuilder}</div>
				</div>
			</motion.div>

			{/* ── Main area — Preview + Playback + Settings ── */}
			<motion.div
				className="relative flex min-h-0 flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-900/30"
				variants={mountVariants}
				initial="hidden"
				animate="visible"
				transition={{ ...springs.gentle, delay: 0.06 }}
			>
				<CornerBrackets />

				{/* Preview canvas — the centerpiece */}
				<div className="flex min-h-0 flex-1 flex-col">{preview}</div>

				{/* Settings strip */}
				<div className="relative shrink-0 border-t border-dashed border-neutral-300 dark:border-neutral-700">
					<GridDot position="top-left" />
					<GridDot position="top-right" />
					<SettingsStrip />
				</div>
			</motion.div>

			{/* ── Export bar — full width ── */}
			<motion.div
				className="col-span-2 border-t border-neutral-200 dark:border-neutral-800"
				variants={mountVariants}
				initial="hidden"
				animate="visible"
				transition={{ ...springs.gentle, delay: 0.1 }}
			>
				<ExportBar />
			</motion.div>
		</div>
	);
}

/* ──────────── Primitives ──────────── */

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-7 items-center px-3">
			<span className="font-mono text-[8px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-600">
				{children}
			</span>
		</div>
	);
}

function CornerBrackets() {
	const cn = "pointer-events-none absolute z-20 h-2.5 w-2.5 transition-colors duration-300";
	const border = "border-neutral-900/20 dark:border-neutral-100/20";
	return (
		<>
			<span className={`${cn} ${border} top-0 left-0 border-t border-l`} />
			<span className={`${cn} ${border} top-0 right-0 border-t border-r`} />
			<span className={`${cn} ${border} bottom-0 left-0 border-b border-l`} />
			<span className={`${cn} ${border} bottom-0 right-0 border-b border-r`} />
		</>
	);
}

function GridDot({ position }: { position: "top-left" | "top-right" }) {
	const pos = position === "top-left" ? "-top-[4px] -left-[4px]" : "-top-[4px] -right-[4px]";
	return (
		<div
			className={`absolute ${pos} z-10 size-2 rounded-full border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950`}
		/>
	);
}

function NavButton({
	onClick,
	title,
	active,
	children,
}: {
	onClick: () => void;
	title: string;
	active?: boolean;
	children: ReactNode;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileTap={{ scale: 0.92 }}
			transition={springs.snappy}
			className={`group relative flex size-7 items-center justify-center overflow-hidden transition-colors ${
				active
					? "text-green-500"
					: "text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-100"
			}`}
			title={title}
		>
			{children}
			<span className="shine-effect pointer-events-none absolute -top-1/2 -left-full z-20 h-[200%] w-3/4 skew-x-[-20deg] bg-linear-to-r from-transparent via-white/30 to-transparent" />
		</motion.button>
	);
}

/* ──────────── Icons ──────────── */

function SunIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			role="img"
		>
			<title>Light mode</title>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</svg>
	);
}

function MoonIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			role="img"
		>
			<title>Dark mode</title>
			<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
		</svg>
	);
}

function DownloadIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			role="img"
		>
			<title>Export</title>
			<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
		</svg>
	);
}

function UploadIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			role="img"
		>
			<title>Import</title>
			<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
		</svg>
	);
}

function ShareIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			role="img"
		>
			<title>Share</title>
			<circle cx="18" cy="5" r="3" />
			<circle cx="6" cy="12" r="3" />
			<circle cx="18" cy="19" r="3" />
			<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
			<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			role="img"
		>
			<title>Copied</title>
			<polyline points="20 6 9 17 4 12" />
		</svg>
	);
}
