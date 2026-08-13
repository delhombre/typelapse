import { resolveExport } from "@/application/export/resolve-export";
import { focusLineSet } from "@/application/focus/line-ranges";
import type { RenderConfig, RenderFormat } from "@/domain/entities/render-config";
import type { Snippet } from "@/domain/entities/snippet";
import { BrowserDownloadAdapter } from "@/infrastructure/export/browser-download.adapter";
import { CloudRenderAdapter } from "@/infrastructure/export/cloud-render.adapter";
import { gifDimensions } from "@/infrastructure/export/gif-quality";
import { gifSafeFps } from "@/infrastructure/export/gif-timing";
import type { WindowChrome } from "@/presentation/components/preview/frame-chrome";
import type { ProgressStyle } from "@/presentation/components/preview/reels-progress";
import { getWatermarkColor } from "@/presentation/utils/watermark-color";
import { create } from "zustand";
// Type-only: the render request contract lives with the other render DTOs. This
// import is erased at build time, so no server code enters the client bundle.
import type { RenderRequestBody } from "../../../server/remotion/types";
import { usePlanStore } from "./plan.store";
import { useSnippetStore } from "./snippet.store";
import { useSocialPreviewStore } from "./social-preview.store";

export interface ExportProgress {
	phase: "preparing" | "rendering" | "downloading";
	message: string;
	/**
	 * 0..1 when the renderer can say, null when it cannot. The hosted render
	 * streams nothing back, so it genuinely cannot; showing it a fake bar would
	 * be worse than showing it none.
	 */
	ratio: number | null;
}

/**
 * Where the video is made.
 *
 * `device` is the default wherever the browser can encode: nothing is uploaded,
 * nothing is queued, and there is no server to pay for. `server` is the honest
 * fallback for browsers without WebCodecs, and stays selectable so a user who
 * wants it can have it.
 */
export type ExportTarget = "device" | "server";

/**
 * How the last export ended. A render that finishes with no visible trace is a
 * render the user has to go hunting for in a download shelf, so this outlives
 * the render and stays on screen until it is dismissed or replaced.
 */
export type ExportOutcome =
	| {
			kind: "done";
			filename: string;
			bytes: number;
			target: ExportTarget;
			elapsedMs: number;
			/** Anything the render wants said out loud, e.g. a GIF's capped rate. */
			note?: string;
	  }
	| { kind: "failed"; message: string };

/** Morph tempo: how long each step-to-step transition takes, in milliseconds. */
export type TempoMs = 400 | 650 | 1000;

interface ExportState {
	isExporting: boolean;
	progress: ExportProgress | null;
	outcome: ExportOutcome | null;
	target: ExportTarget;
	/** null until the browser has been asked; false means WebCodecs said no. */
	deviceSupported: boolean | null;

	format: RenderFormat;
	width: number;
	height: number;
	fps: number;
	loop: boolean;
	typewriter: boolean;
	focusZoom: boolean;
	sound: boolean;
	progressStyle: ProgressStyle;
	transitionMs: TempoMs;

	setFormat: (format: RenderFormat) => void;
	setResolution: (width: number, height: number) => void;
	setFps: (fps: number) => void;
	setLoop: (loop: boolean) => void;
	setTypewriter: (typewriter: boolean) => void;
	setFocusZoom: (focusZoom: boolean) => void;
	setSound: (sound: boolean) => void;
	setProgressStyle: (style: ProgressStyle) => void;
	setTransitionMs: (ms: TempoMs) => void;
	setTarget: (target: ExportTarget) => void;
	/** Ask the browser whether it can encode the current format and size. */
	probeDevice: () => Promise<void>;
	dismissOutcome: () => void;
	/** Stop a render in flight. Only the on-device path can honour this. */
	cancelExport: () => void;

	/** Render the video, on this device or on the server. */
	exportVideo: () => Promise<void>;
	/** Export current frame as PNG screenshot */
	exportPng: () => Promise<void>;
}

/**
 * The studio's render defaults. Also what a project that omits a setting gets:
 * an imported file fully determines the render, so nothing leaks in from
 * whatever was open before it.
 */
export const EXPORT_DEFAULTS = {
	width: 1920,
	height: 1080,
	fps: 60,
	progressStyle: "reels",
	transitionMs: 650,
	typewriter: false,
	focusZoom: false,
} as const satisfies Partial<ExportState>;

const exporter = new BrowserDownloadAdapter();
const cloudExporter = new CloudRenderAdapter();

const API_BASE = "/api";

