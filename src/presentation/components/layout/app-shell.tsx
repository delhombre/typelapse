import { useKeyboardShortcuts } from "@/presentation/hooks/use-keyboard-shortcuts";
import { mountVariants, springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { motion } from "motion/react";
import { useCallback, useRef } from "react";
import type { ReactNode } from "react";

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
			// Reset input so the same file can be re-imported
			e.target.value = "";
		},
		[importFromJson],
	);

	return (
		<div className="flex h-dvh w-screen flex-col overflow-hidden bg-neutral-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			{/* Hidden file input for import */}
			<input
				ref={fileInputRef}
				type="file"
				accept=".json"
				onChange={handleFileChange}
				className="hidden"
			/>

			{/* Toolbar */}
			<div className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-200/60 px-5 dark:border-neutral-700/30">
				<div className="flex items-center gap-3">
					<span className="font-mono text-[11px] font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
						Typelapse
					</span>
					<span className="font-mono text-[9px] text-neutral-400 dark:text-neutral-600">
						v0.1.0
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<motion.button
						type="button"
						onClick={handleImport}
						whileTap={{ scale: 0.93 }}
						transition={springs.snappy}
						className="flex size-7 items-center justify-center rounded-md border border-neutral-200/60 text-neutral-400 transition-colors hover:text-neutral-900 dark:border-neutral-700/30 dark:text-neutral-500 dark:hover:text-neutral-100"
						title="Import snippet from JSON"
					>
						<UploadIcon />
					</motion.button>
					<motion.button
						type="button"
						onClick={handleExport}
						whileTap={{ scale: 0.93 }}
						transition={springs.snappy}
						className="flex size-7 items-center justify-center rounded-md border border-neutral-200/60 text-neutral-400 transition-colors hover:text-neutral-900 dark:border-neutral-700/30 dark:text-neutral-500 dark:hover:text-neutral-100"
						title="Export snippet as JSON"
					>
						<DownloadIcon />
					</motion.button>
					<motion.button
						type="button"
						onClick={toggle}
						whileTap={{ scale: 0.93 }}
						transition={springs.snappy}
						className="flex size-7 items-center justify-center rounded-md border border-neutral-200/60 text-neutral-400 transition-colors hover:text-neutral-900 dark:border-neutral-700/30 dark:text-neutral-500 dark:hover:text-neutral-100"
						title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
					>
						{mode === "dark" ? <SunIcon /> : <MoonIcon />}
					</motion.button>
				</div>
			</div>

			{/* Main content — takes remaining height */}
			<div className="flex min-h-0 flex-1">
				{/* Left panel — Editor + Steps */}
				<motion.div
					className="flex w-[380px] shrink-0 flex-col overflow-hidden border-r border-neutral-200/60 dark:border-neutral-700/30"
					variants={mountVariants}
					initial="hidden"
					animate="visible"
					transition={springs.gentle}
				>
					{/* Code section */}
					<div className="flex min-h-0 flex-1 flex-col">
						<SectionHeader label="Code" />
						<div className="flex min-h-0 flex-1 flex-col px-4 pb-4">{editor}</div>
					</div>

					{/* Steps section */}
					<div className="shrink-0 border-t border-neutral-200/60 dark:border-neutral-700/30">
						<SectionHeader label="Steps" />
						<div className="px-4 pb-4">{stepBuilder}</div>
					</div>
				</motion.div>

				{/* Right panel — Preview */}
				<motion.div
					className="flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-900/30"
					variants={mountVariants}
					initial="hidden"
					animate="visible"
					transition={{ ...springs.gentle, delay: 0.08 }}
				>
					<SectionHeader label="Preview" />
					<div className="min-h-0 flex-1">{preview}</div>
				</motion.div>
			</div>
		</div>
	);
}

function SectionHeader({ label }: { label: string }) {
	return (
		<div className="flex h-8 items-center px-4">
			<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-600">
				{label}
			</span>
		</div>
	);
}

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
