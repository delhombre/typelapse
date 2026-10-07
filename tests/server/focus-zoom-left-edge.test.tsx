/**
 * The push-in pivots on the body's left edge, and fades the right (#227).
 *
 * Centred on the body, a 1.25 push-in carried a tenth of the window off each
 * side. On a window cut at 185 columns that was the gutter and the line's first
 * dozen columns, cut mid-glyph; on an ordinary snippet it was the gutter, and
 * from about 66 columns the first cells of code. A code frame's left side (line
 * numbers, indentation) matters more than its right, so every push-in now pivots
 * on the left edge: nothing crops on the left, and the right edge, which takes
 * all the push-in carries off, fades. A window that cuts a long line has that
 * fade already (#221); any other window gets one that fades in with the push-in.
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
import { ZOOM_SCALE } from "../../src/application/magic-move/focus-zoom";
import { RecordingContext, round } from "../application/support/recording-context";
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
	// jsdom has no canvas: the composition measures the theme font's advance on
	// one, so it gets JetBrains Mono's, as a real canvas measures it.
	const meter = {
		font: "",
		measureText(text: string) {
			const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(meter.font)?.[1] ?? "0");
			return { width: 0.6 * size * text.length };
		},
	};
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
		meter as unknown as CanvasRenderingContext2D,
	);
	const { container } = render(<CodeCard input={card} />);
	vi.restoreAllMocks();
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

describe.each([
	["a window that cuts a long line", LONG, LONG_SOURCE],
	["an ordinary snippet", "x".repeat(37), ORDINARY],
])("the push-in on %s", (_name, line, source) => {
	const { scene, commands } = painted(line);
	const originX = pivotOf(commands);
	const zoomedX = (x: number) => originX + ZOOM_SCALE * (x - originX);

	it("pivots the painter's push-in on the body's left edge: nothing crops on the left", () => {
		expect(originX).toBe(round(scene.window.x));
	});

	it("keeps the gutter and the line's first column inside the window", () => {
		const { gutter, code, window } = scene;
		// The gutter's widest label ("01") ends at `textRight`.
		expect(zoomedX((gutter?.textRight ?? 0) - 2 * code.charWidth)).toBeGreaterThan(window.x);
		expect(zoomedX(code.x)).toBeGreaterThan(window.x);
	});

	it("fades the window's right edge once, outside the push-in", () => {
		const fade = rightFadeStyle(scene);
		expect(commands.filter((c) => c === fade)).toHaveLength(1);
		// After the restore that undoes the zoom: the window is faded, not the code.
		const zoomAt = commands.indexOf(`scale(${ZOOM_SCALE},${ZOOM_SCALE})`);
		expect(commands.slice(zoomAt, commands.indexOf(fade))).toContain("restore");
	});

	it("puts the composition's transform-origin on the same edge, with the same right fade", async () => {
		const { origin, windowFade, pushInFade } = await composed(source);
		expect(origin.startsWith("0% ")).toBe(true);
		// One pivot, two spellings: the painter's px over the body's width is the DOM's %.
		expect((originX - round(scene.window.x)) / scene.window.width).toBe(
			Number.parseFloat(origin) / 100,
		);
		// Exactly one right fade, as deep as the painter's.
		const fades = [windowFade, pushInFade].filter((el) => el !== null);
		expect(fades).toHaveLength(1);
		expect(Number.parseFloat(fades[0]?.style.width ?? "")).toBeCloseTo(4 * FONT_PX, 6);
	});
});

describe("the ordinary snippet's right fade", () => {
	it("fades in with the push-in: none at rest, half way at half the push-in", () => {
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