/**
 * Hosted rendering is gated off during rollout: the /api/cloud/* backend is a
 * stub. While the app runs on Plan.local (which never targets the cloud)
 * export always goes through the local server.
 * Flip this on in dev to exercise the cloud path:
 * localStorage.setItem("typelapse:cloud", "on").
 */
function isCloudExportEnabled(): boolean {
	try {
		return localStorage.getItem("typelapse:cloud") === "on";
	} catch {
		return false;
	}
}

/**
 * The in-flight render's abort handle. It lives outside the store because it is
 * not state anyone renders — only `cancelExport` ever touches it.
 */
let inFlight: AbortController | null = null;

export const useExportStore = create<ExportState>((set, get) => ({
	isExporting: false,
	progress: null,
	outcome: null,
	target: "device",
	deviceSupported: null,

	format: "mp4",
	width: EXPORT_DEFAULTS.width,
	height: EXPORT_DEFAULTS.height,
	fps: EXPORT_DEFAULTS.fps,
	loop: false,
	typewriter: EXPORT_DEFAULTS.typewriter,
	focusZoom: EXPORT_DEFAULTS.focusZoom,
	sound: false,
	progressStyle: EXPORT_DEFAULTS.progressStyle,
	transitionMs: EXPORT_DEFAULTS.transitionMs,

	// Changing the format or the size changes what the browser is being asked to
	// encode, so the previous answer stops being an answer.
	setFormat: (format) => {
		set({ format, deviceSupported: null });
		void get().probeDevice();
	},
	setResolution: (width, height) => {
		set({ width, height, deviceSupported: null });
		void get().probeDevice();
	},
	setFps: (fps) => {
		set({ fps, deviceSupported: null });
		void get().probeDevice();
	},
	setLoop: (loop) => set({ loop }),
	setTypewriter: (typewriter) => set({ typewriter }),
	setFocusZoom: (focusZoom) => set({ focusZoom }),
	setSound: (sound) => set({ sound }),
	setProgressStyle: (progressStyle) => set({ progressStyle }),
	setTransitionMs: (transitionMs) => set({ transitionMs }),
	setTarget: (target) => set({ target }),
	dismissOutcome: () => set({ outcome: null }),

	cancelExport: () => {
		inFlight?.abort();
	},

	probeDevice: async () => {
		const { format, width, height, fps } = get();
		try {
			const { isClientExportSupported } = await import(
				"@/infrastructure/export/webcodecs-renderer.adapter"
			);
			set({ deviceSupported: await isClientExportSupported(format, width, height, fps) });
		} catch {
			set({ deviceSupported: false });
		}
	},

	exportVideo: async () => {
		const snippetState = useSnippetStore.getState();
		const {
			snippet,
			background,
			windowChrome,
			showLineNumbers,
			lineNumberStart,
			framePadding,
			cardMargin,
			watermark,
		} = snippetState;

		if (snippet.steps.length < 2) {
			set({ outcome: { kind: "failed", message: "At least 2 steps are required for export." } });
			return;
		}

		const {
			format,
			width,
			height,
			fps,
			loop,
			typewriter,
			focusZoom,
			sound,
			progressStyle,
			transitionMs,
		} = get();

		const { plan } = usePlanStore.getState();
		// Apply plan entitlements (resolution/fps caps + watermark) in one place so
		// the preview and the export never disagree. Under Plan.local this is a
		// pass-through no-op: nothing is clamped and the user's watermark is kept.
		const resolved = resolveExport(plan, { width, height, fps, format, userWatermark: watermark });

		const filename = snippet.title.replace(/[^a-zA-Z0-9-_]/g, "_") || "typelapse";
		const startedAt = performance.now();

		// The on-device path is the default wherever the browser can encode: it is
		// faster, it is private, and it costs nobody a headless Chrome. The probe
		// runs here rather than trusting a cached answer, because format and size
		// can have changed since the last one.
		if (get().target === "device") {
			await get().probeDevice();
			if (get().deviceSupported) {
				await renderOnDevice({
					snippet,
					config: resolved.config,
					filename,
					startedAt,
					watermarkText: resolved.watermark,
					sound,
					set,
					scenery: {
						background,
						chrome: windowChrome,
						padding: framePadding,
						cardMargin,
						showLineNumbers,
						lineNumberStart,
						transitionMs,
						loop,
						typewriter,
						focusZoom,
						progressStyle,
					},
				});
				return;
			}
			// The browser said no. Fall through to the server, and say why rather
			// than silently rendering somewhere the user did not choose.
			set({ target: "server" });
		}

		set({
			isExporting: true,
			progress: { phase: "preparing", message: "Sending to server…", ratio: null },
			outcome: null,
		});

		try {
			const { theme } = snippet;
			const themePayload = {
				name: theme.name,
				background: theme.background,
				foreground: theme.foreground,
				fontFamily: theme.fontFamily,
				fontSize: theme.fontSize,
				borderRadius: theme.borderRadius,
			};

			// Hosted render path (Pro/Team). The backend is a stub today and gated
			// off, and Plan.local never targets the cloud, so this branch stays
			// dormant in the local app.
			if (resolved.target === "cloud" && isCloudExportEnabled()) {
				set({
					progress: { phase: "rendering", message: "Rendering on our servers…", ratio: null },
				});
				const job = await cloudExporter.submitRender({
					title: snippet.title,
					language: snippet.language,
					theme: themePayload,
					steps: snippet.steps.map((s) => ({ code: s.code, duration: s.duration })),
					background,
					framePadding,
					config: resolved.config,
					watermark: resolved.watermark,
				});
				set({
					isExporting: false,
					progress: null,
					outcome: {
						kind: "failed",
						message: job.message ?? "Hosted rendering is rolling out soon, your job was queued.",
					},
				});
				return;
			}

			const body: RenderRequestBody = {
				title: snippet.title,
				language: snippet.language,
				theme: themePayload,
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
				cardMargin,
				width: resolved.config.width,
				height: resolved.config.height,
				fps: resolved.config.fps,
				format: resolved.config.format,
				loop,
				typewriter,
				focusZoom,
				sound,
				progressStyle,
				transitionMs,
				watermark: resolved.watermark,
			};

			set({ progress: { phase: "rendering", message: "Rendering on the server…", ratio: null } });

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

			set({ progress: { phase: "downloading", message: "Downloading…", ratio: null } });

			const blob = await response.blob();
			await exporter.export(blob, filename, resolved.config.format);

			set({
				isExporting: false,
				progress: null,
				outcome: {
					kind: "done",
					filename: `${filename}.${resolved.config.format}`,
					bytes: blob.size,
					target: "server",
					elapsedMs: performance.now() - startedAt,
				},
			});
		} catch (err) {
			set({
				isExporting: false,
				progress: null,
				outcome: {
					kind: "failed",
					message: err instanceof Error ? err.message : "The export failed.",
				},
			});
		}
	},

	exportPng: async () => {
		const el = document.querySelector("[data-export-target]") as HTMLElement | null;
		if (!el) {
			set({ outcome: { kind: "failed", message: "No preview element found." } });
			return;
		}
		const startedAt = performance.now();

		set({
			isExporting: true,
			progress: { phase: "preparing", message: "Capturing…", ratio: null },
			outcome: null,
		});

		// Social-preview mode makes the card margin transparent (the mesh moves to
		// the aspect box). A PNG must always capture the clean mesh card, so drop
		// out of social mode for the snapshot and restore it afterward.
		const social = useSocialPreviewStore.getState();
		const restoreSocial = social.enabled;
		if (restoreSocial) {
			social.setEnabled(false);
			// Let React repaint the card with its own mesh before capturing.
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			});
		}

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

			set({
				isExporting: false,
				progress: null,
				outcome: {
					kind: "done",
					filename: `${filename}.png`,
					bytes: blob.size,
					target: "device",
					elapsedMs: performance.now() - startedAt,
				},
			});
		} catch (err) {
			set({
				isExporting: false,
				progress: null,
				outcome: {
					kind: "failed",
					message: err instanceof Error ? err.message : "The PNG export failed.",
				},
			});
		} finally {
			if (restoreSocial) {
				social.setEnabled(true);
			}
		}
	},
}));

