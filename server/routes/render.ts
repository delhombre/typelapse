import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { Hono } from "hono";
import { type BundledLanguage, type Highlighter, createHighlighter } from "shiki";
import { TRANSITION_MS } from "../../src/application/magic-move/timeline";
import { resolveShikiLanguage, resolveShikiTheme } from "../../src/infrastructure/highlighting/shiki-registry";
import { buildServerMagicMovePlan } from "../remotion/magic-move-plan";
import type { RenderInput, StepData, ThemeData } from "../remotion/types";

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

interface RenderRequest {
	title: string;
	language: string;
	theme: ThemeData;
	steps: StepData[];
	background: string;
	framePadding: number;
	width?: number;
	height?: number;
	fps?: number;
	format?: "mp4" | "webm" | "gif";
	loop?: boolean;
	typewriter?: boolean;
	progressStyle?: RenderInput["progressStyle"];
	transitionMs?: number;
	watermark?: string;
}

renderRoute.post("/render", async (c) => {
	const body = (await c.req.json()) as RenderRequest;

	const {
		title,
		language,
		theme,
		steps,
		background,
		framePadding,
		width = 1920,
		height = 1080,
		fps = 60,
		format = "mp4",
		loop = false,
		typewriter = false,
		progressStyle = "reels",
		transitionMs = TRANSITION_MS,
		watermark,
	} = body;

	if (!steps || steps.length < 2) {
		return c.json({ error: "At least 2 steps required" }, 400);
	}

	try {
		const highlighter = await getHighlighter();
		const lang = resolveShikiLanguage(language);
		const shikiTheme = resolveShikiTheme(theme.name);
		await ensureLanguage(highlighter, lang);

		const plan = buildServerMagicMovePlan(
			highlighter,
			steps.map((s) => s.code),
			lang,
			shikiTheme,
			loop,
		);

		// Total duration = holds + a transition between each adjacent pair (+ the
		// loop-back transition when looping). Tempo is driven by `transitionMs`.
		const transitionFrames = Math.round((transitionMs / 1000) * fps);
		const holdFrames = steps.reduce((acc, step) => acc + Math.round((step.duration / 1000) * fps), 0);
		const loopFrames = loop ? transitionFrames : 0;
		const totalFrames = holdFrames + (steps.length - 1) * transitionFrames + loopFrames;

		const input: RenderInput = {
			title,
			language,
			theme,
			steps,
			background,
			framePadding,
			plan,
			transitionMs,
			loop,
			typewriter,
			progressStyle,
			watermark,
		};

		const bundleLocation = await getBundle();

		const composition = await selectComposition({
			serveUrl: bundleLocation,
			id: "Typelapse",
			inputProps: { input },
		});

		const outputPath = path.join(os.tmpdir(), `typelapse-${Date.now()}.${format}`);
		const codec = format === "gif" ? "gif" : format === "webm" ? "vp8" : "h264";

		await renderMedia({
			composition: {
				...composition,
				width,
				height,
				fps,
				durationInFrames: totalFrames,
			},
			serveUrl: bundleLocation,
			codec,
			outputLocation: outputPath,
			inputProps: { input },
			crf: format === "gif" ? undefined : format === "webm" ? 20 : 18,
			pixelFormat: format === "gif" ? undefined : "yuv420p",
			imageFormat: "jpeg",
			jpegQuality: 95,
		});

		const fileBuffer = fs.readFileSync(outputPath);
		fs.unlinkSync(outputPath);

		const mimeTypes: Record<string, string> = {
			mp4: "video/mp4",
			webm: "video/webm",
			gif: "image/gif",
		};

		return new Response(fileBuffer, {
			headers: {
				"Content-Type": mimeTypes[format] ?? "application/octet-stream",
				"Content-Disposition": `attachment; filename="${title.replace(/[^a-zA-Z0-9-_]/g, "_")}.${format}"`,
			},
		});
	} catch (err) {
		console.error("Render failed:", err);
		return c.json({ error: err instanceof Error ? err.message : "Render failed" }, 500);
	}
});

export { renderRoute };
