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

import {
	type Backdrop,
	type ColorStop,
	type GradientShape,
	coverRect,
	linearGradientLine,
	radialGradientRadii,
} from "../backgrounds/backdrop";
import { meshBlobsAt } from "../backgrounds/mesh-gradient";
import {
	CHROME_FONT_STACK,
	CHROME_STYLE,
	CHROME_TEXT_LINE_HEIGHT,
	FRAME_SECONDARY_ALPHA_HEX,
	chromePadY,
	chromeRowHeight,
} from "../layout/frame-metrics";
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
/** What `text-overflow: ellipsis` puts on the end of a line it had to cut. */
const ELLIPSIS = "…";
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

export function paintFrame(ctx: PaintContext, sized: FrameScene, state: FrameState): void {
	paintBackground(ctx, sized, state.timeSeconds);
	paintGrain(ctx, sized, sized.style.grain);

	const scene = fitWindowToFrame(sized, state.lineCount);
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
 * The scene with the window cut to this frame's own height, and the card kept
 * centred on it.
 *
 * Both DOM renderers size the window from its content: `MagicMoveCanvas` is as
 * tall as its line count, which is fractional through a morph, and the column
 * it sits in is centred on the canvas. Only the *fit* is held at the tallest
 * frame, so the card never pumps between steps. `frameScene` resolves the
 * tallest window once for the fit, and the painter used to draw that window on
 * every frame: a three-line step came out in a six-line window, with empty rows
 * under the code and the card sitting higher than the preview puts it.
 */
function fitWindowToFrame(scene: FrameScene, lineCount: number): FrameScene {
	const height = Math.min(
		scene.window.height,
		scene.chromeHeight + bodyBox(scene, lineCount).height,
	);
	const shrink = scene.window.height - height;
	if (shrink <= 0) {
		return scene;
	}
	return {
		...scene,
		card: {
			...scene.card,
			originY: scene.card.originY + (shrink * scene.card.scale) / 2,
			height: scene.card.height - shrink,
		},
		window: { ...scene.window, height },
	};
}

/**
 * The backdrop, whichever of the five kinds the picker produced.
 *
 * Everything but the mesh used to end up as a raw string on `fillStyle`, which
 * takes a *colour* and silently ignores a gradient or a `url(…)`: a preset or an
 * uploaded photo exported as whatever the context happened to hold. Each kind is
 * drawn out properly now, and the glow follows every one of them, exactly as the
 * composition puts it behind every background that is not `None`.
 */
function paintBackground(ctx: PaintContext, scene: FrameScene, timeSeconds: number): void {
	const { width, height } = scene.canvas;
	const backdrop = scene.style.backdrop;
	if (backdrop.kind === "transparent") {
		// The frame before this one has to go, and filling with a transparent
		// colour would not remove it: `source-over` composites that to nothing.
		ctx.clearRect(0, 0, width, height);
		return;
	}
	paintBackdrop(ctx, scene, backdrop, timeSeconds);
	paintGlow(ctx, scene);
}

function paintBackdrop(
	ctx: PaintContext,
	scene: FrameScene,
	backdrop: Backdrop,
	timeSeconds: number,
): void {
	const { width, height } = scene.canvas;
	if (backdrop.kind === "solid") {
		ctx.fillStyle = backdrop.color;
		ctx.fillRect(0, 0, width, height);
		return;
	}
	if (backdrop.kind === "mesh") {
		paintMesh(ctx, scene, timeSeconds);
		return;
	}
	if (backdrop.kind === "linear") {
		const line = linearGradientLine(backdrop.angleDeg, width, height);
		const gradient = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
		for (const stop of backdrop.stops) {
			gradient.addColorStop(stop.offset, stop.color);
		}
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
		return;
	}
	if (backdrop.kind === "radial") {
		paintRadial(ctx, scene, backdrop.shape, backdrop.x, backdrop.y, backdrop.stops);
		return;
	}
	paintBackdropImage(ctx, scene);
}

/**
 * The mesh, bottom-up. CSS stacks `radial-gradient` layers with the first one on
 * top; a canvas paints in the order it is told, so the array is walked backwards
 * over the base colour and the stack comes out the same way round.
 *
 * Each blob is a `radial-gradient(circle at x% y%, colour 0%, transparent R%)`,
 * so it goes through the same radial painter every other radial background uses:
 * one implementation of CSS's sizing rules, not two that can drift apart.
 */
function paintMesh(ctx: PaintContext, scene: FrameScene, timeSeconds: number): void {
	const { width, height } = scene.canvas;
	const preset = scene.style.backdrop.kind === "mesh" ? scene.style.backdrop.preset : null;
	if (!preset) {
		return;
	}
	ctx.fillStyle = preset.base;
	ctx.fillRect(0, 0, width, height);

	const blobs = meshBlobsAt(preset, timeSeconds);
	for (let i = blobs.length - 1; i >= 0; i--) {
		const blob = blobs[i];
		if (!blob) {
			continue;
		}
		paintRadial(ctx, scene, "circle", blob.x, blob.y, [
			{ offset: 0, color: colorWithAlpha(blob.color, 1) },
			{ offset: blob.radius / 100, color: colorWithAlpha(blob.color, 0) },
		]);
	}
}

/**
 * One radial gradient layer, sized the way CSS sizes a farthest-corner one.
 *
 * A canvas gradient is always a circle. CSS's default `ellipse` is that circle
 * squashed on one axis, so the *space* is squashed about the gradient's centre
 * and the covering rectangle is stretched back by the same factor — which is how
 * a two-argument API draws a shape it has no argument for.
 */
function paintRadial(
	ctx: PaintContext,
	scene: FrameScene,
	shape: GradientShape,
	xPercent: number,
	yPercent: number,
	stops: ColorStop[],
): void {
	const { width, height } = scene.canvas;
	const cx = (xPercent / 100) * width;
	const cy = (yPercent / 100) * height;
	const { rx, ry } = radialGradientRadii(shape, cx, cy, width, height);
	const squash = rx === 0 ? 1 : ry / rx;

	const round = squash === 1;
	if (!round) {
		ctx.save();
		ctx.translate(0, cy);
		ctx.scale(1, squash);
		ctx.translate(0, -cy);
	}
	const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
	for (const stop of stops) {
		gradient.addColorStop(stop.offset, stop.color);
	}
	ctx.fillStyle = gradient;
	ctx.fillRect(0, round ? 0 : cy - cy / squash, width, round ? height : height / squash);
	if (!round) {
		ctx.restore();
	}
}

/**
 * The uploaded image, under the `center center / cover` the preview gives it.
 *
 * A missing image is a frame with no backdrop at all rather than a wrong one:
 * the worker refuses to export when it cannot decode the upload, so nothing that
 * reaches a user's disk ever gets here empty.
 */
function paintBackdropImage(ctx: PaintContext, scene: FrameScene): void {
	const backdropImage = scene.style.backdropImage;
	if (!backdropImage) {
		return;
	}
	const { width, height } = scene.canvas;
	const fit = coverRect(backdropImage.width, backdropImage.height, width, height);
	ctx.drawImage(backdropImage.image, fit.x, fit.y, fit.width, fit.height);
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
 *
 * A background of `None` gets none of it, for the same reason both DOM
 * renderers gate it: grain over nothing is grain over whatever the video is
 * eventually laid on.
 */
function paintGrain(ctx: PaintContext, scene: FrameScene, grain: GrainTile | null): void {
	if (!grain || scene.style.backdrop.kind === "transparent") {
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
 * The window chrome, whichever of the three bars the user picked.
 *
 * Two of them used to come out of here as an empty strip with a hairline under
 * it: the painter drew the macOS lights and returned. Each is now laid out as
 * the centred flex row it is in the DOM — padding, then one gap between each
 * child — from the same `CHROME_STYLE` table the component styles itself from.
 *
 * The type is the app's own mono rather than the theme's, because that is what
 * `FrameChrome` sets it in whatever the code is set in.
 */
function paintChrome(ctx: PaintContext, scene: FrameScene): void {
	const { chrome, theme } = scene.style;
	if (chrome === "none") {
		return;
	}
	const unit = scene.unit;
	const { x, y, width } = scene.window;

	if (chrome === "terminal") {
		// The only bar with a fill of its own; it sits under the hairline, and a
		// CSS background covers the border box, so it runs the bar's full height.
		ctx.fillStyle = withHexAlpha(theme.foreground, CHROME_STYLE.terminal.barAlpha);
		ctx.fillRect(x, y, width, scene.chromeHeight);
	}

	// Hairline under the bar, at the bar's own bottom edge.
	ctx.fillStyle = withHexAlpha(theme.foreground, CHROME_STYLE.borderAlpha);
	ctx.fillRect(x, y + scene.chromeHeight - unit, width, unit);

	// The flex row is centred on the content box, which sits inside the padding
	// and above the border.
	const cy = y + (chromePadY(chrome) + chromeRowHeight(chrome) / 2) * unit;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	if (chrome === "macos") {
		paintMacosChrome(ctx, scene, cy);
	} else if (chrome === "browser") {
		paintBrowserChrome(ctx, scene, cy);
	} else {
		paintTerminalChrome(ctx, scene, cy);
	}
	setTracking(ctx, "normal");
}

function paintMacosChrome(ctx: PaintContext, scene: FrameScene, cy: number): void {
	const bar = CHROME_STYLE.macos;
	const unit = scene.unit;
	const { theme, title } = scene.style;
	const size = bar.dot * unit;

	let cx = scene.window.x + bar.padX * unit;
	for (const color of bar.lights) {
		ctx.beginPath();
		ctx.arc(cx + size / 2, cy, size / 2, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
		cx += size + bar.gap * unit;
	}
	if (title === "") {
		return;
	}
	// The title is the fourth flex child, plus its own left margin.
	setTracking(ctx, bar.titleTracking);
	ctx.font = canvasFont(bar.titleSize * unit, CHROME_FONT_STACK);
	ctx.fillStyle = withHexAlpha(theme.foreground, CHROME_STYLE.titleAlpha);
	ctx.fillText(title, cx + bar.gap * unit, cy);
}

/**
 * The browser bar: two nav chevrons, then an address pill centred in whatever
 * room is left once the chevrons and the right-hand spacer have taken theirs.
 *
 * The pill is shrink-to-fit up to its `max-width`, and its text ellipsises
 * inside it, so both have to be measured rather than assumed — which is why this
 * is the one bar whose layout depends on the string it is given.
 */
function paintBrowserChrome(ctx: PaintContext, scene: FrameScene, cy: number): void {
	const bar = CHROME_STYLE.browser;
	const unit = scene.unit;
	const { theme, title } = scene.style;
	const left = scene.window.x + bar.padX * unit;
	const contentWidth = scene.window.width - 2 * bar.padX * unit;

	setTracking(ctx, "normal");
	ctx.font = canvasFont(bar.chevronSize * unit, CHROME_FONT_STACK);
	ctx.fillStyle = withHexAlpha(theme.foreground, bar.chevronAlpha);
	let cx = left;
	for (const chevron of bar.chevrons) {
		ctx.fillText(chevron, cx, cy);
		cx += ctx.measureText(chevron).width + bar.chevronGap * unit;
	}
	// The last chevron added a gap that is not there; take it back.
	const chevronWidth = cx - bar.chevronGap * unit - left;

	// The middle child is `flex: 1`, so it takes everything the other two leave.
	const flexLeft = left + chevronWidth + bar.gap * unit;
	const flexWidth = contentWidth - chevronWidth - bar.spacer * unit - 2 * bar.gap * unit;
	if (flexWidth <= 0) {
		return;
	}

	setTracking(ctx, bar.titleTracking);
	ctx.font = canvasFont(bar.titleSize * unit, CHROME_FONT_STACK);
	const padX = bar.pillPadX * unit;
	const maxPill = bar.pillMaxWidth * flexWidth;
	const pillWidth = Math.min(ctx.measureText(title).width + 2 * padX, maxPill);
	const pillHeight = (2 * bar.pillPadY + bar.titleSize * CHROME_TEXT_LINE_HEIGHT) * unit;
	const pillX = flexLeft + (flexWidth - pillWidth) / 2;

	ctx.beginPath();
	ctx.roundRect(pillX, cy - pillHeight / 2, pillWidth, pillHeight, bar.pillRadius);
	ctx.fillStyle = withHexAlpha(theme.foreground, bar.pillAlpha);
	ctx.fill();

	if (title === "") {
		return;
	}
	// `text-overflow: ellipsis` on a centred line: the text is clipped to the
	// pill's content box, so a long title loses its tail rather than the pill.
	const label = truncate(ctx, title, pillWidth - 2 * padX);
	ctx.textAlign = "center";
	ctx.fillStyle = withHexAlpha(theme.foreground, CHROME_STYLE.titleAlpha);
	ctx.fillText(label, pillX + pillWidth / 2, cy);
	ctx.textAlign = "left";
}

/** The terminal bar: a prompt glyph at a weight of its own, then the title. */
function paintTerminalChrome(ctx: PaintContext, scene: FrameScene, cy: number): void {
	const bar = CHROME_STYLE.terminal;
	const unit = scene.unit;
	const { theme, title } = scene.style;
	const left = scene.window.x + bar.padX * unit;

	setTracking(ctx, "normal");
	ctx.font = canvasFont(bar.promptSize * unit, CHROME_FONT_STACK, undefined, bar.promptWeight);
	ctx.fillStyle = withHexAlpha(theme.foreground, bar.promptAlpha);
	ctx.fillText(bar.prompt, left, cy);
	const promptWidth = ctx.measureText(bar.prompt).width;

	if (title === "") {
		return;
	}
	setTracking(ctx, bar.titleTracking);
	ctx.font = canvasFont(bar.titleSize * unit, CHROME_FONT_STACK);
	ctx.fillStyle = withHexAlpha(theme.foreground, CHROME_STYLE.titleAlpha);
	ctx.fillText(title, left + promptWidth + bar.gap * unit, cy);
}

/**
 * CSS tracking, where a context has it.
 *
 * Set before measuring as well as before drawing: the address pill is sized from
 * the width of its own text, so a measurement taken at the wrong tracking would
 * put the pill in the wrong place as well as the wrong size.
 */
function setTracking(ctx: PaintContext, tracking: string): void {
	if (ctx.letterSpacing !== undefined) {
		// A context's `letterSpacing` takes a length and nothing else: CSS's
		// `normal` is silently ignored, exactly like a gradient on `fillStyle`.
		// Measured: after "-0.02em", assigning "normal" reads back "-0.02em". The
		// reset after a chrome title was therefore a no-op, and every glyph of code
		// under it was drawn tracked tighter than its grid cell, opening a gap after
		// each long token that the preview never shows. Zero is what CSS means.
		ctx.letterSpacing = tracking === "normal" ? "0px" : tracking;
	}
}

/** A string cut to fit a width, with the ellipsis CSS would have added. */
function truncate(ctx: PaintContext, text: string, maxWidth: number): string {
	if (maxWidth <= 0) {
		return "";
	}
	if (ctx.measureText(text).width <= maxWidth) {
		return text;
	}
	let cut = text;
	while (cut.length > 0 && ctx.measureText(`${cut}${ELLIPSIS}`).width > maxWidth) {
		cut = cut.slice(0, -1);
	}
	return cut === "" ? "" : `${cut}${ELLIPSIS}`;
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
	ctx.fillStyle = withHexAlpha(style.theme.foreground, FRAME_SECONDARY_ALPHA_HEX);
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

/**
 * The DOM's `#rrggbbAA` shorthand, as an rgba the context understands. The alpha
 * is passed as the same two hex digits the components write (`26`, `59`, `0f`),
 * so a tint can be checked against the CSS by eye rather than by arithmetic.
 */
function withHexAlpha(color: string, hexAlpha: string): string {
	return colorWithAlpha(color, Number.parseInt(hexAlpha, 16) / 255);
}
