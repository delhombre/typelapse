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
		// The window's right fade is the code column's now: no window-level one.
		expect(scene.fades).toEqual([]);
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
