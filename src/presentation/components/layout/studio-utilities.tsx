import { ConfirmDiscardOverlay } from "@/presentation/components/ui/confirm-discard";
import { springs } from "@/presentation/motion";
import { notify } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { copyToClipboard, decodeShareLink, encodeShareLink } from "@/presentation/utils/share-link";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DiffImportMenu } from "./diff-import-menu";
import { TemplateGallery } from "./template-gallery";
import { UrlImportMenu } from "./url-import-menu";

/**
 * Everything that opens or leaves the project: templates, the two importers,
 * JSON in and out, the share link, and the colour scheme.
 *
 * It used to be the right half of a 56px bar that ran the whole width of the
 * window to hold seven 36px buttons. The scene has no bars, so it is a chip in
 * the top right corner — the same controls, the same popovers, anchored to the
 * corner they now live in.
 */
export function StudioUtilities() {
	const { mode, toggle } = useThemeModeStore();
	const exportToJson = useSnippetStore((s) => s.exportToJson);
	const importFromJson = useSnippetStore((s) => s.importFromJson);
	const snippetTitle = useSnippetStore((s) => s.snippet.title);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [shareCopied, setShareCopied] = useState(false);
	/** A read file waiting on a confirm, because opening it would discard edits. */
	const [pendingFile, setPendingFile] = useState<{ name: string; json: string } | null>(null);

	// Load from share link on mount
	useEffect(() => {
		const shareData = decodeShareLink();
		if (shareData) {
			try {
				// importFromJson restores the export-store settings (tempo, zoom,
				// typewriter, progress style) from the same snapshot, so no manual
				// re-application is needed here.
				importFromJson(JSON.stringify(shareData));
				history.replaceState(null, "", window.location.pathname);
			} catch {
				// Invalid share data
			}
		}
	}, [importFromJson]);

	const handleShare = useCallback(async () => {
		// One producer of the project format: the link carries exactly what a JSON
		// export carries, so the two can never drift apart.
		const link = encodeShareLink(useSnippetStore.getState().toProjectPayload());
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

	/** Open the file's JSON; a refusal is said out loud, not logged. */
	const applyJson = useCallback(
		(json: string, name: string) => {
			try {
				importFromJson(json);
			} catch (err) {
				notify(err instanceof Error ? err.message : "That file could not be read.", {
					tone: "error",
					detail: name,
				});
			}
		},
		[importFromJson],
	);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) {
				return;
			}
			const reader = new FileReader();
			reader.onload = (ev) => {
				const text = ev.target?.result;
				if (typeof text !== "string") {
					return;
				}
				// Opening replaces the whole studio: edited work is asked about first,
				// through the same confirm the template gallery walks.
				if (useSnippetStore.getState().hasUnsavedEdits()) {
					setPendingFile({ name: file.name, json: text });
					return;
				}
				applyJson(text, file.name);
			};
			reader.readAsText(file);
			e.target.value = "";
		},
		[applyJson],
	);

	return (
		<div className="sc-chip sc-utilities">
			<input
				ref={fileInputRef}
				type="file"
				accept=".json"
				onChange={handleFileChange}
				className="hidden"
			/>
			<TemplateGallery />
			<span className="sc-seam" />
			<UrlImportMenu />
			<DiffImportMenu />
			<UtilityButton onClick={handleImport} title="Import JSON">
				<UploadIcon />
			</UtilityButton>
			<UtilityButton onClick={handleExport} title="Export JSON">
				<DownloadIcon />
			</UtilityButton>
			<UtilityButton
				onClick={handleShare}
				title={shareCopied ? "Copied!" : "Share link"}
				active={shareCopied}
			>
				{shareCopied ? <CheckIcon /> : <ShareIcon />}
			</UtilityButton>
			<span className="sc-seam" />
			<UtilityButton onClick={toggle} title={mode === "dark" ? "Light mode" : "Dark mode"}>
				{mode === "dark" ? <SunIcon /> : <MoonIcon />}
			</UtilityButton>
			<ConfirmDiscardOverlay
				open={pendingFile !== null}
				message={`Replace what you have with “${pendingFile?.name ?? ""}”?`}
				confirmLabel="Open the file"
				onCancel={() => setPendingFile(null)}
				onConfirm={() => {
					if (pendingFile) {
						applyJson(pendingFile.json, pendingFile.name);
					}
					setPendingFile(null);
				}}
			/>
		</div>
	);
}

/* ──────────── Primitives ──────────── */

function UtilityButton({
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
			className={`hit-ext sc-glyph-button ${active ? "sc-glyph-button-active" : ""}`}
			title={title}
			aria-label={title}
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
			aria-hidden="true"
		>
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
			aria-hidden="true"
		>
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
			aria-hidden="true"
		>
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
			aria-hidden="true"
		>
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
			aria-hidden="true"
		>
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
			aria-hidden="true"
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
	);
}
