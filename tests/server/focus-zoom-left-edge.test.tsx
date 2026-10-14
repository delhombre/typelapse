/**
 * The push-in keeps the gutter in frame, and fades the right (#227).
 *
 * Centred on the body, a 1.25 push-in carried a tenth of the window off each
 * side. On a window cut at 185 columns that was the gutter and the line's first
 * dozen columns, cut mid-glyph; on an ordinary snippet it was the gutter. The
 * pivot now moves left of centre only as far as keeps the gutter's left edge
 * half a margin inside the window (`zoomOriginX`), and the right edge, which
 * takes the rest of what
 * the push-in carries off, fades: the window's own fade on a cut line (#221),
 * otherwise one that fades in with the push-in.
 *
 * The same pivot and the same fade in the three renderers: the painter's
 * commands and the DOM's styles (the composition here, the preview in
 * `live-preview-canvas.test.tsx`).
 */

import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CodeCard } from "../../server/remotion/composition";
import { buildCodeCardInput } from "../../server/render/v2/code-card-input";
import { paintFrame } from "../../src/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "../../src/application/frame-painter/scene";
import { BASE_VIDEO_SCALE } from "../../src/application/layout/canvas-fit";
import { ZOOM_SCALE, zoomOriginX } from "../../src/application/magic-move/focus-zoom";
import { RecordingContext, round } from "../application/support/recording-context";
import { useMonospaceCanvas } from "../support/jsdom-gaps";
import { proofDocument } from "./remotion-v2-proof-document";

vi.mock("remotion", async () => {
	const ReactRuntime = await import("react");
	return {
		AbsoluteFill: ({ children }: { children?: React.ReactNode }) =>
			ReactRuntime.createElement("div", null, children),
		Audio: () => null,
		delayRender: () => 1,
		continueRender: () => undefined,
		useCurrentFrame: () => 0,
		useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 150 }),
	};
});

// jsdom has no canvas: the composition measures the theme font's advance on
// one, so it gets JetBrains Mono's, as a real canvas measures it.
useMonospaceCanvas();

const BG = "#0d1117";
const FONT_PX = 14 * BASE_VIDEO_SCALE;
const LONG = `const message = "${"lorem ipsum dolor sit amet ".repeat(11).slice(0, 281)}";`;
const LONG_SOURCE = ["// One line far longer than any window.", LONG, "export default message;"].join(
	"\n",
);
const ORDINARY = ["export function greet(name: string) {", "  return `Hello, ${name}!`;", "}"].join(
	"\n",
);

/** The painter's scene and commands for a three-line frame whose second line is `line`. */
function painted(line: string, zoomScale = ZOOM_SCALE) {
	const input: FrameSceneInput = {
		canvasWidth: 1920,
		canvasHeight: 1080,
		plan: { frames: [{ lineCount: 3, tokens: [{ col: 0, content: line }] }] },
		theme: {
			background: BG,
			foreground: "#e6edf3",
			fontFamily: "JetBrains Mono, monospace",
			fontSize: 14,
			borderRadius: 12,
		},
		title: "zoom.ts",
		chrome: "macos",
		background: "#101014",
		padding: 24,
		cardMargin: 32,
		showLineNumbers: true,
		lineNumberStart: 1,
		charWidthRatio: 0.6,
		scale: BASE_VIDEO_SCALE,
		canvasMargin: 0.05,
		grain: null,
		focusZoom: true,
	};
	const scene = frameScene(input);
	const ctx = new RecordingContext();
	paintFrame(ctx, scene, {
		tokens: [{ key: "l", content: line, line: 1, col: 0, opacity: 1 } as never],
		lineCount: 3,
		lineNumberCount: 3,
		timeSeconds: 0,
		zoom: { scale: zoomScale, originYRatio: 0.5 },
	});
	return { scene, commands: ctx.commands };
}

/** Where the painter pivots its push-in: a canvas translates to it, scales, translates back. */
function pivotOf(commands: string[]): number {
	const at = commands.indexOf(`scale(${ZOOM_SCALE},${ZOOM_SCALE})`);
	const pivot = /^translate\(([-\d.]+),([-\d.]+)\)$/.exec(commands[at - 1] ?? "");
	if (!pivot) {
		throw new Error(`no push-in pivot before ${commands[at]}`);
	}
	return Number(pivot[1]);
}

/** The gradient a right-edge fade over `scene`'s window is painted with. */
function rightFadeStyle(scene: ReturnType<typeof painted>["scene"]): string {
	const right = scene.window.x + scene.window.width;
	return `fillStyle=linear(${round(right - 4 * FONT_PX)},0,${round(right)},0)[0:${BG}00|1:${BG}]`;
}

