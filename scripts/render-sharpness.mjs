/**
 * Renders the landing's sharpness proof, from the project committed next to it.
 *
 *   pnpm sharpness:render     # writes docs/sharpness/{av1-444,h264-420}.png and sharpness.json
 *
 * The landing says the WebM keeps every colour sample on a line of code and the
 * MP4 does not. A claim like that is only worth making if anybody can re-run it,
 * so the two crops on the page are not screenshots: this script exports
 * `docs/sharpness/sharpness.project.json` twice through the studio's own
 * on-device export (the painter, WebCodecs, mediabunny), once as WebM and once
 * as MP4, decodes the same frame out of each file, crops it to one dense line of
 * coloured glyphs and scores it against the painter's own lossless frame. The
 * numbers the section prints are read from the manifest this writes, so the
 * page cannot drift from the files.
 *
 * Both files come from the same painter on purpose. The server render would
 * have been a second renderer in the comparison, and then a difference between
 * the crops could be the renderer rather than the chroma. Here the codec is the
 * only thing that changes.
 *
 * How it drives the export: a Vite dev server with no HMR and no watcher (the
 * repository is shared with other work, and a reload mid-render would export
 * half a project), a headless Chromium on `/app`, and the studio's stores
 * imported by the same module URLs the studio itself loaded. The project goes
 * in through `importFromJson`, the button press is `exportVideo()`, and the file
 * comes out of the browser's download, exactly as a user's would.
 *
 * Needs ffmpeg and ffprobe on PATH, and a Chromium with WebCodecs. Playwright is
 * not a dependency of this project, so it is borrowed like
 * `scripts/shoot-landing.mjs` does:
 *   PLAYWRIGHT_CORE=/path/to/playwright-core  CHROMIUM_BIN=/path/to/chrome  SHARPNESS_PORT=5215
 * and SHARPNESS_KEEP=1 to keep the two videos and the reference frame in the
 * temporary folder it prints, rather than deleting them.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "docs/sharpness");
const PROJECT = resolve(OUT_DIR, "sharpness.project.json");
const MANIFEST = resolve(OUT_DIR, "sharpness.json");
const PORT = Number(process.env.SHARPNESS_PORT ?? 5215);

/** The frame rate the encoder comments in `video-encoding.ts` were measured at. */
const FPS = 60;

/**
 * Which frame is compared, and which part of it.
 *
 * The middle of the hold, so neither file is judged on its first keyframe alone.
 * The crop is `export async fu` on line 1 of the payload, in the frame's own
 * pixels: a run of thin red keyword strokes on the dark card, the worst case
 * for 4:2:0 and the one a visitor reads at a glance (the earlier crop mixed
 * orange, red and violet, and at the page's enlargement the two files looked
 * alike). It sits inside the opaque card, where nothing moves between frame 0
 * and this one, which is what lets the painter's first frame stand as the
 * lossless reference (the mesh around the card does move, so a crop that
 * reached it would be scored against the wrong instant).
 */
const FRAME = 45;
const CROP = { x: 276, y: 486, width: 288, height: 48 };

/**
 * The difference maps: each file's crop against the reference, as grey, with
 * the error multiplied so a viewer sees where the colour went. The same gain
 * for both files, so the darker map is the closer file, never a tuned picture.
 */
const DIFF_GAIN = 10;

const RUNGS = [
	{ format: "webm", file: "av1-444.png", codec: "av1", pixFmt: "yuv444p", label: "AV1 4:4:4" },
	{ format: "mp4", file: "h264-420.png", codec: "h264", pixFmt: "yuv420p", label: "H.264 4:2:0" },
];

