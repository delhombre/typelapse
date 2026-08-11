/**
 * Paints one engine frame onto a 2D context: pure, and total.
 *
 * Given a scene (fixed geometry) and a frame state (the interpolated tokens and
 * the instant they belong to), this emits the same sequence of drawing commands
 * every time. Nothing is measured, nothing is fetched, nothing is remembered
 * between calls: the frame at t is a function of t. That is what lets a video
 * encoder step through 90 frames and get a result identical to a scrub.
 *
 * The order mirrors the Remotion composition exactly: background, glow, grain,
 * then the card (window, chrome, gutter, code), so the three surfaces stay one
 * picture.
 */

import { meshBlobsAt } from "../backgrounds/mesh-gradient";
import { gutterLabels } from "../line-numbers/gutter";
import type { RenderToken } from "../magic-move/engine";
import { canvasFont, colorWithAlpha } from "./font";
import type { PaintContext } from "./paint-context";
import type { FrameScene, GrainTile } from "./scene";

/** Everything about a frame that changes from one instant to the next. */
export interface FrameState {
	/** Already-interpolated tokens, straight out of the magic-move engine. */
	tokens: RenderToken[];
	/** Row count of the code area, fractional through a morph. */
	lineCount: number;
	/** Stable number of gutter rows for the segment (avoids a flickering gutter). */
	lineNumberCount: number;
	/** Seconds since the start of the video: drives the mesh drift. */
	timeSeconds: number;
}

/** Below this the glyph is invisible; painting it costs a draw call for nothing. */
const INVISIBLE = 0.001;
/** The macOS bar's own metrics, in unscaled px, straight from `FrameChrome`. */
const LIGHT_SIZE = 11;
const LIGHT_GAP = 8;
const LIGHT_PAD_X = 16;
const LIGHT_PAD_Y = 12;
const TITLE_SIZE = 11;
/** Intrinsic line box of the bar's text: mirrors `CHROME_TEXT_LINE_HEIGHT`. */
const CHROME_ROW = LIGHT_SIZE * 1.35;
const TRAFFIC_LIGHTS = ["#ff5f57", "#febc2e", "#28c840"];

export function paintFrame(ctx: PaintContext, scene: FrameScene, state: FrameState): void {
	paintBackground(ctx, scene, state.timeSeconds);
	paintGrain(ctx, scene, scene.style.grain);

	ctx.save();
	ctx.translate(scene.card.originX, scene.card.originY);
	ctx.scale(scene.card.scale, scene.card.scale);
	paintWindow(ctx, scene);
	paintChrome(ctx, scene);
	ctx.save();
	clipCodeArea(ctx, scene, state.lineCount);
	paintGutter(ctx, scene, state.lineNumberCount);
	paintTokens(ctx, scene, state.tokens);
	ctx.restore();
	ctx.restore();
}

/**
 * The mesh, bottom-up. CSS stacks `radial-gradient` layers with the first one on
 * top; a canvas paints in the order it is told, so the array is walked backwards
 * over the base colour and the stack comes out the same way round.
 */
function paintBackground(ctx: PaintContext, scene: FrameScene, timeSeconds: number): void {
	const { width, height } = scene.canvas;
	const { mesh, flat } = scene.style;
	if (!mesh) {
		ctx.fillStyle = flat === "transparent" ? "rgba(0, 0, 0, 0)" : flat;
		ctx.fillRect(0, 0, width, height);
		return;
	}

	ctx.fillStyle = mesh.base;
	ctx.fillRect(0, 0, width, height);

	const blobs = meshBlobsAt(mesh, timeSeconds);
	for (let i = blobs.length - 1; i >= 0; i--) {
		const blob = blobs[i];
		if (!blob) {
			continue;
		}
		const cx = (blob.x / 100) * width;
		const cy = (blob.y / 100) * height;
		// `radial-gradient(circle at x y, ...)` sizes to the farthest corner, so a
		// stop at R% sits R% of the way to that corner.
		const radius = (blob.radius / 100) * farthestCorner(cx, cy, width, height);
		const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
		gradient.addColorStop(0, colorWithAlpha(blob.color, 1));
		gradient.addColorStop(1, colorWithAlpha(blob.color, 0));
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	}

	paintGlow(ctx, scene);
}

/** The composition's soft centre glow: a wide, faint radial wash. */
function paintGlow(ctx: PaintContext, scene: FrameScene): void {
	const { width, height } = scene.canvas;
	const cx = width / 2;
	const cy = height / 2;
	const radius = Math.min(width * 0.35, height * 0.3);
	const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
	glow.addColorStop(0, "rgba(255, 255, 255, 0.05)");
	glow.addColorStop(1, "rgba(255, 255, 255, 0)");
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, width, height);
}

/**
 * The film grain, tiled in soft-light over the background. It goes down before
 * the card, exactly like the composition's full-bleed `GrainOverlay`, so the
 * texture lives on the mesh and never over the code.
 */
