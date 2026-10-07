/**
 * The readable floor: a card never draws its code below `MIN_TEXT_PX` on the
 * export canvas. Content that does not fit at the floor is clipped by the window
 * with a fade on the clipped edge, instead of shrinking the card to a dot (the
 * studio QA of 2026-10-03 saw a 10,000-character line do exactly that).
 *
 * One rule in `canvas-fit`, read by the three renderers, so the Remotion
 * composition, the Canvas painter and the DOM preview clip the same window.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CenteredFrame } from "../../server/remotion/composition";
import { paintFrame } from "../../src/application/frame-painter/painter";
import {
	BASE_VIDEO_SCALE,
	CANVAS_MARGIN,
	MIN_TEXT_PX,
	REFERENCE_SHORT_EDGE,
	VISIBLE_COL_LIMIT,
	VISIBLE_ROW_LIMIT,
	clipFades,
	fitCardToCanvas,
	previewCardPlacement,
	renderScaleFor,
} from "../../src/application/layout/canvas-fit";
import { fitScale } from "../../src/application/layout/fit-scale";
import {
	LINE_HEIGHT_RATIO,
	captionBandLines,
	captionBlockHeight,
	chromeBarHeight,
} from "../../src/application/layout/frame-metrics";
import { DEFAULT_TRANSITION_EASING } from "../../src/application/magic-move/easing";
import type { MagicMovePlan } from "../../src/application/magic-move/engine";
import { ASPECT_LABELS, dimensionsFor } from "../../src/domain/entities/render-config";
import type { ClientExportJob } from "../../src/infrastructure/export/client-export-job";
import { sceneFor } from "../../src/infrastructure/export/client-export-scene";
import { FocusZoomBody } from "../../src/presentation/components/preview/focus-zoom-body";
import { MagicMoveCanvas } from "../../src/presentation/components/preview/magic-move-canvas";
import { RecordingContext, round } from "./support/recording-context";

const FG = "#e6edf3";
const ADVANCE = 0.6;
const THEME = {
	name: "midnight",
	background: "#0d1117",
	foreground: FG,
	fontFamily: "'JetBrains Mono', monospace",
	fontSize: 14,
	borderRadius: 12,
};
const SETTINGS = {
	chrome: "macos" as const,
	padding: 24,
	cardMargin: 32,
	showLineNumbers: true,
	lineNumberStart: 1,
};

const LONG_LINE = {
	frames: [{ lineCount: 1, tokens: [{ key: "l", content: "x".repeat(10_000), line: 0, col: 0 }] }],
	transitions: [],
};
const TALL_FILE = {
	frames: [
		{
			lineCount: 3_000,
			tokens: Array.from({ length: 3_000 }, (_, line) => ({
				key: `t${line}`,
				content: "const value = 1;",
				line,
				col: 0,
			})),
		},
	],
	transitions: [],
};
const SHORT = {
	frames: [{ lineCount: 3, tokens: [{ key: "a", content: "return name;", line: 0, col: 0 }] }],
	transitions: [],
};

function fitAt(
	plan: typeof LONG_LINE,
	canvasWidth: number,
	canvasHeight: number,
	captions: readonly string[] = [],
) {
	const scale = renderScaleFor(canvasWidth, canvasHeight, BASE_VIDEO_SCALE);
	return {
		scale,
		fit: fitCardToCanvas({
			plan,
			...SETTINGS,
			fontSize: THEME.fontSize,
			captions,
			scale,
			canvasWidth,
			canvasHeight,
			canvasMargin: CANVAS_MARGIN,
			charWidthRatio: ADVANCE,
		}),
	};
}

/** Code text height in canvas px, scaled back to the 1080p reference. */
function referenceTextPx(scale: number, fitScaleValue: number, canvasShortEdge: number) {
	return (THEME.fontSize * scale * fitScaleValue * REFERENCE_SHORT_EDGE) / canvasShortEdge;
}

