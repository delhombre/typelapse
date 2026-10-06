/**
 * One card width and one text scale, read by all three renderers.
 *
 * Measured by the on-device export QA of 2026-10-03 at 1080p, before this: the
 * DOM preview drew its window 1270 px wide at a text scale of 2.089, the
 * composition 1263 px at 2.2 (a nominal 0.62 advance), the painter 1226.7 px at
 * 2.2 (its measured 0.60). The canonical numbers are `fitCardToCanvas` at
 * `renderScaleFor(canvas, BASE_VIDEO_SCALE)` with `CANVAS_MARGIN` and the
 * measured advance; each caller below has to land on exactly those.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CenteredFrame } from "../../server/remotion/composition";
import {
	BASE_VIDEO_SCALE,
	CANVAS_MARGIN,
	fitCardToCanvas,
	previewCardPlacement,
	renderScaleFor,
} from "../../src/application/layout/canvas-fit";
import { CHROME_STYLE, CHROME_TEXT_LINE_HEIGHT } from "../../src/application/layout/frame-metrics";
import { DEFAULT_TRANSITION_EASING } from "../../src/application/magic-move/easing";
import type { MagicMovePlan } from "../../src/application/magic-move/engine";
import type { ClientExportJob } from "../../src/infrastructure/export/client-export-job";
import { sceneFor } from "../../src/infrastructure/export/client-export-scene";
import { FrameChrome } from "../../src/presentation/components/preview/frame-chrome";

const FG = "#e6edf3";
const PLAN = {
	frames: [
		{
			lineCount: 3,
			tokens: [
				{ key: "a", content: "function greet(name: string) {", line: 0, col: 0, color: FG },
				{ key: "b", content: "return name;", line: 1, col: 2, color: FG },
				{ key: "c", content: "}", line: 2, col: 0, color: FG },
			],
		},
		{
			lineCount: 5,
			tokens: [
				{ key: "d", content: 'console.log(greet("Typelapse"));', line: 4, col: 0, color: FG },
			],
		},
	],
	transitions: [],
};

/** JetBrains Mono's advance, which is what every scope measures for it. */
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

const CANVASES: [number, number][] = [
	[1920, 1080],
	[1080, 1920],
	[3840, 2160],
];

function canonical(canvasWidth: number, canvasHeight: number) {
	const unit = renderScaleFor(canvasWidth, canvasHeight, BASE_VIDEO_SCALE);
	const fit = fitCardToCanvas({
		plan: PLAN,
		...SETTINGS,
		fontSize: THEME.fontSize,
		captions: [],
		scale: unit,
		canvasWidth,
		canvasHeight,
		canvasMargin: CANVAS_MARGIN,
		charWidthRatio: ADVANCE,
	});
	return { fit, unit, textScale: unit * fit.scale };
}

describe.each(CANVASES)("the canonical card at %ix%i", (canvasWidth, canvasHeight) => {
	const expected = canonical(canvasWidth, canvasHeight);

	it("is what the Remotion composition draws", () => {
		const { container } = render(
			<CenteredFrame
				plan={PLAN}
				theme={THEME}
				title="greet.ts"
				windowChrome={SETTINGS.chrome}
				showLineNumbers={SETTINGS.showLineNumbers}
				lineNumberStart={SETTINGS.lineNumberStart}
				framePadding={SETTINGS.padding}
				cardMargin={SETTINGS.cardMargin}
				canvasWidth={canvasWidth}
				canvasHeight={canvasHeight}
				videoScale={expected.unit}
				charWidthRatio={ADVANCE}
			>
				<div />
			</CenteredFrame>,
		);
		// The content column is the card's only relative flex column; the window is
		// its first in-flow child and the scaled card is its parent.
		const column = Array.from(container.querySelectorAll<HTMLElement>("div")).find(
			(el) => el.style.flexDirection === "column" && el.style.position === "relative",
		);
		const card = column?.parentElement;
		const windowEl = Array.from(column?.children ?? []).find(
			(el): el is HTMLElement => el instanceof HTMLElement && el.style.position !== "absolute",
		);
		expect(Number.parseFloat(windowEl?.style.width ?? "")).toBeCloseTo(
			expected.fit.natural.width,
			6,
		);
		expect(Number.parseFloat(card?.style.transform.slice("scale(".length) ?? "")).toBeCloseTo(
			expected.fit.scale,
			6,
		);
	});

	it("is what the Canvas painter draws", () => {
		const scene = sceneFor(jobAt(canvasWidth, canvasHeight), ADVANCE, {
			grain: null,
			backdropImage: null,
		});
		expect(scene.window.width).toBeCloseTo(expected.fit.natural.width, 6);
		expect(scene.card.scale).toBeCloseTo(expected.fit.scale, 6);
		expect(scene.unit * scene.card.scale).toBeCloseTo(expected.textScale, 6);
	});

	it("is what the DOM preview draws, whatever size its box is", () => {
		for (const boxWidth of [640, 932, canvasWidth]) {
			const placement = previewCardPlacement({
				plan: PLAN,
				...SETTINGS,
				fontSize: THEME.fontSize,
				captions: [],
				canvasWidth,
				canvasHeight,
				charWidthRatio: ADVANCE,
				boxWidth,
			});
			const toCanvas = canvasWidth / boxWidth;
			// The window is laid out at editor size, then scaled: in canvas pixels it
			// has to come out exactly as wide as the exporters draw it.
			expect(placement.windowWidth * placement.cardScale * toCanvas).toBeCloseTo(
				expected.fit.natural.width * expected.fit.scale,
				6,
			);
			// And the 14px editor type lands at the exporters' text scale.
			expect(placement.cardScale * toCanvas).toBeCloseTo(expected.textScale, 6);
		}
	});
});

function jobAt(width: number, height: number): ClientExportJob {
	return {
		plan: PLAN as unknown as MagicMovePlan,
		durations: [1000, 1000],
		firstCode: "",
		focus: [[], []],
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
		title: "greet.ts",
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

/**
 * The bar the card's height is budgeted on (`chromeBarHeight`) has to be the
 * bar both DOM renderers lay out. Left to inherit, its title took the studio's
 * 1.5 line height in the preview and `normal` in headless Chrome, and its
 * hairline stayed 1px while the painter drew it at the card's scale: the
 * preview's window came out 4.7 px taller than the exporters' at 1080p.
 */
describe.each(["macos", "browser", "terminal"] as const)("the %s bar", (chrome) => {
	it.each([1, 2.2, 4.4])("sets its own line height and scales its hairline at %s", (scale) => {
		const { container } = render(
			<FrameChrome chrome={chrome} title="greet.ts" foreground={FG} scale={scale} />,
		);
		const bar = container.firstElementChild as HTMLElement;
		expect(bar.style.lineHeight).toBe(String(CHROME_TEXT_LINE_HEIGHT));
		expect(Number.parseFloat(bar.style.borderBottomWidth)).toBeCloseTo(
			CHROME_STYLE.border * scale,
			6,
		);
	});
});
