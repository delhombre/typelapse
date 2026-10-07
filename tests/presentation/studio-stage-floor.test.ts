import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

	it("lets the short-window rule move the padding through the variables, not the slot", () => {
		const short = camera.slice(camera.indexOf("@media (max-height: 760px)"));
		const block = short.slice(0, short.indexOf("@media (prefers-reduced-motion"));

		expect(block).toMatch(/--camera-stage-pad-top:\s*10px/);
		expect(block).toMatch(/--camera-stage-pad-bottom:\s*60px/);
		expect(block).not.toMatch(/\.sc-stage-slot\s*{[^}]*padding-(top|bottom)/);
	});
});
