/**
 * The overlays the Remotion composition bakes over the card — the typewriter
 * caret, the progress bar, the watermark, the focus push-in — asserted against
 * the numbers the DOM uses, because these are the parts a canvas has to restate
 * rather than inherit.
 */

import type { FrameState } from "@/application/frame-painter/painter";
import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import type { RenderToken } from "@/application/magic-move/engine";
import { describe, expect, it } from "vitest";
import { RecordingContext, round } from "./support/recording-context";

const UNIT = 2.2;

const THEME = {
	background: "#0d1117",
	foreground: "#e6edf3",
	fontFamily: "JetBrains Mono, monospace",
	fontSize: 14,
	borderRadius: 12,
};

const PLAN = {
	frames: [
		{ lineCount: 2, tokens: [{ col: 0, content: "const" }] },
		{ lineCount: 2, tokens: [{ col: 0, content: "let" }] },
	],
};

const SCENE_INPUT: FrameSceneInput = {
	canvasWidth: 1280,
	canvasHeight: 720,
	plan: PLAN,
	theme: THEME,
	title: "demo.ts",
	chrome: "macos",
	background: "mesh:aurora",
	padding: 24,
	cardMargin: 32,
	showLineNumbers: true,
	lineNumberStart: 1,
	charWidthRatio: 0.6,
	scale: UNIT,
	canvasMargin: 0.05,
	grain: null,
};

const SCENE = frameScene(SCENE_INPUT);

function token(overrides: Partial<RenderToken> = {}): RenderToken {
	return { key: "k", content: "const", line: 0, col: 0, opacity: 1, ...overrides };
}

function paintWith(input: Partial<FrameSceneInput>, state: Partial<FrameState> = {}) {
	const ctx = new RecordingContext();
	paintFrame(ctx, frameScene({ ...SCENE_INPUT, ...input }), {
		tokens: [token()],
		lineCount: 2,
		lineNumberCount: 2,
		timeSeconds: 0,
		...state,
	});
	return ctx;
}

describe("typewriter caret", () => {
	it("draws the caret where the preview's span sits", () => {
		const ctx = paintWith({}, { cursor: { line: 1, col: 4 } });
		const { code } = SCENE;
		const width = Math.max(1.5, code.fontSize * 0.09);

		expect(ctx.commands).toContain(
			`roundRect(${round(code.x + 4 * code.charWidth)},${round(
				code.y + code.lineHeight + code.lineHeight * 0.14,
			)},${round(width)},${round(code.fontSize * 1.05)},1)`,
		);
		expect(ctx.commands).toContain("globalAlpha=0.85");
	});

	it("draws no caret when nothing is being typed", () => {
		const ctx = paintWith({}, { cursor: null });

		expect(ctx.commands.some((c) => c.startsWith("roundRect(") && c.endsWith(",1)"))).toBe(false);
	});
});

describe("baked progress bar", () => {
	it("floats the reels segments above the window, at the window's width", () => {
		const ctx = paintWith({ progress: { style: "reels", segments: 4 } }, { progress: 0.5 });
		const win = SCENE.window;
		const gap = 6 * UNIT;
		const trackWidth = (win.width - 3 * gap) / 4;
		const y = win.y - 10 * UNIT;

		expect(ctx.commands).toContain(
			`roundRect(${round(win.x)},${round(y)},${round(trackWidth)},${round(4 * UNIT)},999)`,
		);
		expect(ctx.commands).toContain("fillStyle=rgba(255,255,255,0.22)");
		// Halfway through four segments: exactly two are filled, the rest are bare.
		expect(ctx.commands.filter((c) => c === "fillStyle=rgba(255,255,255,0.92)")).toHaveLength(2);
	});

	it("fills a single continuous track in bar style", () => {
		const ctx = paintWith({ progress: { style: "bar", segments: 4 } }, { progress: 0.25 });
		const win = SCENE.window;
		const y = win.y - 10 * UNIT;

		expect(ctx.commands).toContain(
			`roundRect(${round(win.x)},${round(y)},${round(win.width)},${round(4 * UNIT)},999)`,
		);
		expect(ctx.commands).toContain(
			`roundRect(${round(win.x)},${round(y)},${round(win.width * 0.25)},${round(4 * UNIT)},999)`,
		);
	});

	it("paints nothing when the style is none", () => {
		const ctx = paintWith({ progress: { style: "none", segments: 4 } }, { progress: 0.5 });

		expect(ctx.commands).not.toContain("fillStyle=rgba(255,255,255,0.22)");
	});

	it("paints the bar before the window, so the window's clip cannot swallow it", () => {
		const ctx = paintWith({ progress: { style: "bar", segments: 2 } }, { progress: 1 });
		const barIndex = ctx.commands.indexOf("fillStyle=rgba(255,255,255,0.22)");
		const windowIndex = ctx.commands.indexOf(`fillStyle=${THEME.background}`);

		expect(barIndex).toBeGreaterThanOrEqual(0);
		expect(barIndex).toBeLessThan(windowIndex);
	});
});

describe("watermark", () => {
	it("sits at the composition's own inset, in canvas pixels", () => {
		const ctx = paintWith({ watermark: { text: "Made with Typelapse", color: "#ffffff88" } });

		expect(ctx.commands).toContain(
			`fillText("Made with Typelapse",${round(1280 - 56)},${round(720 - 48)})`,
		);
		expect(ctx.commands).toContain("textAlign=right");
		expect(ctx.commands).toContain("fillStyle=#ffffff88");
	});

	it("paints nothing when there is no watermark", () => {
		const ctx = paintWith({});

		expect(ctx.commands.some((c) => c.includes("Made with Typelapse"))).toBe(false);
	});
});

describe("focus zoom", () => {
	it("scales the code body about the spotlight, inside its own clip", () => {
		const ctx = paintWith({ focusZoom: true }, { zoom: { scale: 1.25, originYRatio: 0.25 } });
		const padding = 24 * UNIT;
		const box = {
			x: SCENE.window.x,
			y: SCENE.window.y + SCENE.chromeHeight,
			width: SCENE.window.width,
			height: 2 * padding + 2 * SCENE.code.lineHeight,
		};
		// Across, the body's left edge: the gutter and the line starts stay (#227).
		const ox = box.x;
		const oy = box.y + 0.25 * box.height;

		expect(ctx.commands).toContain(
			`rect(${round(box.x)},${round(box.y)},${round(box.width)},${round(box.height)})`,
		);
		expect(ctx.commands).toContain(`translate(${round(ox)},${round(oy)})`);
		expect(ctx.commands).toContain("scale(1.25,1.25)");
		expect(ctx.commands).toContain(`translate(${round(-ox)},${round(-oy)})`);
	});

	it("leaves the body untransformed when focus zoom is off", () => {
		const ctx = paintWith({}, { zoom: { scale: 1.25, originYRatio: 0.25 } });

		expect(ctx.commands).not.toContain("scale(1.25,1.25)");
	});
});
