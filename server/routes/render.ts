import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { type BundledLanguage, type Highlighter, createHighlighter } from "shiki";
import {
	collectTickEvents,
	encodeWavBase64,
	renderTickTrack,
} from "../../src/application/audio/tick-synth";
import { isSafeBackground } from "../../src/application/backgrounds/mesh-gradient";
import {
	MAX_RENDER_DIMENSION,
	MIN_RENDER_DIMENSION,
} from "../../src/domain/entities/render-config";
import { TRANSITION_MS } from "../../src/application/magic-move/timeline";
import { resolveShikiLanguage, resolveShikiTheme } from "../../src/infrastructure/highlighting/shiki-registry";
import { buildServerMagicMovePlan } from "../remotion/magic-move-plan";
import { gifFilterOverride, outputSettingsFor, safeFormat } from "../remotion/output-settings";
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

let bundlePromise: Promise<string> = createBundle().catch((err) => {
	console.error("Bundle failed:", err);
	throw err;
});

function getBundle() {
	if (isDev) {
		bundlePromise = createBundle();
	}
	return bundlePromise;
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
const MAX_STEPS = 50;
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
		const body = (await c.req.json()) as RenderRequestBody;

		const {
			title,
			language,
			theme,
			steps,
			windowChrome = "macos",
			showLineNumbers = true,
			lineNumberStart = 1,
			framePadding,
			loop = false,
			typewriter = false,
			focusZoom = false,
			sound = false,
			progressStyle = "reels",
			watermark,
		} = body;

		if (!steps || steps.length < 2) {
			return c.json({ error: "At least 2 steps required" }, 400);
		}
		if (steps.length > MAX_STEPS) {
			return c.json({ error: `Too many steps (max ${MAX_STEPS})` }, 400);
		}

		// Clamp every untrusted numeric before it reaches renderMedia, then let the
		// format have the last word on size and rate: a GIF asked for at 1080p60
		// comes back at 960 and 20, because that is what the format can spend its
		// bytes on. `output` is what actually gets rendered, from here on.
		const askedWidth = clampNumber(body.width, MIN_RENDER_DIMENSION, MAX_RENDER_DIMENSION, 1920);
		const askedHeight = clampNumber(body.height, MIN_RENDER_DIMENSION, MAX_RENDER_DIMENSION, 1080);
		const askedFps = clampFps(body.fps);
		const output = outputSettingsFor(safeFormat(body.format), askedWidth, askedHeight, askedFps);
		const { width, height, fps } = output;
		const transitionMs = clampNumber(
			body.transitionMs,
			MIN_TRANSITION_MS,
			MAX_TRANSITION_MS,
			TRANSITION_MS,
		);
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
		if (!isSafeBackground(background)) {
			console.warn(`Rejected unsafe background, using default mesh: ${background}`);
			background = DEFAULT_BACKGROUND;
		}

		try {
			const highlighter = await getHighlighter();
			const lang = resolveShikiLanguage(language);
			const shikiTheme = resolveShikiTheme(theme.name);
			await ensureLanguage(highlighter, lang);

			const plan = buildServerMagicMovePlan(
				highlighter,
				clampedSteps.map((s) => s.code),
				lang,
				shikiTheme,
				loop,
			);

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
				const events = collectTickEvents({
					typewriter,
					firstCodeLength: clampedSteps[0]?.code.length ?? 0,
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
				loop,
				typewriter,
				focusZoom,
				progressStyle,
				watermark,
				audioDataUrl,
			};

			const bundleLocation = await getBundle();

			const composition = await selectComposition({
				serveUrl: bundleLocation,
				id: "Typelapse",
				inputProps: { input },
			});

			// Only the whitelisted `fmt` ever reaches the filesystem path.
			const outputPath = path.join(os.tmpdir(), `typelapse-${Date.now()}.${fmt}`);

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
				imageFormat: output.imageFormat,
				jpegQuality: output.jpegQuality,
				// Only a GIF's palette pass is rewritten; every other codec keeps the
				// arguments Remotion built.
				ffmpegOverride:
					output.format === "gif" ? ({ args }) => gifFilterOverride(args) : undefined,
			});

			const fileBuffer = fs.readFileSync(outputPath);
			fs.unlinkSync(outputPath);

			return new Response(fileBuffer, {
				headers: {
					"Content-Type": output.mimeType,
					"Content-Disposition": `attachment; filename="${title.replace(/[^a-zA-Z0-9-_]/g, "_")}.${fmt}"`,
				},
			});
		} catch (err) {
			console.error("Render failed:", err);
			return c.json({ error: err instanceof Error ? err.message : "Render failed" }, 500);
		}
	},
);

export { renderRoute };
