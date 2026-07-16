import { focusLineSet } from "@/application/focus/line-ranges";
import type { RenderFormat } from "@/domain/entities/render-config";
import { BrowserDownloadAdapter } from "@/infrastructure/export/browser-download.adapter";
import type { ProgressStyle } from "@/presentation/components/preview/reels-progress";
import { create } from "zustand";
import { useSnippetStore } from "./snippet.store";

export interface ExportProgress {
	phase: "preparing" | "rendering" | "downloading";
	message: string;
}

/** Morph tempo — how long each step-to-step transition takes, in milliseconds. */
export type TempoMs = 400 | 650 | 1000;

interface ExportState {
	isExporting: boolean;
	progress: ExportProgress | null;
	error: string | null;

	format: RenderFormat;
	width: number;
	height: number;
	fps: number;
	loop: boolean;
	typewriter: boolean;
	progressStyle: ProgressStyle;
	transitionMs: TempoMs;

	setFormat: (format: RenderFormat) => void;
	setResolution: (width: number, height: number) => void;
	setFps: (fps: number) => void;
	setLoop: (loop: boolean) => void;
	setTypewriter: (typewriter: boolean) => void;
	setProgressStyle: (style: ProgressStyle) => void;
	setTransitionMs: (ms: TempoMs) => void;

	/** Export via Remotion backend */
	exportVideo: () => Promise<void>;
	/** Export current frame as PNG screenshot */
	exportPng: () => Promise<void>;
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
	loop: false,
	typewriter: false,
	progressStyle: "reels",
	transitionMs: 650,

	setFormat: (format) => set({ format }),
	setResolution: (width, height) => set({ width, height }),
	setFps: (fps) => set({ fps }),
	setLoop: (loop) => set({ loop }),
	setTypewriter: (typewriter) => set({ typewriter }),
	setProgressStyle: (progressStyle) => set({ progressStyle }),
	setTransitionMs: (transitionMs) => set({ transitionMs }),

	exportVideo: async () => {
		const snippetState = useSnippetStore.getState();
		const {
			snippet,
			background,
			windowChrome,
			showLineNumbers,
			lineNumberStart,
			framePadding,
			watermark,
		} = snippetState;

		if (snippet.steps.length < 2) {
			set({ error: "At least 2 steps required for export" });
			return;
		}

		const { format, width, height, fps, loop, typewriter, progressStyle, transitionMs } = get();

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
				steps: snippet.steps.map((s) => {
					const focus = [...focusLineSet(s.highlightRanges)];
					return {
						code: s.code,
						duration: s.duration,
						focus: focus.length > 0 ? focus : undefined,
						caption: s.annotation || undefined,
					};
				}),
				background,
				windowChrome,
				showLineNumbers,
				lineNumberStart,
				framePadding,
				width,
				height,
				fps,
				format,
				loop,
				typewriter,
				progressStyle,
				transitionMs,
				watermark: watermark || undefined,
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

	exportPng: async () => {
		const el = document.querySelector("[data-export-target]") as HTMLElement | null;
		if (!el) {
			set({ error: "No preview element found" });
			return;
		}

		set({
			isExporting: true,
			progress: { phase: "preparing", message: "Capturing..." },
			error: null,
		});

		try {
			const { domToBlob } = await import("modern-screenshot");
			const blob = await domToBlob(el, {
				scale: 2,
				backgroundColor: null,
			});

			if (!blob) {
				throw new Error("Failed to create PNG");
			}

			const snippetState = useSnippetStore.getState();
			const filename = snippetState.snippet.title.replace(/[^a-zA-Z0-9-_]/g, "_") || "typelapse";
			await exporter.export(blob, filename, "png" as RenderFormat);

			set({ isExporting: false, progress: null });
		} catch (err) {
			set({
				isExporting: false,
				progress: null,
				error: err instanceof Error ? err.message : "PNG export failed",
			});
		}
	},
}));
