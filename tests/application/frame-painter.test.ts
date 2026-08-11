import { MESH_PRESETS } from "@/application/backgrounds/mesh-gradient";
import { canvasFont, colorWithAlpha } from "@/application/frame-painter/font";
import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import { chromeBarHeight } from "@/application/layout/frame-metrics";
import type { RenderToken } from "@/application/magic-move/engine";
import { describe, expect, it } from "vitest";
import { RecordingContext, round } from "./support/recording-context";

const THEME = {
	background: "#0d1117",
	foreground: "#e6edf3",
	fontFamily: "JetBrains Mono, monospace",
	fontSize: 14,
	borderRadius: 12,
};

/** Two frames, three columns wide, two rows tall: enough to pin every offset. */
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
	scale: 2.2,
	canvasMargin: 0.05,
	grain: null,
};

function token(overrides: Partial<RenderToken> = {}): RenderToken {
	return { key: "k", content: "const", line: 0, col: 0, opacity: 1, ...overrides };
}

describe("canvasFont", () => {
	it("quotes family names so a multi-word family survives the shorthand", () => {
		expect(canvasFont(28, "JetBrains Mono, monospace")).toBe('28px "JetBrains Mono", monospace');
	});

	it("leaves a single-word family unquoted", () => {
		expect(canvasFont(28, "monospace")).toBe("28px monospace");
	});

	it("carries the Shiki font-style bitmask into the shorthand", () => {
		expect(canvasFont(28, "monospace", 1)).toBe("italic 28px monospace");
		expect(canvasFont(28, "monospace", 2)).toBe("700 28px monospace");
		expect(canvasFont(28, "monospace", 3)).toBe("italic 700 28px monospace");
	});

	it("ignores the underline bit, which the shorthand cannot express", () => {
		expect(canvasFont(28, "monospace", 4)).toBe("28px monospace");
	});
});