describe("the readable floor", () => {
	it("holds a 10,000-character line at the floor on 9:16 and clips its right edge", () => {
		const { scale, fit } = fitAt(LONG_LINE, 1080, 1920);
		expect(referenceTextPx(scale, fit.scale, 1080)).toBeCloseTo(MIN_TEXT_PX, 6);
		expect(fit.clip).toEqual({ right: true, bottom: false });
		// The clipped card fills the safe width exactly and no more.
		const padded = fit.natural.width + 2 * SETTINGS.cardMargin * scale;
		expect(padded * fit.scale).toBeCloseTo(1080 * (1 - 2 * CANVAS_MARGIN), 6);
	});

	it.each([
		[1920, 1080],
		[3840, 2160],
	])("clips a 10,000-character line at the floor's window on %ix%i, above the floor", (w, h) => {
		const { scale, fit } = fitAt(LONG_LINE, w, h);
		const tall = fitAt(LONG_LINE, 1080, 1920);
		// The window 9:16 gets at the floor, in editor px: one column limit.
		expect(fit.natural.width / scale).toBeCloseTo(tall.fit.natural.width / tall.scale, 6);
		expect(referenceTextPx(scale, fit.scale, Math.min(w, h))).toBeGreaterThan(MIN_TEXT_PX);
		expect(fit.clip).toEqual({ right: true, bottom: false });
		// The card is fit, not floored: it fills the safe width.
		const padded = fit.natural.width + 2 * SETTINGS.cardMargin * scale;
		expect(padded * fit.scale).toBeCloseTo(w * (1 - 2 * CANVAS_MARGIN), 6);
	});

	it("counts the caption's lines on the width the clipped window is drawn at", () => {
		const caption = "Sanity checks the reconciled workspace membership invitations table.".padEnd(
			80,
			".",
		);
		const { scale, fit } = fitAt(LONG_LINE, 120, 2000, [caption]);

		expect(fit.clip?.right).toBe(true);
		// The band sits under the window as drawn, so its lines follow the drawn width.
		expect(fit.captionLines).toBe(captionBandLines([caption], fit.natural.width, scale));
		expect(fit.windowHeight).toBeCloseTo(
			fit.natural.height - captionBlockHeight(fit.captionLines, scale),
			6,
		);
	});

	it("holds a 3,000-line file at the floor and clips its bottom edge", () => {
		const { scale, fit } = fitAt(TALL_FILE, 1920, 1080);
		expect(referenceTextPx(scale, fit.scale, 1080)).toBeCloseTo(MIN_TEXT_PX, 6);
		expect(fit.clip).toEqual({ right: false, bottom: true });
		const padded = fit.natural.height + 2 * SETTINGS.cardMargin * scale;
		expect(padded * fit.scale).toBeCloseTo(1080 * (1 - 2 * CANVAS_MARGIN), 6);
		expect(fit.windowHeight).toBeCloseTo(fit.natural.height, 6);
	});

	it("leaves a card above the floor exactly as it was", () => {
		const { scale, fit } = fitAt(SHORT, 1920, 1080);
		expect(fit.clip).toBeNull();
		const padding = 2 * SETTINGS.cardMargin * scale;
		expect(fit.scale).toBe(
			fitScale(
				fit.natural.width + padding,
				fit.natural.height + padding,
				1920 * (1 - 2 * CANVAS_MARGIN),
				1080 * (1 - 2 * CANVAS_MARGIN),
			),
		);
	});

	it("budgets the plan window for every shipped canvas, with a margin", () => {
		const tallest = Math.max(
			...ASPECT_LABELS.map((aspect) => {
				const { width, height } = dimensionsFor(aspect, "1080p");
				return Math.max(width, height) / Math.min(width, height);
			}),
		);
		const safeLong = tallest * REFERENCE_SHORT_EDGE * (1 - 2 * CANVAS_MARGIN);
		// Rows: the line height at the floor. Columns: the narrowest advance a code
		// font is allowed to measure.
		expect(VISIBLE_ROW_LIMIT).toBeGreaterThanOrEqual(safeLong / (MIN_TEXT_PX * LINE_HEIGHT_RATIO));
		expect(VISIBLE_COL_LIMIT).toBeGreaterThanOrEqual(safeLong / (MIN_TEXT_PX * 0.5));
		const { scale, fit } = fitAt(TALL_FILE, 1080, 1920);
		const lineHeight = THEME.fontSize * scale * LINE_HEIGHT_RATIO;
		const visibleRows = (fit.windowHeight - chromeBarHeight("macos", scale)) / lineHeight;
		expect(visibleRows).toBeLessThan(VISIBLE_ROW_LIMIT);
	});
});

function jobFor(plan: typeof LONG_LINE, width: number, height: number): ClientExportJob {
	return {
		plan: plan as unknown as MagicMovePlan,
		durations: [1000],
		firstCode: "",
		focus: [[]],
		width,
		height,
		fps: 30,
		format: "mp4",
		transitionMs: 650,
		transitionEasing: DEFAULT_TRANSITION_EASING,
		loop: false,
		typewriter: false,
		focusZoom: false,
		theme: THEME,
		title: "long.ts",
		background: "mesh:solar",
		chrome: SETTINGS.chrome,
		padding: SETTINGS.padding,
		cardMargin: SETTINGS.cardMargin,
		showLineNumbers: SETTINGS.showLineNumbers,
		lineNumberStart: SETTINGS.lineNumberStart,
		progress: null,
		watermark: null,
		documentCharWidthRatio: ADVANCE,
	};
}

