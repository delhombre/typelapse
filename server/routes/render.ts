import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { type BundledLanguage, type Highlighter, createHighlighter } from "shiki";
import {
	collectSceneTickEvents,
	encodeWavBase64,
	renderTickTrack,
} from "../../src/application/audio/tick-synth";
import { exportFilename } from "../../src/application/export/export-filename";
import { isSafeBackground } from "../../src/application/backgrounds/mesh-gradient";
import { clampRenderDimension } from "../../src/domain/entities/render-config";
import { TRANSITION_MS } from "../../src/application/magic-move/timeline";
import { typingHoldIndex } from "../../src/application/magic-move/typewriter";
import {
	DEFAULT_TRANSITION_EASING,
	isCubicBezier,
} from "../../src/application/magic-move/easing";
import { resolveShikiLanguage, resolveShikiTheme } from "../../src/infrastructure/highlighting/shiki-registry";
import { buildServerMagicMovePlan } from "../remotion/magic-move-plan";
import {
	gifFilterOverride,
	outputSettingsFor,
	safeFormat,
	videoColorOverride,
} from "../remotion/output-settings";
import {
	progressStyleOf,
	renderRequestProblem,
	windowChromeOf,
} from "../remotion/render-request";
import type { RenderInput, RenderRequestBody, StepData } from "../remotion/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const renderRoute = new Hono();

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: [
				"github-dark",
				"aurora-x",
				"github-light",
				"dracula",
				"one-dark-pro",
				"catppuccin-mocha",
				"nord",
			],
			langs: ["typescript", "javascript", "python", "json"],
		});
	}
	return highlighterPromise;
}

/** Load a bundled language on demand so every editor language renders. */
async function ensureLanguage(highlighter: Highlighter, lang: string) {
	if (lang !== "text" && !highlighter.getLoadedLanguages().includes(lang)) {
		await highlighter.loadLanguage(lang as BundledLanguage);
	}
}

const isDev = process.env.NODE_ENV !== "production";

function createBundle() {
	console.log("Bundling Remotion composition...");
	return bundle({
		entryPoint: path.resolve(__dirname, "../remotion/root.tsx"),
		onProgress: (progress) => {
			if (progress === 100) {
				console.log("Remotion bundle ready");
			}
		},
	});
}

/* Production bundles once and shares it. Dev bundles per request so composition
   edits show up without a restart, and each of those bundles is single-use: it
   is ~21 MB in the OS temp dir, and nothing removed it, so every dev render used
   to leave one behind. Dev therefore skips the shared bundle entirely (it was
   never served) and removes its own after the render. */
const bundlePromise: Promise<string> | null = isDev
	? null
	: createBundle().catch((err) => {
			console.error("Bundle failed:", err);
			throw err;
		});

/** For one-shot callers (the demo script): the shared bundle outlives no process, so remove it. */
async function disposeSharedBundle(): Promise<void> {
	if (!bundlePromise) {
		return;
	}
	const serveUrl = await bundlePromise.catch(() => null);
	if (serveUrl) {
		await rm(serveUrl, { recursive: true, force: true });
	}
}

async function acquireBundle(): Promise<{ serveUrl: string; release: () => Promise<void> }> {
	if (bundlePromise) {
		return { serveUrl: await bundlePromise, release: async () => undefined };
	}
	const serveUrl = await createBundle();
	return { serveUrl, release: () => rm(serveUrl, { recursive: true, force: true }) };
}
getHighlighter().catch(console.error);

/* ── Request hardening ─────────────────────────────────────────────────────
   The render route is an untrusted trust boundary: the payload drives headless
   Chrome + ffmpeg. Every field below is clamped/whitelisted so a crafted request
   cannot write outside the temp dir, exhaust the server (DoS), or make it fetch a
   remote resource (SSRF). Legitimate payloads already fall inside every range, so
   behavior for them is unchanged. */

/* The format table, the codec/quality knobs and the GIF budget live in
   `../remotion/output-settings`: they are the same decision the on-device
   exporter makes, and keeping them in one pure module is what stops the two
   render paths from drifting. */