describe("colorWithAlpha", () => {
	it("turns a hex into an rgba so a gradient can fade a colour to nothing", () => {
		expect(colorWithAlpha("#6d28d9", 0)).toBe("rgba(109, 40, 217, 0)");
		expect(colorWithAlpha("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
	});

	it("passes a non-hex colour through untouched at full alpha", () => {
		expect(colorWithAlpha("transparent", 1)).toBe("transparent");
	});
});

describe("frameScene", () => {
	it("centres the padded card on the canvas", () => {
		const scene = frameScene(SCENE_INPUT);
		const paintedWidth = scene.card.width * scene.card.scale;
		const paintedHeight = scene.card.height * scene.card.scale;
		expect(scene.card.originX + paintedWidth / 2).toBeCloseTo(1280 / 2, 6);
		expect(scene.card.originY + paintedHeight / 2).toBeCloseTo(720 / 2, 6);
	});

	it("keeps the whole card inside the canvas safe area", () => {
		const scene = frameScene(SCENE_INPUT);
		expect(scene.card.width * scene.card.scale).toBeLessThanOrEqual(1280 * 0.9 + 1e-9);
		expect(scene.card.height * scene.card.scale).toBeLessThanOrEqual(720 * 0.9 + 1e-9);
	});

	it("sizes the window from the chrome bar, the padding and the tallest frame", () => {
		const scene = frameScene(SCENE_INPUT);
		const fontSize = 14 * 2.2;
		const expected = chromeBarHeight("macos", 2.2) + 2 * 24 * 2.2 + 2 * fontSize * 1.6;
		expect(scene.window.height).toBeCloseTo(expected, 6);
		expect(scene.window.x).toBeCloseTo(32 * 2.2, 6);
		expect(scene.window.y).toBeCloseTo(32 * 2.2, 6);
		expect(scene.window.radius).toBeCloseTo(12 * 2.2, 6);
	});

	it("starts the code after the padding and the gutter, on the measured advance", () => {
		const scene = frameScene(SCENE_INPUT);
		const fontSize = 14 * 2.2;
		const charWidth = fontSize * 0.6;
		// The gutter is a border-box column: two digits of label plus the font-size
		// gap, never narrower than its three-character minimum.
		const gutter = Math.max(3 * charWidth, 2 * charWidth + fontSize);
		expect(scene.code.charWidth).toBeCloseTo(charWidth, 6);
		expect(scene.code.lineHeight).toBeCloseTo(fontSize * 1.6, 6);
		expect(scene.code.x).toBeCloseTo(scene.window.x + 24 * 2.2 + gutter, 6);
		expect(scene.code.y).toBeCloseTo(scene.window.y + scene.chromeHeight + 24 * 2.2, 6);
		expect(scene.gutter?.textRight).toBeCloseTo(scene.code.x - fontSize, 6);
	});

	it("drops the gutter entirely when line numbers are off", () => {
		const scene = frameScene({ ...SCENE_INPUT, showLineNumbers: false });
		expect(scene.gutter).toBeNull();
		expect(scene.code.x).toBeCloseTo(scene.window.x + 24 * 2.2, 6);
	});
});

describe("paintFrame", () => {
	const scene = frameScene(SCENE_INPUT);

	function paint(time: number, tokens: RenderToken[] = [token()]) {
		const ctx = new RecordingContext();
		paintFrame(ctx, scene, { tokens, lineCount: 2, lineNumberCount: 2, timeSeconds: time });
		return ctx;
	}

	it("lays the mesh down base-first, then the blobs bottom-up", () => {
		const preset = MESH_PRESETS[0];
		if (!preset) {
			throw new Error("expected a preset");
		}
		const ctx = paint(0);
		const baseIndex = ctx.commands.indexOf(`fillStyle=${preset.base}`);
		expect(baseIndex).toBeGreaterThanOrEqual(0);

		// CSS stacks radial-gradient layers top-first; a canvas paints in order, so
		// the last blob in the array has to go down first for the stack to match.
		const blobOrder = preset.blobs.map((blob) =>
			ctx.commands.findIndex((c) => c.includes(colorWithAlpha(blob.color, 1))),
		);
		expect(blobOrder.every((i) => i > baseIndex)).toBe(true);
		expect([...blobOrder].sort((a, b) => a - b)).toEqual([...blobOrder].reverse());
	});

	it("fades each blob to its own colour at zero alpha, never to grey", () => {
		const preset = MESH_PRESETS[0];
		const blob = preset?.blobs[0];
		if (!blob) {
			throw new Error("expected a blob");
		}
		const ctx = paint(0);
		const stop = ctx.commands.find((c) => c.includes(colorWithAlpha(blob.color, 1)));
		expect(stop).toContain(colorWithAlpha(blob.color, 0));
	});

	it("paints the grain over the background and under the card, in soft-light", () => {
		const ctx = new RecordingContext();
		const grained = frameScene({
			...SCENE_INPUT,
			grain: { image: {}, size: 160, opacity: 0.28 },
		});
		paintFrame(ctx, grained, {
			tokens: [token()],
			lineCount: 2,
			lineNumberCount: 2,
			timeSeconds: 0,
		});
		const grainIndex = ctx.commands.indexOf("globalCompositeOperation=soft-light");
		const cardIndex = ctx.commands.findIndex((c) => c === `fillStyle=${THEME.background}`);
		expect(grainIndex).toBeGreaterThanOrEqual(0);
		expect(ctx.commands).toContain("createPattern(repeat)");
		expect(ctx.commands).toContain("globalAlpha=0.28");
		expect(grainIndex).toBeLessThan(cardIndex);
	});

	it("skips the grain entirely when no tile was decoded", () => {
		const ctx = paint(0);
		expect(ctx.commands).not.toContain("createPattern(repeat)");
	});

	it("places every token on the monospace grid, with its own colour and alpha", () => {
		const ctx = paint(0, [
			token({ key: "a", content: "const", line: 0, col: 0, color: "#ff8800", opacity: 1 }),
			token({ key: "b", content: "x", line: 1, col: 6, color: "#00ff88", opacity: 0.5 }),
		]);
		const { code } = scene;
		expect(ctx.commands).toContain(
			`fillText("const",${round(code.x)},${round(code.y + code.lineHeight / 2)})`,
		);
		expect(ctx.commands).toContain(
			`fillText("x",${round(code.x + 6 * code.charWidth)},${round(code.y + 1.5 * code.lineHeight)})`,
		);
		expect(ctx.commands).toContain("fillStyle=#ff8800");
		expect(ctx.commands).toContain("globalAlpha=0.5");
	});

	it("does not pay to paint a token that has faded out", () => {
		const ctx = paint(0, [token({ key: "gone", content: "gone", opacity: 0 })]);
		expect(ctx.commands.some((c) => c.includes('fillText("gone"'))).toBe(false);
	});

	it("draws the three traffic lights for macOS chrome, and none for a bare window", () => {
		const ctx = paint(0);
		for (const light of ["#ff5f57", "#febc2e", "#28c840"]) {
			expect(ctx.commands).toContain(`fillStyle=${light}`);
		}
		const bare = new RecordingContext();
		paintFrame(bare, frameScene({ ...SCENE_INPUT, chrome: "none" }), {
			tokens: [token()],
			lineCount: 2,
			lineNumberCount: 2,
			timeSeconds: 0,
		});
		expect(bare.commands).not.toContain("fillStyle=#ff5f57");
	});

	it("numbers the gutter rows the way the preview does", () => {
		const ctx = paint(0);
		const right = round(scene.gutter?.textRight ?? 0);
		expect(ctx.commands).toContain(
			`fillText("01",${right},${round(scene.code.y + scene.code.lineHeight / 2)})`,
		);
		expect(ctx.commands).toContain(
			`fillText("02",${right},${round(scene.code.y + 1.5 * scene.code.lineHeight)})`,
		);
	});

	it("clips the code area to the interpolated body height, as the preview does", () => {
		// Mid-morph the row count is fractional, and the preview clips the code area
		// to it so the frame grows and shrinks smoothly instead of snapping to the
		// taller frame. A canvas that skips the clip shows a row the preview hides.
		const ctx = new RecordingContext();
		paintFrame(ctx, scene, {
			tokens: [token()],
			lineCount: 3.5,
			lineNumberCount: 4,
			timeSeconds: 0,
		});
		const padding = 24 * 2.2;
		expect(ctx.commands).toContain(
			`rect(${round(scene.window.x + padding)},${round(scene.code.y)},${round(
				scene.window.width - 2 * padding,
			)},${round(3.5 * scene.code.lineHeight)})`,
		);
	});

	it("never clips the code area to nothing, however short the frame", () => {
		const ctx = new RecordingContext();
		paintFrame(ctx, scene, { tokens: [token()], lineCount: 0, lineNumberCount: 1, timeSeconds: 0 });
		const clip = ctx.commands.find((c) => c.startsWith("rect("));
		expect(clip).toContain(`,${round(scene.code.lineHeight)})`);
	});

	it("is deterministic: the same time paints the same commands, twice", () => {
		expect(paint(1.5).commands).toEqual(paint(1.5).commands);
	});

	it("moves with time: a later instant paints a different mesh", () => {
		expect(paint(1.5).commands).not.toEqual(paint(4.5).commands);
	});
});