interface DeviceRenderInput {
	snippet: Snippet;
	config: RenderConfig;
	filename: string;
	startedAt: number;
	watermarkText: string | undefined;
	/** Only so the panel can say the canvas renderer has no audio track yet. */
	sound: boolean;
	set: (partial: Partial<ExportState>) => void;
	scenery: {
		background: string;
		chrome: WindowChrome;
		padding: number;
		cardMargin: number;
		showLineNumbers: boolean;
		lineNumberStart: number;
		transitionMs: number;
		loop: boolean;
		typewriter: boolean;
		focusZoom: boolean;
		progressStyle: ProgressStyle;
	};
}

/**
 * Render in this tab, through the `RendererPort` implementation that never
 * leaves the machine.
 *
 * The adapter is constructed per export rather than kept around: it is
 * configured with the *look*, and the look is exactly what the user has been
 * changing while deciding to press the button.
 */
async function renderOnDevice(input: DeviceRenderInput): Promise<void> {
	const { snippet, config, filename, startedAt, set, scenery } = input;
	const { plan } = useSnippetStore.getState();
	if (!plan) {
		set({
			outcome: {
				kind: "failed",
				message: "The animation is still building; try again in a moment.",
			},
		});
		return;
	}

	const controller = new AbortController();
	inFlight = controller;
	set({
		isExporting: true,
		outcome: null,
		progress: { phase: "preparing", message: "Preparing…", ratio: 0 },
	});

	try {
		const { WebCodecsRendererAdapter } = await import(
			"@/infrastructure/export/webcodecs-renderer.adapter"
		);
		const renderer = new WebCodecsRendererAdapter({
			plan,
			background: scenery.background,
			chrome: scenery.chrome,
			padding: scenery.padding,
			cardMargin: scenery.cardMargin,
			showLineNumbers: scenery.showLineNumbers,
			lineNumberStart: scenery.lineNumberStart,
			transitionMs: scenery.transitionMs,
			loop: scenery.loop,
			typewriter: scenery.typewriter,
			focusZoom: scenery.focusZoom,
			// The composition only bakes a bar when there is more than one step to
			// divide it into; matching that keeps the two exports the same video.
			progress:
				snippet.steps.length >= 2
					? { style: scenery.progressStyle, segments: snippet.steps.length }
					: null,
			watermark: input.watermarkText
				? {
						text: input.watermarkText,
						color: getWatermarkColor(scenery.background, snippet.theme.foreground),
					}
				: null,
		});

		const blob = await renderer.renderVideo(snippet, config, {
			signal: controller.signal,
			onProgress: (progress) => {
				set({
					progress: {
						phase: progress.phase === "finalizing" ? "downloading" : "rendering",
						message:
							progress.phase === "finalizing"
								? "Writing the file…"
								: `Rendering on this device · ${Math.round(progress.ratio * 100)}%`,
						ratio: progress.ratio,
					},
				});
			},
		});

		await exporter.export(blob, filename, config.format);
		set({
			isExporting: false,
			progress: null,
			outcome: {
				kind: "done",
				filename: `${filename}.${config.format}`,
				bytes: blob.size,
				target: "device",
				elapsedMs: performance.now() - startedAt,
				note: deviceNote(
					snippet,
					config,
					input.sound,
					renderer.lastMeasurements?.transparencyNote ?? null,
				),
			},
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			set({ isExporting: false, progress: null, outcome: null });
			return;
		}
		set({
			isExporting: false,
			progress: null,
			outcome: {
				kind: "failed",
				message: `${
					error instanceof Error ? error.message : "The render failed on this device."
				} You can switch to the server render instead.`,
			},
		});
	} finally {
		inFlight = null;
	}
}

/**
 * Anything the finished file is not, having been asked for.
 *
 * A file that is quietly not what was requested is worse than one that says so,
 * and this path has several: GIF's two format concessions, whatever became of a
 * transparent background in this container, and the two things the canvas
 * renderer cannot bake yet. The server still can, and the panel says which.
 *
 * The transparency line comes from the worker rather than being worked out
 * here, because only the worker knows whether this browser's encoder agreed to
 * carry an alpha channel.
 */
function deviceNote(
	snippet: Snippet,
	config: RenderConfig,
	sound: boolean,
	transparency: string | null,
): string | undefined {
	const notes: string[] = [];

	if (transparency) {
		notes.push(transparency);
	}
	if (config.format === "gif") {
		const gif = gifDimensions(config.width, config.height);
		const fps = gifSafeFps(config.fps);
		const concessions = [
			// The rate is asked of the same function the worker uses, so the note
			// cannot drift from what the file actually gets.
			fps < config.fps ? `${fps} fps (not ${config.fps}, so the pixels win)` : null,
			gif.scaled ? `${gif.width}×${gif.height}` : null,
		].filter(Boolean);
		if (concessions.length > 0) {
			notes.push(`GIF: ${concessions.join(", ")}`);
		}
	}
	if (sound) {
		notes.push("no audio track on this device yet — render on the server for sound");
	}
	if (snippet.steps.some((step) => step.annotation)) {
		notes.push("captions are not baked on this device yet");
	}

	return notes.length > 0 ? `${notes.join(". ")}.` : undefined;
}