/** The composition's pushed-in box and its window, for `code` focused on its second line. */
async function composed(code: string) {
	const base = proofDocument();
	const card = await buildCodeCardInput({
		document: {
			...base,
			project: {
				...base.project,
				settings: { ...base.project.settings, focusZoom: true },
				scenes: base.project.scenes.map((scene, index) => ({
					...scene,
					blocks: scene.blocks.map((block) =>
						block.kind === "code"
							? { ...block, code, ...(index === 0 ? { focus: "2" } : {}) }
							: block,
					),
				})),
			},
		},
		loop: false,
	});
	if (!card) {
		throw new Error("no card");
	}
	const { container } = render(<CodeCard input={card} />);
	const scaled = Array.from(container.querySelectorAll<HTMLElement>("div")).find((el) =>
		el.style.transform.startsWith(`scale(${ZOOM_SCALE})`),
	);
	if (!scaled) {
		throw new Error("no pushed-in body");
	}
	const windowEl = container.querySelector<HTMLElement>("[data-code-window]");
	return {
		origin: scaled.style.transformOrigin,
		windowFade: windowEl?.querySelector<HTMLElement>("[data-clip-fade='right']") ?? null,
		pushInFade: windowEl?.querySelector<HTMLElement>("[data-push-in-fade]") ?? null,
	};
}

const PADDING_PX = 24 * BASE_VIDEO_SCALE;

describe.each([
	["a window that cuts a long line", LONG, LONG_SOURCE],
	["an ordinary snippet", "x".repeat(37), ORDINARY],
])("the push-in on %s", (_name, line, source) => {
	const { scene, commands } = painted(line);
	const origin = zoomOriginX({ padding: PADDING_PX, bodyWidth: scene.window.width });
	const originX = scene.window.x + origin * scene.window.width;
	const zoomedX = (x: number) => originX + ZOOM_SCALE * (x - originX);

	it("pivots the painter's push-in left of centre, at the shared rule's origin", () => {
		expect(origin).toBeGreaterThan(0);
		expect(origin).toBeLessThan(0.5);
		expect(pivotOf(commands)).toBe(round(originX));
	});

	it("keeps the gutter's left edge half a margin inside the window, and the line's first column", () => {
		const { gutter, code, window } = scene;
		// The gutter's widest label ("01") ends at `textRight`: it starts at the padding.
		const gutterLeft = (gutter?.textRight ?? 0) - 2 * code.charWidth;
		expect(gutterLeft).toBeCloseTo(window.x + PADDING_PX, 9);
		expect(zoomedX(gutterLeft)).toBeCloseTo(window.x + PADDING_PX / 2, 9);
		expect(zoomedX(code.x)).toBeGreaterThan(window.x);
	});

	it("fades the window's right edge once, outside the push-in", () => {
		const fade = rightFadeStyle(scene);
		expect(commands.filter((c) => c === fade)).toHaveLength(1);
		// After the restore that undoes the zoom: the window is faded, not the code.
		const zoomAt = commands.indexOf(`scale(${ZOOM_SCALE},${ZOOM_SCALE})`);
		expect(commands.slice(zoomAt, commands.indexOf(fade))).toContain("restore");
	});

	it("puts the composition's transform-origin at the same ratio, with the same right fade", async () => {
		const { origin: composedOrigin, windowFade, pushInFade } = await composed(source);
		// One pivot, two spellings: the painter's ratio of the body's width is the DOM's %.
		expect(Number.parseFloat(composedOrigin) / 100).toBeCloseTo(origin, 9);
		// Exactly one right fade, as deep as the painter's.
		const fades = [windowFade, pushInFade].filter((el) => el !== null);
		expect(fades).toHaveLength(1);
		expect(Number.parseFloat(fades[0]?.style.width ?? "")).toBeCloseTo(4 * FONT_PX, 6);
	});
});

describe("a window cut by less than its two cells of slack", () => {
	// 183 columns: the window is cut on the right (its own fade, #221), but the
	// code column still shows every cell, so there is no line clip.
	const line = "x".repeat(183);
	const source = ["// cut by the slack", line, "export {};"].join("\n");

	it("is cut without a line clip: the case the fade must be read from the window", () => {
		const { scene } = painted(line);
		expect(scene.lineClip).toBeNull();
		expect(scene.fades.map((fade) => fade.edge)).toEqual(["right"]);
	});

	it("gets exactly one right fade from the painter under the push-in", () => {
		const { scene, commands } = painted(line);
		expect(commands.filter((c) => c === rightFadeStyle(scene))).toHaveLength(1);
	});

	it("gets exactly one right fade from the composition under the push-in", async () => {
		const { windowFade, pushInFade } = await composed(source);
		expect(windowFade).not.toBeNull();
		expect(pushInFade).toBeNull();
	});
});

describe("the ordinary snippet's right fade", () => {
	it("is there only while the push-in crops the right: none at rest, half way at half the push-in", () => {
		const line = "x".repeat(37);
		const rest = painted(line, 1);
		expect(rest.commands).not.toContain(rightFadeStyle(rest.scene));

		const half = painted(line, 1.125);
		const fadeAt = half.commands.indexOf(rightFadeStyle(half.scene));
		expect(fadeAt).toBeGreaterThan(-1);
		expect(half.commands.slice(0, fadeAt).lastIndexOf("globalAlpha=0.5")).toBeGreaterThan(-1);
		expect(half.commands.slice(fadeAt)).toContain("globalAlpha=1");
	});

	it("is the push-in's own in the DOM, the window's own fade being for a cut line", async () => {
		const ordinary = await composed(ORDINARY);
		expect(ordinary.windowFade).toBeNull();
		expect(ordinary.pushInFade?.style.opacity).toBe("1");
		const long = await composed(LONG_SOURCE);
		expect(long.pushInFade).toBeNull();
	});
});