function paintGrain(ctx: PaintContext, scene: FrameScene, grain: GrainTile | null): void {
	if (!grain) {
		return;
	}
	const pattern = ctx.createPattern(grain.image, "repeat");
	if (!pattern) {
		return;
	}
	ctx.save();
	ctx.globalCompositeOperation = "soft-light";
	ctx.globalAlpha = grain.opacity;
	ctx.fillStyle = pattern;
	ctx.fillRect(0, 0, scene.canvas.width, scene.canvas.height);
	ctx.restore();
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = "source-over";
}

/** The code window: a rounded rect in the theme's background, and its clip. */
function paintWindow(ctx: PaintContext, scene: FrameScene): void {
	const { x, y, width, height, radius } = scene.window;
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, radius);
	ctx.fillStyle = scene.style.theme.background;
	ctx.fill();
	ctx.clip();
}

/**
 * The macOS bar: three traffic lights and the title, laid out as the flex row
 * they are in the DOM (padding, then one gap between each child), and closed by
 * the same hairline border.
 */
function paintChrome(ctx: PaintContext, scene: FrameScene): void {
	const { chrome, title, theme } = scene.style;
	if (chrome === "none") {
		return;
	}
	const unit = scene.unit;
	const { x, y } = scene.window;

	// Hairline under the bar, at the bar's own bottom edge.
	ctx.fillStyle = withHexAlpha(theme.foreground, "0f");
	ctx.fillRect(x, y + scene.chromeHeight - unit, scene.window.width, unit);

	if (chrome !== "macos") {
		return;
	}

	const size = LIGHT_SIZE * unit;
	// The flex row is centred on the content box, which sits inside the padding
	// and above the 1px border.
	const cy = y + LIGHT_PAD_Y * unit + (CHROME_ROW * unit) / 2;
	let cx = x + LIGHT_PAD_X * unit;
	for (const color of TRAFFIC_LIGHTS) {
		ctx.beginPath();
		ctx.arc(cx + size / 2, cy, size / 2, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
		cx += size + LIGHT_GAP * unit;
	}

	if (title === "") {
		return;
	}
	// The title is the fourth flex child, plus its own left margin.
	ctx.font = canvasFont(TITLE_SIZE * unit, theme.fontFamily);
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.fillStyle = withHexAlpha(theme.foreground, "59");
	ctx.fillText(title, cx + LIGHT_GAP * unit, cy);
}

/**
 * Clip the code area to the row count, which is fractional through a morph.
 *
 * The preview does this so a frame that gains or loses lines grows and shrinks
 * smoothly instead of snapping to the taller of the two; without it a canvas
 * shows a row the preview is still hiding, which is exactly the kind of
 * difference nobody notices until the video is next to the app.
 */
function clipCodeArea(ctx: PaintContext, scene: FrameScene, lineCount: number): void {
	const padding = scene.code.y - scene.window.y - scene.chromeHeight;
	const bodyHeight = Math.max(scene.code.lineHeight, lineCount * scene.code.lineHeight);
	ctx.beginPath();
	ctx.rect(scene.window.x + padding, scene.code.y, scene.window.width - 2 * padding, bodyHeight);
	ctx.clip();
}

function paintGutter(ctx: PaintContext, scene: FrameScene, lineNumberCount: number): void {
	const { gutter, code, style } = scene;
	if (!gutter) {
		return;
	}
	ctx.font = canvasFont(code.fontSize, style.theme.fontFamily);
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	ctx.fillStyle = withHexAlpha(style.theme.foreground, "26");
	const rows = Math.max(1, Math.round(lineNumberCount));
	for (const [row, label] of gutterLabels(style.lineNumberStart, rows).entries()) {
		ctx.fillText(label, gutter.textRight, code.y + (row + 0.5) * code.lineHeight);
	}
}

/**
 * The tokens themselves. Each one sits at `col` advances across and `line` rows
 * down, and carries its own opacity from the engine's morph: the canvas
 * equivalent of the preview's absolutely positioned `ch`-offset spans.
 */
function paintTokens(ctx: PaintContext, scene: FrameScene, tokens: RenderToken[]): void {
	const { code, style } = scene;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	for (const token of tokens) {
		if (token.opacity <= INVISIBLE) {
			continue;
		}
		ctx.globalAlpha = token.opacity;
		ctx.fillStyle = token.color ?? style.theme.foreground;
		ctx.font = canvasFont(code.fontSize, style.theme.fontFamily, token.fontStyle);
		ctx.fillText(
			token.content,
			code.x + token.col * code.charWidth,
			code.y + (token.line + 0.5) * code.lineHeight,
		);
	}
	ctx.globalAlpha = 1;
}

/** Distance from a point to the farthest corner of the surface. */
function farthestCorner(x: number, y: number, width: number, height: number): number {
	const dx = Math.max(x, width - x);
	const dy = Math.max(y, height - y);
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The DOM's `#rrggbbAA` shorthand, as an rgba the context understands. The alpha
 * is passed as the same two hex digits the components write (`26`, `59`, `0f`),
 * so a tint can be checked against the CSS by eye rather than by arithmetic.
 */
function withHexAlpha(color: string, hexAlpha: string): string {
	return colorWithAlpha(color, Number.parseInt(hexAlpha, 16) / 255);
}
