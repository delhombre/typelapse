import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { Hono } from "hono";
import { createHighlighter } from "shiki";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { RenderInput, StepData, ThemeData } from "../remotion/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const renderRoute = new Hono();

/** Map Typelapse theme names to Shiki theme IDs */
const THEME_MAP: Record<string, string> = {
	midnight: "github-dark",
	aurora: "aurora-x",
	frost: "github-light",
};

/** Lazily create and cache the Shiki highlighter */
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ["github-dark", "aurora-x", "github-light"],
			langs: ["typescript", "javascript", "python", "rust", "go", "html", "css", "json"],
		});
	}
	return highlighterPromise;
}

const isDev = process.env.NODE_ENV !== "production";

/** Bundle the Remotion composition */
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

// In dev: re-bundle every render (picks up file changes without restart)
// In prod: bundle once at startup
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
	} = body;

	if (!steps || steps.length < 2) {
		return c.json({ error: "At least 2 steps required" }, 400);
	}

	try {
		// Step 1: Highlight all steps with Shiki
		const highlighter = await getHighlighter();
		const shikiTheme = THEME_MAP[theme.name] ?? "github-dark";

		const stepHtmlFrames = await Promise.all(
			steps.map((step) =>
				highlighter.codeToHtml(step.code, { lang: language, theme: shikiTheme }),
			),
		);

		// Step 2: Compute total duration in frames
		// Must match TRANSITION_DURATION_S in composition.tsx (0.8s)
		const TRANSITION_DURATION_S = 0.8;
		const transitionFrames = Math.round(TRANSITION_DURATION_S * fps);
		const totalFrames =
			steps.reduce((acc, step) => acc + Math.round((step.duration / 1000) * fps), 0) +
			(steps.length - 1) * transitionFrames;

		const input: RenderInput = {
			title,
			language,
			theme,
			steps,
			background,
			framePadding,
			stepHtmlFrames,
		};

		// Step 3: Get the Remotion bundle (re-bundles in dev mode)
		const bundleLocation = await getBundle();

		// Step 4: Select composition & render
		const composition = await selectComposition({
			serveUrl: bundleLocation,
			id: "Typelapse",
			inputProps: { input },
		});

		const outputPath = path.join(os.tmpdir(), `typelapse-${Date.now()}.${format}`);

		await renderMedia({
			composition: {
				...composition,
				width,
				height,
				fps,
				durationInFrames: totalFrames,
			},
			serveUrl: bundleLocation,
			codec: format === "gif" ? "gif" : format === "webm" ? "vp8" : "h264",
			outputLocation: outputPath,
			inputProps: { input },
		});

		// Step 5: Stream file back and clean up
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
		return c.json(
			{ error: err instanceof Error ? err.message : "Render failed" },
			500,
		);
	}
});

export { renderRoute };
