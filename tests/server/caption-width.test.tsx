/**
 * The caption band must be exactly as wide as the window it captions.
 *
 * `StepCaption` paints one line and ellipsises the overflow, but ellipsis only
 * engages against a *constraint*. In the video the caption sits in a flex column
 * with `alignItems: center`, where an unconstrained child is sized to its own
 * content: the caption box would simply grow wider than the window, so the
 * ellipsis could never bite and the caption would hang off both sides of the
 * card the fit math measured. The window and the reels bar both pin themselves
 * to `natural.width`; the caption has to do the same.
 *
 * jsdom does no layout, so these assert the structural contract (the declared
 * widths) rather than pixels; the rendered-still measurement lives alongside in
 * the PR description.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepCaption } from "../../src/presentation/components/preview/step-caption";
import { CenteredFrame } from "../../server/remotion/composition";

/** One frame, one character: the narrowest window the fit math can produce. */
const PLAN = {
	frames: [{ lineCount: 1, tokens: [{ key: "x", content: "x", line: 0, col: 0, color: "#fff" }] }],
	transitions: [],
};

/** 80 chars: the longest caption the domain allows, against a one-char code line. */
const LONG_CAPTION = "Sanity checks the reconciled workspace membership invitations table.".padEnd(
	80,
	".",
);

function renderCard(caption: React.ReactNode) {
	return render(
		<CenteredFrame
			plan={PLAN}
			theme={{
				name: "midnight",
				background: "#0b0b0f",
				foreground: "#e6e6ea",
				fontSize: 14,
				fontFamily: "ui-monospace, monospace",
				borderRadius: 12,
			}}
			title="demo.ts"
			windowChrome="macos"
			showLineNumbers={false}
			lineNumberStart={1}
			framePadding={24}
			cardMargin={32}
			canvasWidth={1080}
			canvasHeight={1920}
			caption={caption}
		>
			<div data-testid="code" />
		</CenteredFrame>,
	);
}

/**
 * The stacked children of the content column, in paint order. The column is the
 * only `position: relative` flex column in the card; its in-flow children are the
 * window and (when there is one) the caption band, the reels bar being absolute.
 */
function columnChildren(container: HTMLElement): HTMLElement[] {
	const column = Array.from(container.querySelectorAll<HTMLElement>("div")).find(
		(el) => el.style.flexDirection === "column" && el.style.position === "relative",
	);
	if (!column) {
		throw new Error("content column not found");
	}
	return Array.from(column.children).filter(
		(el): el is HTMLElement => el instanceof HTMLElement && el.style.position !== "absolute",
	);
}

describe("CenteredFrame caption width", () => {
	it("pins the caption band to the window's width", () => {
		const { container } = renderCard(
			<StepCaption text={LONG_CAPTION} opacity={1} color="#fff" scale={2.2} />,
		);
		const [windowEl, captionEl] = columnChildren(container);

		expect(windowEl?.style.width).toMatch(/^\d/);
		expect(captionEl).toBeDefined();
		// Without this the caption box is auto-width and the ellipsis never engages.
		expect(captionEl?.style.width).toBe(windowEl?.style.width);
	});

	it("stacks nothing but the window when there is no caption", () => {
		const { container } = renderCard(null);

		expect(columnChildren(container)).toHaveLength(1);
	});
});