async function main() {
	const payload = readFileSync(PROJECT, "utf8");
	const work = mkdtempSync(join(tmpdir(), "typelapse-sharpness-"));
	const { createServer } = await import("vite");
	const server = await createServer({
		configFile: resolve(ROOT, "vite.config.ts"),
		root: ROOT,
		logLevel: "warn",
		server: { port: PORT, strictPort: true, hmr: false, watch: null },
	});
	await server.listen();
	const browser = await launchChromium();
	try {
		const page = await browser.newPage({ acceptDownloads: true });
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(`http://localhost:${PORT}/app`, { waitUntil: "load" });
		await page.waitForFunction(
			async () => {
				const { useSnippetStore } = await import("/src/presentation/stores/snippet.store.ts");
				return useSnippetStore.getState().plan !== null;
			},
			null,
			{ timeout: 60_000, polling: 250 },
		);
		await page.evaluate(importProject, payload);

		const reference = join(work, "reference.png");
		writeFileSync(reference, Buffer.from(await page.evaluate(paintReference), "base64"));

		const results = [];
		for (const rung of RUNGS) {
			const video = join(work, `sharpness.${rung.format}`);
			const [download] = await Promise.all([
				page.waitForEvent("download", { timeout: 180_000 }),
				page.evaluate(exportOnDevice, { format: rung.format, fps: FPS }),
			]);
			await download.saveAs(video);
			results.push({ rung, video });
		}
		if (errors.length > 0) {
			throw new Error(`The studio threw while exporting:\n${errors.join("\n")}`);
		}

		const manifest = measure(results, reference, work, browser.version());
		writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, "\t")}\n`);
		for (const entry of manifest.files) {
			console.log(
				`  ${entry.label.padEnd(12)} ${entry.codecName} ${entry.pixFmt}  ${(entry.bytes / 1e6).toFixed(2)} MB  ${entry.psnr.toFixed(2)} dB on the glyph line → docs/sharpness/${entry.crop}`,
			);
		}
	} finally {
		await browser.close();
		await server.close();
		if (process.env.SHARPNESS_KEEP) {
			console.log(`  kept ${work}`);
		} else {
			rmSync(work, { recursive: true, force: true });
		}
	}
}

/* ── In the page ─────────────────────────────────────────────────────────── */

/** The studio's own "import JSON", then a wait for the plan it rebuilds. */
async function importProject(json) {
	const { useSnippetStore } = await import("/src/presentation/stores/snippet.store.ts");
	useSnippetStore.getState().importFromJson(json);
	const started = performance.now();
	while (useSnippetStore.getState().isBuilding || useSnippetStore.getState().plan === null) {
		if (performance.now() - started > 30_000) {
			throw new Error("The plan never rebuilt after the import.");
		}
		await new Promise((r) => setTimeout(r, 50));
	}
}

/**
 * The painter's lossless frame, as base64 PNG.
 *
 * Painted by the adapter the export uses, from the same snippet and look, so the
 * reference is the picture the encoder was handed rather than a picture of the
 * preview.
 */
async function paintReference() {
	const { useSnippetStore } = await import("/src/presentation/stores/snippet.store.ts");
	const { useExportStore } = await import("/src/presentation/stores/export.store.ts");
	const { WebCodecsRendererAdapter } = await import(
		"/src/infrastructure/export/webcodecs-renderer.adapter.ts"
	);
	const s = useSnippetStore.getState();
	const e = useExportStore.getState();
	const adapter = new WebCodecsRendererAdapter({
		plan: s.plan,
		background: s.background,
		chrome: s.windowChrome,
		padding: s.framePadding,
		cardMargin: s.cardMargin,
		showLineNumbers: s.showLineNumbers,
		lineNumberStart: s.lineNumberStart,
		transitionMs: e.transitionMs,
		transitionEasing: e.transitionEasing,
		loop: false,
		typewriter: e.typewriter,
		focusZoom: e.focusZoom,
		progress: null,
		watermark: null,
	});
	const snippet = s.snippet;
	const config = { ...snippet.renderConfig, width: e.width, height: e.height, fps: e.fps };
	const dataUrl = await adapter.renderPreview({ ...snippet, renderConfig: config });
	return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** The export panel's button, on this device, in one format. */
async function exportOnDevice({ format, fps }) {
	const { useExportStore } = await import("/src/presentation/stores/export.store.ts");
	const store = useExportStore.getState();
	store.setTarget("device");
	store.setLoop(false);
	store.setFormat(format);
	store.setFps(fps);
	await useExportStore.getState().exportVideo();
	const { outcome } = useExportStore.getState();
	if (outcome?.kind !== "done" || outcome.target !== "device") {
		throw new Error(
			`The ${format} export did not finish on this device: ${JSON.stringify(outcome)}`,
		);
	}
	return outcome.note ?? null;
}

/* ── Back in Node ────────────────────────────────────────────────────────── */

function measure(results, reference, work, browserVersion) {
	const files = results.map(({ rung, video }) => {
		const probe = ffprobe(video);
		// The file has to be what the label says, or the comparison is a lie told
		// with real numbers: a machine without AV1 High would have handed back
		// AV1 Main, 4:2:0, under the same button.
		// yuvj420p is the same 4:2:0 subsampling at full range, which some
		// Chromium builds hand back for H.264: the chroma is what is compared.
		if (probe.codec_name !== rung.codec || probe.pix_fmt.replace(/^yuvj/, "yuv") !== rung.pixFmt) {
			throw new Error(
				`${rung.format} came back ${probe.codec_name} ${probe.pix_fmt}, not ${rung.codec} ${rung.pixFmt}.`,
			);
		}
		const frame = join(work, `${rung.format}-frame.png`);
		ffmpeg([
			"-i",
			video,
			"-vf",
			`select=eq(n\\,${FRAME})`,
			"-frames:v",
			"1",
			"-pix_fmt",
			"rgb24",
			frame,
		]);
		const crop = resolve(OUT_DIR, rung.file);
		ffmpeg(["-i", frame, "-vf", cropFilter(), "-frames:v", "1", "-pix_fmt", "rgb24", crop]);
		const diff = resolve(OUT_DIR, rung.file.replace(/\.png$/, "-diff.png"));
		ffmpeg([
			"-i",
			reference,
			"-i",
			frame,
			"-filter_complex",
			`[0:v]${cropFilter()},format=rgb24[a];[1:v]${cropFilter()},format=rgb24[b];[a][b]blend=all_mode=difference,format=gray,lut=c0='min(val*${DIFF_GAIN},255)'`,
			"-frames:v",
			"1",
			diff,
		]);
		return {
			label: rung.label,
			format: rung.format,
			codecName: probe.codec_name,
			profile: probe.profile,
			pixFmt: probe.pix_fmt,
			width: Number(probe.width),
			height: Number(probe.height),
			bytes: readFileSync(video).length,
			frames: frameCount(video),
			psnr: psnr(reference, frame),
			crop: rung.file,
			diff: rung.file.replace(/\.png$/, "-diff.png"),
		};
	});
	return {
		project: "sharpness.project.json",
		fps: FPS,
		frame: FRAME,
		crop: CROP,
		diffGain: DIFF_GAIN,
		measuredIn: "RGB, against the painter's lossless frame, on the cropped glyph line",
		// Which encoder made the files: AV1 High is a property of the browser, and
		// the landing says where these were made rather than implying every
		// browser makes them.
		browser: `Chromium ${browserVersion.split(".")[0]}`,
		platform:
			{ darwin: "macOS", win32: "Windows", linux: "Linux" }[process.platform] ?? process.platform,
		files,
	};
}

function cropFilter() {
	return `crop=${CROP.width}:${CROP.height}:${CROP.x}:${CROP.y}`;
}

/** PSNR over the glyph line, in RGB: the space a viewer sees, not the one the file stores. */
function psnr(reference, decoded) {
	const crop = cropFilter();
	const log = ffmpeg(
		[
			"-i",
			reference,
			"-i",
			decoded,
			"-lavfi",
			`[0:v]${crop},format=rgb24[a];[1:v]${crop},format=rgb24[b];[a][b]psnr`,
			"-f",
			"null",
			"-",
		],
		true,
	);
	const value = log.match(/average:([\d.]+|inf)/)?.[1];
	if (!value) {
		throw new Error(`ffmpeg reported no PSNR:\n${log}`);
	}
	return Math.round(Number(value) * 100) / 100;
}

/** Decoded, not read from the header: a WebM header does not carry the count. */
function frameCount(file) {
	const out = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-count_frames",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=nb_read_frames",
			"-of",
			"csv=p=0",
			file,
		],
		{ encoding: "utf8" },
	);
	return Number(out.trim());
}

function ffprobe(file) {
	const out = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=codec_name,profile,pix_fmt,width,height",
			"-of",
			"json",
			file,
		],
		{ encoding: "utf8" },
	);
	return JSON.parse(out).streams[0];
}

/** ffmpeg, quietly; returns stderr, which is where its filters report. */
function ffmpeg(args, wantLog = false) {
	const full = ["-hide_banner", "-y", "-loglevel", wantLog ? "info" : "error", ...args];
	const run = spawnSync("ffmpeg", full, { encoding: "utf8" });
	if (run.status !== 0) {
		throw new Error(`ffmpeg ${args.join(" ")} failed:\n${run.stderr}`);
	}
	return run.stderr;
}

async function launchChromium() {
	const require = createRequire(import.meta.url);
	const { chromium } = require(playwrightCore(require));
	if (process.env.CHROMIUM_BIN) {
		return chromium.launch({ executablePath: process.env.CHROMIUM_BIN });
	}
	// The borrowed playwright-core asks for its own browser build, which is often
	// not the one this machine downloaded. Any headless shell already in the
	// cache will do, and so will an installed Chrome: all this needs is WebCodecs.
	const cache = join(homedir(), "Library/Caches/ms-playwright");
	const shells = existsSync(cache)
		? readdirSync(cache)
				.filter((name) => name.startsWith("chromium_headless_shell-"))
				.sort()
				.reverse()
				.map((name) => join(cache, name, "chrome-headless-shell-mac-arm64/chrome-headless-shell"))
				.filter((path) => existsSync(path))
		: [];
	const attempts = [
		undefined,
		...shells.map((executablePath) => ({ executablePath })),
		{ channel: "chrome" },
	];
	let lastError;
	for (const options of attempts) {
		try {
			return await chromium.launch(options);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

/** Where to borrow playwright-core from: the env, the project, or an npx cache. */
function playwrightCore(require) {
	if (process.env.PLAYWRIGHT_CORE) {
		return process.env.PLAYWRIGHT_CORE;
	}
	try {
		return require.resolve("playwright-core");
	} catch {
		const cache = join(homedir(), ".npm/_npx");
		const found = existsSync(cache)
			? readdirSync(cache)
					.map((hash) => join(cache, hash, "node_modules/playwright-core"))
					.find((path) => existsSync(path))
			: undefined;
		if (!found) {
			throw new Error("playwright-core not found; set PLAYWRIGHT_CORE to an install of it.");
		}
		return found;
	}
}

await main();
process.exit(0);
