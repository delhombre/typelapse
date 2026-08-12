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
import type { GridPosition, RenderToken } from "../magic-move/engine";
import type { ZoomTransform } from "../magic-move/focus-zoom";
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
	/** Typewriter caret, or null/absent when nothing is being typed. */
	cursor?: GridPosition | null;
	/** This frame's push-in; ignored unless the scene turns focus zoom on. */
	zoom?: ZoomTransform;
	/** Position in the whole video, 0..1, for the baked progress bar. */
	progress?: number;
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
/** `ReelsProgress`'s own metrics, in unscaled px, and where the card floats it. */
const PROGRESS_HEIGHT = 4;
const PROGRESS_GAP = 6;
const PROGRESS_OFFSET = 10;
const PROGRESS_TRACK = "rgba(255,255,255,0.22)";
const PROGRESS_FILL = "rgba(255,255,255,0.92)";
/** A radius no track can reach, which is how CSS spells a pill. */
const PILL = 999;
/** `WatermarkOverlay`'s inset and size, in canvas pixels (not card space). */
const WATERMARK_RIGHT = 56;
const WATERMARK_BOTTOM = 48;
const WATERMARK_SIZE = 22;
/** The caret's own metrics, straight from `MagicMoveCanvas`. */
const CARET_MIN_WIDTH = 1.5;
const CARET_WIDTH_RATIO = 0.09;
const CARET_HEIGHT_RATIO = 1.05;
const CARET_TOP_RATIO = 0.14;
const CARET_OPACITY = 0.85;
const CARET_RADIUS = 1;