describe.each([
	["the long line", LONG_LINE],
	["the tall file", TALL_FILE],
])("three renderers clip %s the same way", (_name, plan) => {
	const { scale, fit } = fitAt(plan, 1920, 1080);
	const fades = clipFades({
		clip: fit.clip,
		windowWidth: fit.natural.width,
		windowHeight: fit.windowHeight,
		chromeHeight: chromeBarHeight(SETTINGS.chrome, scale),
		fontSize: THEME.fontSize * scale,
	});

	it("the painter clips the window and paints the fades", () => {
		expect(fit.lineClip !== null).toBe(plan === LONG_LINE);
		const scene = sceneFor(jobFor(plan, 1920, 1080), ADVANCE, {
			grain: null,
			backdropImage: null,
		});
		expect(scene.window.width).toBeCloseTo(fit.natural.width, 6);
		expect(scene.window.height).toBeCloseTo(fit.windowHeight, 6);
		expect(scene.card.scale).toBeCloseTo(fit.scale, 6);
		expect(scene.fades).toEqual(fades);

		const ctx = new RecordingContext();
		paintFrame(ctx, scene, {
			tokens: [],
			lineCount: plan.frames[0]?.lineCount ?? 1,
			lineNumberCount: plan.frames[0]?.lineCount ?? 1,
			timeSeconds: 0,
		});
		const right = scene.window.x + scene.window.width;
		const bottom = scene.window.y + scene.window.height;
		for (const fade of fades) {
			const rect =
				fade.edge === "right"
					? [
							right - fade.width,
							scene.window.y + fade.y,
							fade.width,
							bottom - scene.window.y - fade.y,
						]
					: [scene.window.x, bottom - fade.height, scene.window.width, fade.height];
			const [x, y, w, h] = rect.map(round) as [number, number, number, number];
			const id =
				fade.edge === "right"
					? `linear(${x},0,${round(x + w)},0)`
					: `linear(0,${y},0,${round(y + h)})`;
			expect(ctx.commands).toContain(
				`fillStyle=${id}[0:${THEME.background}00|1:${THEME.background}]`,
			);
			expect(ctx.commands).toContain(`fillRect(${x},${y},${w},${h})`);
		}
		// A long line is cut in the code column, through the fit's columns.
		expect(scene.lineClip).toEqual(fit.lineClip);
	});

	it("the composition clips the window and lays the same fades", () => {
		const { container } = render(
			<CenteredFrame
				plan={plan}
				theme={THEME}
				title="long.ts"
				windowChrome={SETTINGS.chrome}
				showLineNumbers={SETTINGS.showLineNumbers}
				lineNumberStart={SETTINGS.lineNumberStart}
				framePadding={SETTINGS.padding}
				cardMargin={SETTINGS.cardMargin}
				canvasWidth={1920}
				canvasHeight={1080}
				videoScale={scale}
				charWidthRatio={ADVANCE}
			>
				{(lineClip) => (
					<MagicMoveCanvas
						tokens={plan.frames[0]?.tokens.slice(0, 1).map((t) => ({ ...t, opacity: 1 })) ?? []}
						lineCount={plan.frames[0]?.lineCount ?? 1}
						fontSize={THEME.fontSize * scale}
						lineHeightRatio={LINE_HEIGHT_RATIO}
						fontFamily={THEME.fontFamily}
						color={FG}
						padding={SETTINGS.padding * scale}
						lineClip={lineClip}
					/>
				)}
			</CenteredFrame>,
		);
		const windowEl = container.querySelector<HTMLElement>("[data-code-window]");
		expect(Number.parseFloat(windowEl?.style.width ?? "")).toBeCloseTo(fit.natural.width, 6);
		expect(Number.parseFloat(windowEl?.style.maxHeight ?? "")).toBeCloseTo(fit.windowHeight, 6);
		expectFades(container, fades, 1);
		// The code column gets the fit's line clip, as the painter's scene does.
		const token = plan.frames[0]?.tokens[0]?.content;
		const column = [...(windowEl?.querySelectorAll<HTMLElement>("span") ?? [])].find(
			(span) => span.textContent === token,
		)?.parentElement;
		const clip = fit.lineClip;
		expect(column?.style.maskImage).toBe(
			clip
				? `linear-gradient(to right, #000 ${clip.fadeStart}ch, transparent ${clip.fadeEnd}ch)`
				: "",
		);
	});

	it("the preview clips the window at editor size and lays the same fades", () => {
		const boxWidth = 960;
		const placement = previewCardPlacement({
			plan,
			...SETTINGS,
			fontSize: THEME.fontSize,
			captions: [],
			canvasWidth: 1920,
			canvasHeight: 1080,
			charWidthRatio: ADVANCE,
			boxWidth,
		});
		expect(placement.windowWidth).toBeCloseTo(fit.natural.width / scale, 6);
		expect(placement.windowHeight).toBeCloseTo(fit.windowHeight / scale, 6);
		expect(placement.clip).toEqual(fit.clip);
		expect(placement.lineClip).toEqual(fit.lineClip);
	});
});

