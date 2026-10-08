import { linearGradientLine, radialGradientRadii } from "@/application/backgrounds/backdrop";
import { GRAIN_OPACITY, GRAIN_TILE_SIZE } from "@/application/backgrounds/grain";
import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import type { RenderToken } from "@/application/magic-move/engine";
import { BACKGROUND_PRESETS } from "@/presentation/components/preview/background-picker";
import { describe, expect, it } from "vitest";
import { RecordingContext, round } from "./support/recording-context";

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

const WIDTH = 1280;
const HEIGHT = 720;

const BASE: FrameSceneInput = {
	canvasWidth: WIDTH,
	canvasHeight: HEIGHT,
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

const TOKEN: RenderToken = { key: "k", content: "const", line: 0, col: 0, opacity: 1 };

const GRAIN = { image: {}, size: GRAIN_TILE_SIZE, opacity: GRAIN_OPACITY };

/** Exactly the values `BACKGROUND_PRESETS` offers, plus the other kinds. */
const PICKER_VALUES = [
	"mesh:aurora",
	"mesh:nebula",
	"mesh:ocean",
	"mesh:ember",
	"mesh:forest",
	...BACKGROUND_PRESETS.map((preset) => preset.value),
	"#1e293b",
];

function paint(input: Partial<FrameSceneInput>): RecordingContext {
	const ctx = new RecordingContext();
	const scene = frameScene({ ...BASE, ...input });
	paintFrame(ctx, scene, { tokens: [TOKEN], lineCount: 2, lineNumberCount: 2, timeSeconds: 0 });
	return ctx;
}

describe("paintFrame: backgrounds the picker offers", () => {
	it("never hands a CSS gradient or url to fillStyle", () => {
		// The bug this whole file exists for: `fillStyle` takes a colour, and
		// silently keeps its previous value for anything else. A gradient preset
		// or an uploaded photo therefore exported as whatever was left in the
		// context, which on an opaque canvas is black.
		for (const background of PICKER_VALUES) {
			const ctx = paint({ background });
			const raw = ctx.commands.filter(
				(command) => command.startsWith("fillStyle=") && /gradient\(|url\(/i.test(command),
			);
			expect(raw, background).toEqual([]);
		}
	});

	it("paints something over the whole canvas for every kind but None", () => {
		for (const background of PICKER_VALUES) {
			if (background === "transparent") {
				continue;
			}
			const ctx = paint({ background });
			const covers = ctx.commands.some(
				(command) =>
					command === `fillRect(0,0,${round(WIDTH)},${round(HEIGHT)})` ||
					command.startsWith("drawImage("),
			);
			expect(covers, background).toBe(true);
		}
	});

	it("draws a linear preset as a real gradient on CSS's own gradient line", () => {
		const ctx = paint({ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" });
		const line = linearGradientLine(135, WIDTH, HEIGHT);
		const id = `linear(${round(line.x0)},${round(line.y0)},${round(line.x1)},${round(line.y1)})`;
		expect(ctx.commands).toContain(`createLinearGradient ${id}`);
		expect(ctx.commands).toContain(`fillStyle=${id}[0:#667eea|1:#764ba2]`);
	});

	it("draws a radial preset squashed into the ellipse CSS asked for", () => {
		const ctx = paint({
			background: "radial-gradient(ellipse at 30% 20%, #1e3a5f 0%, #0d1117 50%, #0a0e14 100%)",
		});
		const cx = 0.3 * WIDTH;
		const cy = 0.2 * HEIGHT;
		const { rx, ry } = radialGradientRadii("ellipse", cx, cy, WIDTH, HEIGHT);
		const squash = ry / rx;
		// A canvas gradient is always round, so the space carries the ellipse.
		expect(ctx.commands).toContain(`scale(1,${round(squash)})`);
		expect(ctx.commands).toContain(
			`createRadialGradient radial(${round(cx)},${round(cy)},0,${round(cx)},${round(cy)},${round(rx)})`,
		);
		// Squashed space means a taller rectangle to still cover the canvas.
		expect(ctx.commands).toContain(
			`fillRect(0,${round(cy - cy / squash)},${round(WIDTH)},${round(HEIGHT / squash)})`,
		);
	});

	it("keeps a solid colour a flat fill", () => {
		const ctx = paint({ background: "#1e293b" });
		expect(ctx.commands).toContain("fillStyle=#1e293b");
		expect(ctx.commands).toContain(`fillRect(0,0,${round(WIDTH)},${round(HEIGHT)})`);
	});

	it("erases rather than fills for a background of None", () => {
		// Filling with a transparent colour composites to nothing, so on a canvas
		// that keeps its alpha the previous frame would simply stay put.
		const ctx = paint({ background: "transparent" });
		expect(ctx.commands[0]).toBe(`clearRect(0,0,${round(WIDTH)},${round(HEIGHT)})`);
		expect(ctx.commands).not.toContain("fillStyle=rgba(0, 0, 0, 0)");
	});

	it("puts the glow behind every background that is not None", () => {
		// The composition renders GlowDecoration for anything but `transparent`;
		// the canvas used to render it for the mesh alone.
		const glow = "fillStyle=radial";
		for (const background of [
			"mesh:aurora",
			"#1e293b",
			"linear-gradient(135deg, #a 0%, #b 100%)",
		]) {
			const ctx = paint({ background });
			expect(
				ctx.commands.some((command) => command.includes("0:rgba(255, 255, 255, 0.05)")),
				`${background} ${glow}`,
			).toBe(true);
		}
		const none = paint({ background: "transparent" });
		expect(none.commands.some((command) => command.includes("rgba(255, 255, 255, 0.05)"))).toBe(
			false,
		);
	});

	it("keeps the grain off a background of None, like both DOM renderers do", () => {
		expect(paint({ background: "mesh:aurora", grain: GRAIN }).commands).toContain(
			"createPattern(repeat)",
		);
		expect(paint({ background: "transparent", grain: GRAIN }).commands).not.toContain(
			"createPattern(repeat)",
		);
	});
});

describe("paintFrame: an uploaded image", () => {
	const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

	it("covers the canvas and centres the overflow, as `center / cover` does", () => {
		// A 2:1 image into a 16:9 canvas: the height binds, the width overhangs.
		const ctx = paint({
			background: `image:${PIXEL}`,
			backdropImage: { image: {}, width: 2000, height: 1000 },
		});
		const scale = Math.max(WIDTH / 2000, HEIGHT / 1000);
		const width = 2000 * scale;
		const height = 1000 * scale;
		expect(ctx.commands).toContain(
			`drawImage(${round((WIDTH - width) / 2)},${round((HEIGHT - height) / 2)},${round(width)},${round(height)})`,
		);
	});

	it("paints no backdrop at all when the upload could not be decoded", () => {
		// Better an empty frame here than a wrong one; the worker refuses the
		// export outright, so this never reaches a file on anyone's disk.
		const ctx = paint({ background: `image:${PIXEL}`, backdropImage: null });
		expect(ctx.commands.some((command) => command.startsWith("drawImage("))).toBe(false);
	});
});
