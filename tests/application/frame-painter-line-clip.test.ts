/**
 * The painter cuts a long line where both DOM renderers do, and paints the fade
 * the DOM masks: a gradient in the window's own background over the last
 * columns before the cut, inside the code area's clip and the push-in, after
 * the tokens and the caret (ticket #174). The fade is painted, so the on-device
 * video and PNG carry it, not only the CSS.
 */

import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import { describe, expect, it } from "vitest";
import { RecordingContext, round } from "./support/recording-context";

const BG = "#0d1117";

function input(content: string): FrameSceneInput {
	return {
		canvasWidth: 1920,
		canvasHeight: 1080,
		plan: { frames: [{ lineCount: 4, tokens: [{ col: 0, content }] }] },
		theme: {
			background: BG,
			foreground: "#e6edf3",
			fontFamily: "JetBrains Mono, monospace",
			fontSize: 14,
			borderRadius: 12,
		},
		title: "long.ts",
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
	};
}

function paint(content: string, cursorCol?: number) {
	const scene = frameScene(input(content));
	const ctx = new RecordingContext();
	paintFrame(ctx, scene, {
		tokens: [{ key: "l", content, line: 0, col: 0, opacity: 1 } as never],
		lineCount: 4,
		lineNumberCount: 4,
		timeSeconds: 0,
		cursor: cursorCol === undefined ? null : { line: 0, col: cursorCol },
	});
	return { scene, commands: ctx.commands };
}

describe("a 300-character line on the painter", () => {
	const { scene, commands } = paint("x".repeat(300), 299);

	it("resolves the code column's clip once, in cells", () => {
		expect(scene.lineClip).toEqual({
			visibleColumns: 185,
			fadeStart: 182,
			fadeEnd: expect.closeTo(3428.04 / 18.48, 9),
		});
		// The window keeps its own right fade, for what the push-in carries past it.
		expect(scene.fades.map((fade) => fade.edge)).toEqual(["right"]);
	});

	it("paints the fade from column 182 to the clip edge, after the tokens and the caret", () => {
		const { code, window } = scene;
		const from = code.x + 182 * code.charWidth;
		const edge = window.x + window.width - 24 * 2.2;
		expect(code.x + (scene.lineClip?.fadeEnd ?? 0) * code.charWidth).toBeCloseTo(edge, 9);
		const gradient = `fillStyle=linear(${round(from)},0,${round(edge)},0)[0:${BG}00|1:${BG}]`;
		const rect = `fillRect(${round(from)},${round(code.y)},${round(edge - from)},${round(
			4 * code.lineHeight,
		)})`;
		const at = commands.indexOf(gradient);
		expect(at).toBeGreaterThan(-1);
		expect(commands[at + 1]).toBe(rect);
		// Tokens first, then the caret's fill, then the fade; the code area's clip still holds.
		const lastText = commands.map((c) => c.startsWith("fillText")).lastIndexOf(true);
		const caret = commands.lastIndexOf("fill");
		expect(lastText).toBeLessThan(at);
		expect(caret).toBeLessThan(at);
		expect(commands.slice(caret, at)).not.toContain("restore");
	});
});

describe("a line that fits", () => {
	it("paints no fade", () => {
		const { scene, commands } = paint("x".repeat(80));
		expect(scene.lineClip).toBeNull();
		expect(commands.some((c) => c.startsWith("fillStyle=linear"))).toBe(false);
	});
});

describe("the two fades under the push-in", () => {
	function paintZoomed(zoom: number) {
		const scene = frameScene({ ...input("x".repeat(300)), focusZoom: true });
		const ctx = new RecordingContext();
		paintFrame(ctx, scene, {
			tokens: [{ key: "l", content: "x".repeat(300), line: 0, col: 0, opacity: 1 } as never],
			lineCount: 4,
			lineNumberCount: 4,
			timeSeconds: 0,
			zoom: { scale: zoom, originYRatio: 0.5 },
		});
		return { scene, commands: ctx.commands };
	}

	it("keeps the window's right fade on the window, unscaled, after the zoom is undone", () => {
		const { scene, commands } = paintZoomed(1.25);
		const [fade] = scene.fades;
		const right = scene.window.x + scene.window.width;
		const x = round(right - (fade?.width ?? 0));
		const windowFade = `fillStyle=linear(${x},0,${round(right)},0)[0:${BG}00|1:${BG}]`;
		// The same commands as without a push-in: the window is cut, not the code.
		expect(paintZoomed(1).commands).toContain(windowFade);
		const at = commands.indexOf(windowFade);
		expect(at).toBeGreaterThan(-1);
		// The zoom's scale, the column fade inside it, the restore that undoes the
		// zoom, then the window's fade.
		const zoomAt = commands.indexOf("scale(1.25,1.25)");
		const columnAt = commands.findIndex(
			(c, i) => i > zoomAt && c.startsWith("fillStyle=linear") && c !== windowFade,
		);
		expect(zoomAt).toBeGreaterThan(-1);
		expect(columnAt).toBeGreaterThan(zoomAt);
		expect(commands.slice(columnAt, at)).toContain("restore");
	});
});

describe("a translucent token under the column fade", () => {
	it("fades at its own opacity, and the fade is painted at full opacity over it", () => {
		const content = "x".repeat(300);
		const scene = frameScene(input(content));
		const ctx = new RecordingContext();
		paintFrame(ctx, scene, {
			tokens: [{ key: "l", content, line: 0, col: 0, opacity: 0.4 } as never],
			lineCount: 4,
			lineNumberCount: 4,
			timeSeconds: 0,
		});
		const { commands } = ctx;
		const text = commands.map((c) => c.startsWith("fillText")).lastIndexOf(true);
		const fadeAt = commands.findIndex((c, i) => i > text && c.startsWith("fillStyle=linear"));
		expect(commands.slice(0, text).lastIndexOf("globalAlpha=0.4")).toBeGreaterThan(-1);
		// The token's alpha is reset before the fade, so the fade is not 40 % of itself.
		expect(commands.slice(text, fadeAt)).toContain("globalAlpha=1");
		expect(commands[fadeAt + 1]?.startsWith("fillRect(")).toBe(true);
	});
});