describe("the long line under the push-in, in the DOM", () => {
	it("keeps the window's right fade on the window and moves the column fade with the code", () => {
		const { scale, fit } = fitAt(LONG_LINE, 1920, 1080);
		const { container } = render(
			<CenteredFrame
				plan={LONG_LINE}
				theme={THEME}
				title="long.ts"
				windowChrome={SETTINGS.chrome}
				showLineNumbers={SETTINGS.showLineNumbers}
				lineNumberStart={SETTINGS.lineNumberStart}
				framePadding={SETTINGS.padding}
				cardMargin={SETTINGS.cardMargin}
				canvasWidth={1920}
				canvasHeight={1080}
				videoScale={scale}
				charWidthRatio={ADVANCE}
			>
				{(lineClip) => (
					<FocusZoomBody
						zoom={{ scale: 1.25, originYRatio: 0.5 }}
						active
						borderRadius={THEME.borderRadius * scale}
					>
						<MagicMoveCanvas
							tokens={LONG_LINE.frames[0]?.tokens.map((t) => ({ ...t, opacity: 1 })) ?? []}
							lineCount={1}
							fontSize={THEME.fontSize * scale}
							lineHeightRatio={LINE_HEIGHT_RATIO}
							fontFamily={THEME.fontFamily}
							color={FG}
							padding={SETTINGS.padding * scale}
							lineClip={lineClip}
						/>
					</FocusZoomBody>
				)}
			</CenteredFrame>,
		);
		const windowEl = container.querySelector<HTMLElement>("[data-code-window]");
		const fade = windowEl?.querySelector<HTMLElement>("[data-clip-fade='right']");
		// The window's fade is the window's child: the push-in never scales it.
		expect(fade?.parentElement).toBe(windowEl);
		const column = [...(windowEl?.querySelectorAll<HTMLElement>("span") ?? [])].find(
			(span) => span.textContent?.length === 10_000,
		)?.parentElement;
		expect(column?.style.maskImage).toContain(`${fit.lineClip?.fadeStart}ch`);
		// The masked column sits inside the scaled box, as the painter's fade sits inside its zoom.
		let scaled: HTMLElement | null | undefined = column;
		while (scaled && !scaled.style.transform.startsWith("scale(")) {
			scaled = scaled.parentElement;
		}
		expect(scaled?.style.transform).toBe("scale(1.25)");
		expect(windowEl?.contains(scaled ?? null)).toBe(true);
	});
});

/** The DOM fades, in the window's own px, divided by `unit` for an editor-size window. */
function expectFades(container: HTMLElement, fades: ReturnType<typeof clipFades>, unit: number) {
	const els = Array.from(container.querySelectorAll<HTMLElement>("[data-clip-fade]"));
	expect(els.map((el) => el.dataset.clipFade).sort()).toEqual(
		fades.map((fade) => fade.edge).sort(),
	);
	// Anchored to the window's right and bottom edges, so a step shorter than the
	// clipped window still fades at its own edge, as the painter does.
	for (const fade of fades) {
		const el = els.find((candidate) => candidate.dataset.clipFade === fade.edge);
		expect(el?.style.right).toBe("0px");
		expect(el?.style.bottom).toBe("0px");
		if (fade.edge === "right") {
			expect(Number.parseFloat(el?.style.top ?? "")).toBeCloseTo(fade.y / unit, 6);
			expect(Number.parseFloat(el?.style.width ?? "")).toBeCloseTo(fade.width / unit, 6);
		} else {
			expect(el?.style.left).toBe("0px");
			expect(Number.parseFloat(el?.style.height ?? "")).toBeCloseTo(fade.height / unit, 6);
		}
	}
}
