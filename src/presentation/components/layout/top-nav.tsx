import { Logomark } from "@/presentation/components/ui/logomark";
import { springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { copyToClipboard, decodeShareLink, encodeShareLink } from "@/presentation/utils/share-link";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TemplatesMenu } from "./templates-menu";

/** Top navigation bar — brand, templates, and the import/export/share/theme actions. */
export function TopNav() {
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
		<nav className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b border-neutral-200/70 bg-white/70 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-4 dark:border-neutral-800/70 dark:bg-neutral-950/70">
			<input
				ref={fileInputRef}
				type="file"
				accept=".json"
				onChange={handleFileChange}
				className="hidden"
			/>
			<div className="flex items-center gap-2 sm:gap-4">
				<Link
					to="/"
					className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
					title="Back to home"
				>
					<div className="flex size-7 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
						<Logomark size={16} />
					</div>
					<span className="text-sm font-semibold tracking-tight">Typelapse</span>
				</Link>
				<TemplatesMenu />
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
				<div className="mx-1.5 h-5 w-px bg-neutral-200 dark:bg-neutral-800" />
				<NavButton onClick={toggle} title={mode === "dark" ? "Light mode" : "Dark mode"}>
					{mode === "dark" ? <SunIcon /> : <MoonIcon />}
				</NavButton>
			</div>
		</nav>
	);
}

/* ──────────── Primitives ──────────── */

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
			whileTap={{ scale: 0.96 }}
			transition={springs.snappy}
			className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
				active
					? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
			}`}
			title={title}
		>
			{children}
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
