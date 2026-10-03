/**
 * Renders the README's demo, from the payload committed next to it.
 *
 *   pnpm demo:render          # writes docs/demo.gif
 *   pnpm demo:render --mp4    # also writes docs/demo.mp4 (reference, not committed)
 *
 * The asset in the README used to be a one-off: no script, no payload, no way to
 * reproduce it, and therefore no way to fix it. This is the missing half. The
 * project is `docs/demo.project.json` — the SAME file format the studio's "export
 * JSON" writes and `importFromJson` reads — and the render goes through the real
 * `POST /api/render` handler, so the demo is a plain Typelapse export and the
 * README's claim about itself stays true.
 *
 * Run under tsx (`pnpm demo:render`), which is what lets a script import the
 * app's own theme table and focus parser instead of restating them.
 *
 * ── Why a GIF, still ────────────────────────────────────────────────────────
 * GIF is the worst video format available and the only one that works here. A
 * README is rendered by GitHub's HTML sanitizer: an `<img>` autoplays and loops
 * a GIF with no controls and no click, which is exactly the behaviour a product
 * shot needs. The alternatives all lose something that matters more than bytes:
 *   - `<video>` renders on github.com, but needs `muted autoplay playsinline`,
 *     is stripped by npm, GitLab mirrors and most README readers, and shows a
 *     player instead of a picture.
 *   - Animated WebP and APNG are smaller and full-colour, but they travel
 *     through Camo (GitHub's image proxy), which is not a guarantee anyone
 *     should hang a landing asset on.
 * So: GIF, and the honest response to its cost is to spend its bytes well —
 * which is the same conclusion `gif-quality.ts` reached for user exports, and
 * why this script does nothing special to get there. Everything that makes this
 * file half the size it was lives in `server/remotion/output-settings.ts`, where
 * every server render gets it.
 *
 * ── Why these dimensions ────────────────────────────────────────────────────
 * The project renders at exactly DEMO_DISPLAY_WIDTH, the width the README's
 * `<img>` asks for, and `assertRetinaPair` refuses anything that is not a whole
 * multiple of it. That is the bug this whole file exists to close: the old asset
 * was 800 px shown at 720, which no display can draw without resampling — a
 * 0.9x squeeze on a normal screen, a 1.8x stretch on a Retina one — and soft
 * text was the result.
 *
 * 2x would be sharper again, and it is not affordable here. A GIF of an animated
 * mesh gradient costs about 0.17 bytes per pixel per frame after the palette fix
 * (measured, this demo), so doubling both axes quadruples the file: this 7.7 MB
 * asset becomes 30 MB. Halving the display width instead buys the 2x back for
 * free, but at 360 CSS px the code is 7 px tall and the demo stops demonstrating
 * anything. 1x at a readable size is the trade that survives both constraints.
 *
 * ── Why `loop` is set here and not in the payload ───────────────────────────
 * A README GIF plays forever; the last-to-first morph is what keeps the restart
 * from being a hard cut. The project file format has no `loop` field (it is a
 * render option, owned by the export panel), so the one caller that always wants
 * it says so.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { focusLineSet, parseLineRanges } from "../src/application/focus/line-ranges.ts";
import { THEMES } from "../src/presentation/components/controls/control-presets.ts";

/* The render route rebuilds its Remotion bundle on every request in dev, which
   for a one-shot script means bundling the composition twice for one file. Set
   before the route is loaded, hence the dynamic import: `isDev` is read once, at
   module scope. */
process.env.NODE_ENV ??= "production";
const { disposeSharedBundle, renderRoute } = await import("../server/routes/render.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = resolve(ROOT, "docs/demo.project.json");
const OUT_DIR = resolve(ROOT, "docs");

/** The width the README's `<img>` asks for. Keep the two in step, or the blur returns. */
const DEMO_DISPLAY_WIDTH = 720;

/** Frame rate asked for. The GIF path caps it at GIF_MAX_FPS; the mp4 keeps it. */
const DEMO_FPS = 30;

async function main() {
	const wantsMp4 = process.argv.includes("--mp4");
	const payload = JSON.parse(await readFile(PROJECT, "utf8"));

	assertRetinaPair(payload.width, DEMO_DISPLAY_WIDTH);

	if (!existsSync(OUT_DIR)) {
		mkdirSync(OUT_DIR, { recursive: true });
	}

	const targets = wantsMp4 ? ["gif", "mp4"] : ["gif"];
	for (const format of targets) {
		const startedAt = Date.now();
		console.log(`\nRendering docs/demo.${format} …`);
		const bytes = await render(payload, format);
		const file = resolve(OUT_DIR, `demo.${format}`);
		writeFileSync(file, bytes);
		const measured = report(file, bytes.length, Date.now() - startedAt);
		// The route is free to bring a GIF inside its own budget, so believe the
		// file rather than the request: a silent downscale here is the blur coming
		// back, and it should stop the script instead of reaching the README.
		// Height too: a clamp that kept the width but not the aspect would pass a
		// width-only check and still squash the frame.
		if (measured && (measured.width !== payload.width || measured.height !== payload.height)) {
			throw new Error(
				`demo.${format} came back ${measured.width}×${measured.height}, not ${payload.width}×${payload.height}. The renderer clamped it; pick a size it will keep.`,
			);
		}
	}
}

/**
 * Drive the real render handler in process.
 *
 * `renderRoute` is the Hono app mounted at `/api` by the server, and Hono apps
 * answer `request()` directly — so this is the shipped route, its clamps and its
 * Remotion bundle, without a port to pick or a process to babysit.
 */
async function render(payload, format) {
	const response = await renderRoute.request("/render", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(renderRequestBody(payload, format)),
	});
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(`Render failed (${response.status}): ${detail}`);
	}
	return Buffer.from(await response.arrayBuffer());
}

