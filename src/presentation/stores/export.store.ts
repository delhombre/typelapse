import type { RenderFormat } from "@/domain/entities/render-config";
import { BrowserDownloadAdapter } from "@/infrastructure/export/browser-download.adapter";
import { create } from "zustand";
import { useSnippetStore } from "./snippet.store";

export interface ExportProgress {
	phase: "preparing" | "rendering" | "downloading";
	message: string;
}

interface ExportState {
	isExporting: boolean;
	progress: ExportProgress | null;
	error: string | null;

	format: RenderFormat;
	width: number;
	height: number;
	fps: number;

	setFormat: (format: RenderFormat) => void;
	setResolution: (width: number, height: number) => void;
	setFps: (fps: number) => void;

	/** Export via Remotion backend */
	exportVideo: () => Promise<void>;
}

const exporter = new BrowserDownloadAdapter();

const API_BASE = "/api";

export const useExportStore = create<ExportState>((set, get) => ({
	isExporting: false,
	progress: null,
	error: null,

	format: "mp4",
	width: 1920,
	height: 1080,
	fps: 60,

	setFormat: (format) => set({ format }),
	setResolution: (width, height) => set({ width, height }),
	setFps: (fps) => set({ fps }),

	exportVideo: async () => {
		const snippetState = useSnippetStore.getState();
		const { snippet, background, framePadding } = snippetState;

		if (snippet.steps.length < 2) {
			set({ error: "At least 2 steps required for export" });
			return;
		}

		const { format, width, height, fps } = get();

		set({
			isExporting: true,
			progress: { phase: "preparing", message: "Sending to server..." },
			error: null,
		});

		try {
			const { theme } = snippet;

			const body = {
				title: snippet.title,
				language: snippet.language,
				theme: {
					name: theme.name,
					background: theme.background,
					foreground: theme.foreground,
					fontFamily: theme.fontFamily,
					fontSize: theme.fontSize,
					padding: theme.padding,
					borderRadius: theme.borderRadius,
				},
				steps: snippet.steps.map((s) => ({ code: s.code, duration: s.duration })),
				background,
				framePadding,
				width,
				height,
				fps,
				format,
			};

			set({ progress: { phase: "rendering", message: "Rendering video..." } });

			const response = await fetch(`${API_BASE}/render`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => null);
				const message =
					(errorData as { error?: string } | null)?.error ?? `Server error (${response.status})`;
				throw new Error(message);
			}

			set({ progress: { phase: "downloading", message: "Downloading..." } });

			const blob = await response.blob();
			const filename = snippet.title.replace(/[^a-zA-Z0-9-_]/g, "_") || "typelapse";
			await exporter.export(blob, filename, format);

			set({ isExporting: false, progress: null });
		} catch (err) {
			set({
				isExporting: false,
				progress: null,
				error: err instanceof Error ? err.message : "Export failed",
			});
		}
	},
}));
