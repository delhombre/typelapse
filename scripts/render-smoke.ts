/**
 * Renders one two-second clip through the Remotion path and measures the file.
 *
 *   pnpm render:smoke
 *
 * Why it exists: since #227 every Remotion render on main failed ("Can't resolve
 * '@/application/layout/canvas-fit'": Remotion's webpack does not know tsconfig's
 * `@/` alias), while Vitest, `tsc` and `vite build` stayed green. Only a render
 * finds that, so the verify gate runs this one.
 *
 * The render is the shipped one: `renderProject` drives the real `POST /render`
 * handler in process, the same route, clamps and `bundle()` of
 * `server/remotion/root.tsx` that production uses (the demo script and the CLI
 * go through it too). Nothing here bundles or renders by hand, so there is no
 * second path to drift from the first.
 *
 * Prints one line on success (the file, then ffprobe's length, size, codec and
 * resolution) and exits 1 with the reason on anything else. The file stays in the
 * OS temp dir so a report can name it.
 *
 * ffprobe: the system one when there is one, else the one Remotion ships
 * (`remotion ffprobe`), which is the only one in the container image.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { disposeRenderer, renderProject } from "../cli/render-project.ts";
import { SMOKE, judgeClip, parseProbe, smokeProject, summaryLine } from "../cli/render-smoke.ts";
import { TEMPLATE_CATALOG } from "../src/application/templates/catalog.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PROBE_ARGS = [
	"-v",
	"error",
	"-show_entries",
	"format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames",
	"-of",
	"json",
];

function ffprobe(file: string): string {
	try {
		return execFileSync("ffprobe", [...PROBE_ARGS, file], { encoding: "utf8" });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
	return execFileSync("pnpm", ["exec", "remotion", "ffprobe", ...PROBE_ARGS, file], {
		cwd: ROOT,
		encoding: "utf8",
	});
}

async function main(): Promise<void> {
	const startedAt = Date.now();
	const bytes = await renderProject(smokeProject(TEMPLATE_CATALOG), {
		format: "mp4",
		fps: SMOKE.fps,
		loop: false,
	});
	const renderMs = Date.now() - startedAt;

	const file = join(mkdtempSync(join(tmpdir(), "typelapse-smoke-")), "smoke.mp4");
	writeFileSync(file, bytes);
	if (statSync(file).size === 0) {
		throw new Error(`the render wrote an empty file: ${file}`);
	}

	const clip = parseProbe(ffprobe(file), file);
	const problems = judgeClip(clip);
	if (problems.length > 0) {
		throw new Error(`${file} is not the clip that was asked for: ${problems.join("; ")}`);
	}
	console.log(summaryLine(clip, renderMs));
}

// The shared bundle is ~21 MB in the OS temp dir and nothing else will remove it.
let failure: unknown = null;
try {
	await main();
} catch (error) {
	failure = error;
} finally {
	await disposeRenderer();
}
if (failure) {
	const message = failure instanceof Error ? failure.message : String(failure);
	console.error(`render-smoke FAILED: ${message}`);
	process.exit(1);
}
process.exit(0);