/** Project file → the exact JSON body the studio's export panel POSTs. */
function renderRequestBody(payload, format) {
	return {
		title: payload.title,
		language: payload.language,
		theme: themeData(payload),
		steps: payload.steps.map((step) => {
			const focus = [...focusLineSet(parseLineRanges(step.focus ?? "") ?? [])];
			return {
				code: step.code,
				duration: step.duration,
				focus: focus.length > 0 ? focus : undefined,
				caption: step.caption || undefined,
			};
		}),
		background: payload.background,
		windowChrome: payload.windowChrome ?? "macos",
		showLineNumbers: payload.showLineNumbers ?? true,
		lineNumberStart: payload.lineNumberStart ?? 1,
		framePadding: payload.framePadding ?? 24,
		cardMargin: payload.cardMargin ?? 32,
		width: payload.width,
		height: payload.height,
		fps: DEMO_FPS,
		format,
		loop: true,
		typewriter: payload.typewriter ?? false,
		focusZoom: payload.focusZoom ?? false,
		// GIF carries no audio track and the README is watched muted regardless.
		sound: false,
		progressStyle: payload.progressStyle ?? "reels",
		transitionMs: payload.transitionMs ?? 650,
		watermark: payload.watermark || undefined,
	};
}

/** Resolve `themeName` through the studio's own theme table, then the two fields it edits in place. */
function themeData(payload) {
	const preset = THEMES.find((entry) => entry.name === payload.themeName);
	if (!preset) {
		throw new Error(`Unknown theme '${payload.themeName}' in ${PROJECT}`);
	}
	const theme = preset.factory();
	return {
		name: theme.name,
		background: theme.background,
		foreground: theme.foreground,
		fontFamily: payload.fontFamily ?? theme.fontFamily,
		fontSize: theme.fontSize,
		borderRadius: payload.borderRadius ?? theme.borderRadius,
	};
}

/**
 * Fail loudly on the exact mistake this script exists to undo: an asset whose
 * pixel width is not a whole multiple of the width the README displays it at.
 */
function assertRetinaPair(assetWidth, displayWidth) {
	const ratio = assetWidth / displayWidth;
	if (ratio !== 1 && ratio !== 2) {
		throw new Error(
			`docs/demo.project.json renders ${assetWidth}px wide but the README displays ${displayWidth}px ` +
				`(${ratio.toFixed(2)}x). Use exactly 1x or 2x, or the browser resamples it.`,
		);
	}
}

/** Measure what was actually produced, rather than what was asked for. */
function report(file, bytes, elapsedMs) {
	const megabytes = (bytes / 1024 / 1024).toFixed(2);
	const where = file.slice(ROOT.length + 1);
	const took = `${(elapsedMs / 1000).toFixed(1)}s`;
	const probe = ffprobe(file);
	if (!probe) {
		// The size check is the whole point of this script, so it cannot depend
		// on a tool that may be absent. A GIF says its own size in its header;
		// anything else without ffprobe is a render nobody measured.
		const header = gifHeaderSize(file);
		if (!header) {
			throw new Error(
				`ffprobe is not on PATH and ${where} is not a GIF, so its size cannot be verified. Install ffmpeg or render the GIF alone.`,
			);
		}
		console.log(
			`  ${header.width}×${header.height}  ${megabytes} MB  ${took} → ${where}  (from the GIF header; ffprobe not on PATH)`,
		);
		return header;
	}
	const [width, height, rate, frames] = probe;
	const [num, den] = rate.split("/").map(Number);
	const fps = (num / den).toFixed(2);
	const factor = (Number(width) / DEMO_DISPLAY_WIDTH).toFixed(0);
	console.log(`  ${width}×${height}  ${fps} fps  ${frames} frames  ${megabytes} MB`);
	console.log(`  shown at ${DEMO_DISPLAY_WIDTH}px → ${factor}x   ${took} → ${where}`);
	return { width: Number(width), height: Number(height) };
}

/** A GIF's logical screen size, from bytes 6..9 of its own header; null for any other file. */
function gifHeaderSize(file) {
	const bytes = readFileSync(file);
	if (bytes.length < 10 || bytes.subarray(0, 3).toString("ascii") !== "GIF") {
		return null;
	}
	return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

/** The four numbers that say what a file really is, or null when ffprobe is absent. */
function ffprobe(file) {
	const args = [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=width,height,nb_frames,avg_frame_rate",
		"-of",
		"default=nw=1:nk=1",
		file,
	];
	try {
		const lines = execFileSync("ffprobe", args, { encoding: "utf8" }).trim().split("\n");
		return lines.length === 4 ? lines : null;
	} catch {
		return null;
	}
}

// The bundle is ~21 MB in the OS temp dir and nothing else will ever remove it.
try {
	await main();
} finally {
	await disposeSharedBundle();
}
process.exit(0);