const FPS_CHOICES = [24, 30, 60] as const;
const MIN_STEP_DURATION_MS = 100;
const MAX_STEP_DURATION_MS = 30_000;
const DEFAULT_STEP_DURATION_MS = 1200;
const MIN_TRANSITION_MS = 100;
const MAX_TRANSITION_MS = 5_000;
const MIN_CARD_MARGIN = 16;
const MAX_CARD_MARGIN = 64;
const DEFAULT_CARD_MARGIN = 32;
/** Overflow guard for durationInFrames, above the maximum the clamps above allow. */
const MAX_TOTAL_FRAMES = 108_000;
/** Reject bodies past this; image backgrounds are data URLs up to ~4 MB, so keep it high. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;
/** Fallback painted when the requested background fails the SSRF check. */
const DEFAULT_BACKGROUND = "mesh:aurora";

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, value));
}

/** Snap fps to the nearest supported rate; a non-finite value defaults to 30. */
function clampFps(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 30;
	}
	return FPS_CHOICES.reduce((best, choice) =>
		Math.abs(choice - value) < Math.abs(best - value) ? choice : best,
	);
}

renderRoute.post(
	"/render",
	bodyLimit({
		maxSize: MAX_BODY_BYTES,
		onError: (c) => c.json({ error: "Payload too large" }, 413),
	}),
	async (c) => {
		// A body that is not JSON, or not the shape below, is the caller's mistake:
		// say so with a 400 instead of letting a TypeError surface as a 500.
		let parsed: unknown;
		try {
			parsed = await c.req.json();
		} catch {
			return c.json({ error: "Request body must be valid JSON" }, 400);
		}
		const problem = renderRequestProblem(parsed);
		if (problem) {
			return c.json({ error: problem }, 400);
		}
		const body = parsed as RenderRequestBody;
		// The title names the download and the window; a missing one is not worth a 400.
		const title = typeof body.title === "string" ? body.title : "Typelapse";
		const windowChrome = windowChromeOf(body.windowChrome ?? "macos");
		const progressStyle = progressStyleOf(body.progressStyle ?? "reels");

		const {
			language,
			theme,
			steps,
			showLineNumbers = true,
			lineNumberStart = 1,
			framePadding,
			loop = false,
			typewriter = false,
			focusZoom = false,
			sound = false,
			watermark,
		} = body;

		// Clamp every untrusted numeric before it reaches renderMedia, then let the
		// format have the last word on size and rate: a GIF asked for at 1080p60
		// comes back at 960 and 20, because that is what the format can spend its
		// bytes on. `output` is what actually gets rendered, from here on.
		const askedWidth = clampRenderDimension(body.width, 1920);
		const askedHeight = clampRenderDimension(body.height, 1080);
		const askedFps = clampFps(body.fps);
		const output = outputSettingsFor(safeFormat(body.format), askedWidth, askedHeight, askedFps);
		const { width, height, fps } = output;
		const transitionMs = clampNumber(
			body.transitionMs,
			MIN_TRANSITION_MS,
			MAX_TRANSITION_MS,
			TRANSITION_MS,
		);
		const transitionEasing = isCubicBezier(body.transitionEasing)
			? body.transitionEasing
			: DEFAULT_TRANSITION_EASING;
		const cardMargin = clampNumber(
			body.cardMargin,
			MIN_CARD_MARGIN,
			MAX_CARD_MARGIN,
			DEFAULT_CARD_MARGIN,
		);
		const fmt = output.format;
		// Clamp each step's hold; the code / focus / caption pass through untouched.
		const clampedSteps: StepData[] = steps.map((step) => ({
			...step,
			duration: clampNumber(
				step.duration,
				MIN_STEP_DURATION_MS,
				MAX_STEP_DURATION_MS,
				DEFAULT_STEP_DURATION_MS,
			),
		}));
		// SSRF guard: only known-safe backgrounds are painted server-side. Anything
		// that could make headless Chrome fetch a remote resource falls back to mesh.
		let background = body.background;
		if (typeof background !== "string" || !isSafeBackground(background)) {
			console.warn(`Rejected unsafe background, using default mesh: ${background}`);
			background = DEFAULT_BACKGROUND;
		}

		let workDir: string | null = null;
		let bundle: Awaited<ReturnType<typeof acquireBundle>> | null = null;
		try {
			const highlighter = await getHighlighter();
			const lang = resolveShikiLanguage(language);
			const shikiTheme = resolveShikiTheme(theme.name);
			await ensureLanguage(highlighter, lang);

			// The typewriter types the first scene with code, not a blank one before
			// it: the typing plan, the picture and the ticks below name that scene.
			// The frames keep each scene's own code (a blank scene shows an empty
			// window, as it always did here); only the typing borrows the typed one.
			const sceneCodes = clampedSteps.map((s) => s.code);
			const typingIndex = typingHoldIndex(sceneCodes);
			const framesPlan = buildServerMagicMovePlan(
				highlighter,
				sceneCodes,
				lang,
				shikiTheme,
				theme.background,
				loop,
				clampedSteps.map((s) => s.focus),
				clampedSteps.map((s) => s.sceneBreak === true),
			);
			const plan =
				typingIndex === 0
					? framesPlan
					: {
							...framesPlan,
							typing: buildServerMagicMovePlan(
								highlighter,
								[sceneCodes[typingIndex] ?? ""],
								lang,
								shikiTheme,
								theme.background,
								false,
								[clampedSteps[typingIndex]?.focus],
							).typing,
						};

			// Total duration = holds + a transition between each adjacent pair (+ the
			// loop-back transition when looping). Tempo is driven by `transitionMs`.
			// The final Math.min is a defensive overflow guard: the per-field clamps
			// already bound each input, so it never trips for a legitimate payload.
			const transitionFrames = Math.round((transitionMs / 1000) * fps);
			const holdFrames = clampedSteps.reduce(
				(acc, step) => acc + Math.round((step.duration / 1000) * fps),
				0,
			);
			const loopFrames = loop ? transitionFrames : 0;
			const totalFrames = Math.min(
				MAX_TOTAL_FRAMES,
				holdFrames + (clampedSteps.length - 1) * transitionFrames + loopFrames,
			);

			// Synthesized tick track: built from the same timeline numbers the preview
			// uses, spanning the full video (loop tail included). GIF carries no audio,
			// so skip it there silently.
			let audioDataUrl: string | undefined;
			if (sound && fmt !== "gif") {
				const events = collectSceneTickEvents({
					typewriter,
					sceneCodes,
					holds: clampedSteps.map((s) => s.duration),
					transitionMs,
				});
				const totalMs = (totalFrames / fps) * 1000;
				audioDataUrl = encodeWavBase64(renderTickTrack(events, totalMs), 44100);
			}

			const input: RenderInput = {
				title,
				language,
				theme,
				steps: clampedSteps,
				background,
				windowChrome,
				showLineNumbers,
				lineNumberStart,
				framePadding,
				cardMargin,
				plan,
				transitionMs,
				transitionEasing,
				loop,
				typewriter,
				typingIndex,
				focusZoom,
				progressStyle,
				watermark,
				audioDataUrl,
			};

			bundle = await acquireBundle();
			const bundleLocation = bundle.serveUrl;

			const composition = await selectComposition({
				serveUrl: bundleLocation,
				id: "Typelapse",
				inputProps: { input },
			});

			// Only the whitelisted `fmt` ever reaches the filesystem path. A private
			// directory per render, rather than a `Date.now()` name, means two renders
			// in the same millisecond cannot share a file, and a failed render's
			// partial output goes with the directory in `finally`.
			workDir = await mkdtemp(path.join(os.tmpdir(), "typelapse-render-"));
			const outputPath = path.join(workDir, `output.${fmt}`);

			await renderMedia({
				composition: {
					...composition,
					width,
					height,
					fps,
					durationInFrames: totalFrames,
				},
				serveUrl: bundleLocation,
				codec: output.codec,
				outputLocation: outputPath,
				inputProps: { input },
				crf: output.crf,
				pixelFormat: output.pixelFormat,
				colorSpace: output.colorSpace,
				imageFormat: output.imageFormat,
				jpegQuality: output.jpegQuality,
				// Nothing to hear, no audio track: a silent AAC stream lengthens the file
				// past the device export (the V2 renderer's `hasAudibleMedia` rule).
				muted: audioDataUrl === undefined,
				// A GIF's palette pass and a video's colour conversion are rewritten;
				// everything else keeps the arguments Remotion built.
				ffmpegOverride: ({ args }) =>
					output.format === "gif" ? gifFilterOverride(args) : videoColorOverride(args),
			});

			const fileBuffer = fs.readFileSync(outputPath);

			return new Response(fileBuffer, {
				headers: {
					"Content-Type": output.mimeType,
					"Content-Disposition": `attachment; filename="${exportFilename(title)}.${fmt}"`,
				},
			});
		} catch (err) {
			console.error("Render failed:", err);
			return c.json({ error: err instanceof Error ? err.message : "Render failed" }, 500);
		} finally {
			if (workDir) {
				await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
			}
			await bundle?.release().catch(() => undefined);
		}
	},
);

export { disposeSharedBundle, renderRoute };