export function paintFrame(ctx: PaintContext, scene: FrameScene, state: FrameState): void {
	paintBackground(ctx, scene, state.timeSeconds);
	paintGrain(ctx, scene, scene.style.grain);

	ctx.save();
	ctx.translate(scene.card.originX, scene.card.originY);
	ctx.scale(scene.card.scale, scene.card.scale);
	// The progress bar floats *above* the window, so it has to go down before
	// the window establishes its clip — the clip would otherwise eat it whole.
	paintProgress(ctx, scene, state.progress ?? 0);

	ctx.save();
	paintWindow(ctx, scene);
	paintChrome(ctx, scene);
	ctx.save();
	clipBody(ctx, scene, state.lineCount);
	applyZoom(ctx, scene, state);
	clipCodeArea(ctx, scene, state.lineCount);
	paintGutter(ctx, scene, state.lineNumberCount);
	paintTokens(ctx, scene, state.tokens);
	paintCaret(ctx, scene, state.cursor);
	ctx.restore();
	ctx.restore();
	ctx.restore();

	paintWatermark(ctx, scene);
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
 * The body box: everything below the chrome bar, at the window's full width.
 *
 * This is the box the DOM's zoom wrapper occupies — `MagicMoveCanvas`'s padding
 * box, not its content box — so the push-in has to be taken about *this*
 * rectangle's centre, and clipped to it, or a scaled body climbs into the
 * chrome bar. The corners are left square: the window's own rounded clip is
 * still in force around it.
 */
function bodyBox(scene: FrameScene, lineCount: number) {
	const padding = scene.code.y - scene.window.y - scene.chromeHeight;
	const bodyHeight = Math.max(scene.code.lineHeight, lineCount * scene.code.lineHeight);
	return {
		x: scene.window.x,
		y: scene.window.y + scene.chromeHeight,
		width: scene.window.width,
		height: 2 * padding + bodyHeight,
	};
}

function clipBody(ctx: PaintContext, scene: FrameScene, lineCount: number): void {
	const box = bodyBox(scene, lineCount);
	ctx.beginPath();
	ctx.rect(box.x, box.y, box.width, box.height);
	ctx.clip();
}

/**
 * The cinematic push-in, as a canvas transform.
 *
 * Both DOM renderers write it as `scale(s)` with `transform-origin: 50% r%`. A
 * canvas has no transform-origin, so the same thing is spelled out: move to the
 * origin, scale, move back. The numbers come from the shared `focus-zoom`
 * module, so preview, video and this agree by construction.
 */
function applyZoom(ctx: PaintContext, scene: FrameScene, state: FrameState): void {
	const zoom = state.zoom;
	if (!scene.style.focusZoom || !zoom || zoom.scale === 1) {
		return;
	}
	const box = bodyBox(scene, state.lineCount);
	const originX = box.x + box.width / 2;
	const originY = box.y + zoom.originYRatio * box.height;
	ctx.translate(originX, originY);
	ctx.scale(zoom.scale, zoom.scale);
	ctx.translate(-originX, -originY);
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

/**
 * The typewriter caret: a rounded sliver on the grid, at the character the
 * reveal has reached. The preview draws it as an absolutely positioned span
 * inside the code column, so it belongs inside the same clip the tokens are in.
 */
function paintCaret(
	ctx: PaintContext,
	scene: FrameScene,
	cursor: GridPosition | null | undefined,
): void {
	if (!cursor) {
		return;
	}
	const { code, style } = scene;
	ctx.beginPath();
	ctx.roundRect(
		code.x + cursor.col * code.charWidth,
		code.y + cursor.line * code.lineHeight + code.lineHeight * CARET_TOP_RATIO,
		Math.max(CARET_MIN_WIDTH, code.fontSize * CARET_WIDTH_RATIO),
		code.fontSize * CARET_HEIGHT_RATIO,
		CARET_RADIUS,
	);
	ctx.globalAlpha = CARET_OPACITY;
	ctx.fillStyle = style.theme.foreground;
	ctx.fill();
	ctx.globalAlpha = 1;
}

/**
 * The progress indicator, baked over the background exactly where the
 * composition floats it: a row of pill tracks at the window's width, sitting
 * ten unscaled pixels above the window's top edge.
 */
function paintProgress(ctx: PaintContext, scene: FrameScene, progress: number): void {
	const bar = scene.style.progress;
	if (!bar || bar.style === "none" || bar.segments < 1) {
		return;
	}
	const unit = scene.unit;
	const y = scene.window.y - PROGRESS_OFFSET * unit;
	const height = PROGRESS_HEIGHT * unit;
	const count = bar.style === "bar" ? 1 : bar.segments;
	const gap = PROGRESS_GAP * unit;
	const trackWidth = (scene.window.width - gap * (count - 1)) / count;

	for (let i = 0; i < count; i++) {
		const x = scene.window.x + i * (trackWidth + gap);
		pill(ctx, x, y, trackWidth, height, PROGRESS_TRACK);
		// One bar fills continuously; reels fill segment by segment, each one
		// reading its own slice of the overall progress.
		const fill = clamp01(count === 1 ? progress : progress * count - i);
		if (fill > 0) {
			pill(ctx, x, y, trackWidth * fill, height, PROGRESS_FILL);
		}
	}
}

function pill(
	ctx: PaintContext,
	x: number,
	y: number,
	width: number,
	height: number,
	color: string,
): void {
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, PILL);
	ctx.fillStyle = color;
	ctx.fill();
}

/**
 * The watermark, in canvas pixels rather than card space: the composition
 * anchors it to the video's own bottom-right corner, not to the card, so it
 * stays put whatever the card is scaled to.
 *
 * The DOM positions the text's *line box*; a canvas positions a baseline. The
 * alphabetic baseline is placed at the inset, which puts the descenders a
 * couple of pixels lower than the DOM would. It is the one place this file
 * approximates rather than reproduces, and on a corner watermark that is the
 * right trade against measuring font metrics at paint time.
 */
function paintWatermark(ctx: PaintContext, scene: FrameScene): void {
	const watermark = scene.style.watermark;
	if (!watermark || watermark.text === "") {
		return;
	}
	ctx.font = canvasFont(WATERMARK_SIZE, scene.style.theme.fontFamily);
	ctx.textAlign = "right";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = watermark.color;
	ctx.fillText(
		watermark.text,
		scene.canvas.width - WATERMARK_RIGHT,
		scene.canvas.height - WATERMARK_BOTTOM,
	);
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
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
