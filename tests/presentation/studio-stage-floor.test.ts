import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	SHELL_SQUEEZE_FROM,
	SHELL_SQUEEZE_RANGE,
	SHORT_WINDOW_MAX_HEIGHT,
	STAGE_BANDS,
	STAGE_FLOOR_HEIGHT,
	shellMinHeightAt,
	stageSqueezeVars,
} from "@/application/layout/scene-stage";
import { describe, expect, it } from "vitest";

/* #204 (D4): below a stage height the desktop shell scrolls instead of fitting
   the picture into what the window leaves. The browser proof is
   tests/e2e/studio-shell.spec.ts; this holds the wiring a drive-by edit would cut:
   the floor the shell is given, the minimum height built from it, and the
   padding the stage slot shares with that minimum, so the short-window rules
   (which change the timeline and the padding) move the minimum with them. */

const camera = readFileSync(resolve(__dirname, "../../src/presentation/studio-camera.css"), "utf8");
const shell = readFileSync(
	resolve(__dirname, "../../src/presentation/components/layout/scene-shell.tsx"),
	"utf8",
);

/** The declarations of the first rule written for exactly this selector. */
function declarationsOf(selector: string): string {
	const start = camera.indexOf(`${selector} {`);
	expect(start, `a rule for ${selector}`).toBeGreaterThanOrEqual(0);
	return camera.slice(camera.indexOf("{", start) + 1, camera.indexOf("}", start));
}

describe("the desktop shell's stage floor", () => {
	it("hands the shell the floor from the layout module, not a number of its own", () => {
		expect(shell).toContain("STAGE_FLOOR_HEIGHT");
		expect(shell).toMatch(/"--sc-stage-floor":\s*`\$\{STAGE_FLOOR_HEIGHT\}px`/);
		expect(shell).toContain("...stageSqueezeVars()");
	});

	it("is as tall as the window or as the stage, the timeline and the header need, whichever is more", () => {
		const shellRule = declarationsOf(".studio-camera-root.sc-root");

		expect(shellRule).toMatch(/height:\s*max\(100dvh,\s*var\(--camera-shell-min-height\)\)/);
	});

	it("builds that minimum from the floor and every band the shell stacks around it", () => {
		const rule = declarationsOf(".studio-camera-root");
		const minimum = rule.slice(rule.indexOf("--camera-shell-min-height"));

		for (const part of [
			"--camera-header",
			"--camera-stage-pad-top",
			"--camera-stage-pad-bottom",
			"--camera-frame-inset",
			"--sc-stage-floor",
			"--camera-timeline-height",
			"--camera-timeline-bottom",
		]) {
			expect(minimum, part).toMatch(new RegExp(`var\\(${part}[,)]`));
		}
	});

	it("pads the stage slot with the same variables the minimum counts", () => {
		const slot = declarationsOf(".studio-camera-root .sc-stage-slot");

		expect(slot).toContain("var(--camera-stage-pad-top)");
		expect(slot).toContain("var(--camera-stage-pad-bottom)");
	});

	it("lets the short-window rule squeeze the bands with the window, through variables, not the slot", () => {
		const short = camera.slice(camera.indexOf("@media (max-height: 760px)"));
		const block = short.slice(0, short.indexOf("@media (prefers-reduced-motion"));

		expect(block).toMatch(
			/--camera-squeeze:\s*clamp\(\s*0px,\s*calc\(100dvh - var\(--sc-squeeze-start\)\),\s*var\(--sc-squeeze-range\)\s*\)/,
		);
		for (const [band, name] of [
			["--camera-stage-pad-top", "pad-top"],
			["--camera-stage-pad-bottom", "pad-bottom"],
			["--camera-frame-inset", "frame-inset"],
		] as const) {
			expect(block, band).toMatch(
				new RegExp(
					`${band}:\\s*calc\\(\\s*var\\(--sc-${name}-squeezed\\)\\s*\\+\\s*var\\(--camera-squeeze\\)\\s*\\*\\s*var\\(--sc-${name}-slope\\)\\s*\\)`,
				),
			);
		}
		expect(block).not.toMatch(/\.sc-stage-slot\s*{[^}]*padding-(top|bottom)/);
	});

	it("lets the preview take its inset around the picture from the shell, as 2rem anywhere else", () => {
		const preview = readFileSync(
			resolve(__dirname, "../../src/presentation/components/preview/live-preview.tsx"),
			"utf8",
		);

		expect(preview).toContain("p-[var(--camera-frame-inset,2rem)]");
	});

	// The model in scene-stage.ts stands in for the stylesheet's arithmetic in the
	// layout tests, so its fixed numbers are held to the stylesheet's.
	it("states the shell's fixed bands as the stylesheet does, so the layout model is the real layout", () => {
		const px = (rule: string, property: string) => {
			const found = rule.match(new RegExp(`${property}:\\s*(\\d+)px`));
			expect(found, property).not.toBeNull();
			return Number(found?.[1]);
		};
		const root = declarationsOf(".studio-camera-root");
		const short = camera.slice(camera.indexOf("@media (max-height: 760px)"));
		const shortRoot = short.slice(0, short.indexOf("}"));
		const stack = (rule: string, timeline: string) =>
			px(root, "--camera-header") + px(root, "--camera-timeline-bottom") + 8 + px(rule, timeline);

		expect(SHORT_WINDOW_MAX_HEIGHT).toBe(760);
		expect(shellMinHeightAt(SHORT_WINDOW_MAX_HEIGHT + 1)).toBe(
			stack(root, "--camera-timeline-height") +
				px(root, "--camera-stage-pad-top") +
				px(root, "--camera-stage-pad-bottom") +
				2 * px(root, "--camera-frame-inset") +
				STAGE_FLOOR_HEIGHT,
		);
		expect(shellMinHeightAt(SHORT_WINDOW_MAX_HEIGHT)).toBe(
			stack(shortRoot, "--camera-timeline-height") +
				STAGE_BANDS.padTop.comfortable +
				STAGE_BANDS.padBottom.comfortable +
				2 * STAGE_BANDS.frameInset.comfortable +
				STAGE_FLOOR_HEIGHT,
		);
	});

	it("hands the stylesheet each band's squeezed size and its slope per px of squeeze", () => {
		const vars = stageSqueezeVars();

		expect(vars["--sc-squeeze-start"]).toBe(`${SHELL_SQUEEZE_FROM}px`);
		expect(vars["--sc-squeeze-range"]).toBe(`${SHELL_SQUEEZE_RANGE}px`);
		expect(vars["--sc-pad-top-squeezed"]).toBe("0px");
		expect(vars["--sc-pad-top-slope"]).toBe("0.1");
		expect(vars["--sc-pad-bottom-squeezed"]).toBe("40px");
		expect(vars["--sc-pad-bottom-slope"]).toBe("0.2");
		expect(vars["--sc-frame-inset-squeezed"]).toBe("16px");
		expect(vars["--sc-frame-inset-slope"]).toBe("0.16");
	});
});
