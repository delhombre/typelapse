/**
 * The push-in on a window that cuts a long line keeps its left edge (#227).
 *
 * Centred on the body, a 1.25 push-in carried a tenth of the window off each
 * side. On a window cut at 185 columns that was the gutter and the line's first
 * dozen columns, cut mid-glyph with nothing to soften it, while the right edge
 * had the window's fade. A window that cuts a line now pivots its push-in on the
 * body's left edge: the left never crops, the gutter and the line's start stay,
 * and only the right edge, which already fades, takes what the push-in carries
 * off. A window whose lines fit pushes in from its centre, as before.
 *
 * The same pivot in the three renderers: the painter's transform and the DOM's
 * `transform-origin` (the composition here, the preview in
 * `live-preview-canvas.test.tsx`).
 */

import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CodeCard } from "../../server/remotion/composition";
import { buildCodeCardInput } from "../../server/render/v2/code-card-input";
import { paintFrame } from "../../src/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "../../src/application/frame-painter/scene";
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

const LONG = `const message = "${"lorem ipsum dolor sit amet ".repeat(11).slice(0, 281)}";`;
const LONG_SOURCE = ["// One line far longer than any window.", LONG, "export default message;"].join(
	"\n",
);
const ORDINARY = ["export function greet(name: string) {", "  return `Hello, ${name}!`;", "}"].join(
	"\n",
);

/** The painter's scene and push-in for a three-line frame whose second line is `line`. */
function painted(line: string) {
	const input: FrameSceneInput = {
		canvasWidth: 1920,
		canvasHeight: 1080,
		plan: { frames: [{ lineCount: 3, tokens: [{ col: 0, content: line }] }] },
		theme: {
			background: "#0d1117",
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
		scale: 2.2,
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
		zoom: { scale: ZOOM_SCALE, originYRatio: 0.5 },
	});
	// A canvas has no transform-origin: translate to it, scale, translate back.
	const at = ctx.commands.indexOf(`scale(${ZOOM_SCALE},${ZOOM_SCALE})`);
	const pivot = /^translate\(([-\d.]+),([-\d.]+)\)$/.exec(ctx.commands[at - 1] ?? "");
	if (!pivot) {
		throw new Error(`no push-in pivot before ${ctx.commands[at]}`);
	}
	const originX = Number(pivot[1]);
	return {
		scene,
		originX,
		/** Window px the push-in carries off the window's left edge. */
		leftCrop: (ZOOM_SCALE - 1) * (originX - scene.window.x),
		/** Where the push-in draws a point drawn at `x` without it. */
		zoomedX: (x: number) => originX + ZOOM_SCALE * (x - originX),
	};
}

/** The composition's pushed-in box for `code` focused on its second line. */
async function composedOrigin(code: string): Promise<string> {
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
	return scaled.style.transformOrigin;
}

describe("the push-in on a window that cuts a long line", () => {
	const { scene, originX, leftCrop, zoomedX } = painted(LONG);

	it("pivots the painter's push-in on the body's left edge: nothing crops on the left", () => {
		expect(scene.lineClip).not.toBeNull();
		expect(originX).toBe(round(scene.window.x));
		expect(leftCrop).toBe(0);
	});

	it("keeps the gutter and the line's first column inside the window", () => {
		const { gutter, code, window } = scene;
		// The gutter's widest label ("01") ends at `textRight`.
		expect(zoomedX((gutter?.textRight ?? 0) - 2 * code.charWidth)).toBeGreaterThan(window.x);
		expect(zoomedX(code.x)).toBeGreaterThan(window.x);
	});

	it("leaves the window's fades as they were: the right one takes what the push-in carries off", () => {
		expect(scene.fades.map((fade) => fade.edge)).toEqual(["right"]);
	});

	it("puts the composition's transform-origin on the same edge", async () => {
		const origin = await composedOrigin(LONG_SOURCE);
		expect(origin.startsWith("0% ")).toBe(true);
		// One pivot, two spellings: the painter's px over the body's width is the DOM's %.
		expect((originX - round(scene.window.x)) / scene.window.width).toBe(
			Number.parseFloat(origin) / 100,
		);
	});
});

describe("the push-in on a window whose lines fit", () => {
	const { scene, originX, leftCrop } = painted("x".repeat(80));

	it("stays centred on the body, as before: a tenth of the window crops on each side", () => {
		expect(scene.lineClip).toBeNull();
		expect(originX).toBe(round(scene.window.x + scene.window.width / 2));
		expect(leftCrop).toBeCloseTo((ZOOM_SCALE - 1) * (scene.window.width / 2), 2);
		expect(scene.fades).toEqual([]);
	});

	it("keeps the composition's transform-origin centred", async () => {
		expect((await composedOrigin(ORDINARY)).startsWith("50% ")).toBe(true);
	});
});
