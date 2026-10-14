/**
 * A pasted minified line (#331). Shiki gives up on a line past
 * `tokenizeMaxLineLength` and hands it back as one token whose colour is the
 * empty string. Left alone, "" survives the plan: the DOM preview inherits the
 * card's foreground for it, while the canvas painter keeps "" (`??` only
 * replaces null) and `fillStyle = ""` is ignored, so the device export would
 * paint the line in whatever colour the previous token left behind. The three
 * renderers have to paint that line alike, in the theme foreground.
 */

import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import { renderStatic } from "@/application/magic-move/engine";
import { buildMagicMovePlan } from "@/infrastructure/highlighting/magic-move-keyer";
import { MAX_TOKENIZED_LINE_COLUMNS } from "@/infrastructure/highlighting/whole-line-tokenization";
import { MagicMoveCanvas } from "@/presentation/components/preview/magic-move-canvas";
import { cleanup, render } from "@testing-library/react";
import { type Highlighter, createHighlighter } from "shiki";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { RecordingContext } from "../application/support/recording-context";

const BG = "#0d1117";
const FOREGROUND = "#e6edf3";
const SHORT = "const total = items.length;";
const MINIFIED_UNIT = 'function f(a,b){return a.map(x=>x+b.c("s"))}var n=0;';
const minified = (columns: number) =>
	MINIFIED_UNIT.repeat(Math.ceil(columns / MINIFIED_UNIT.length)).slice(0, columns);
const PASTED = minified(200_000);

afterEach(cleanup);

let highlighter: Highlighter;
beforeAll(async () => {
	highlighter = await createHighlighter({ themes: ["github-dark"], langs: ["typescript"] });
	// Warm the grammar so the timing below measures the line, not the first load.
	buildMagicMovePlan(highlighter, [SHORT], "typescript", "midnight", BG);
});

const plan = (code: string) =>
	buildMagicMovePlan(highlighter, [SHORT, code], "typescript", "midnight", BG);

describe("a pasted minified line (#331)", () => {
	it("tokenizes a 200,000-column line in under 200 ms", () => {
		// One frame, no morph: the clock covers tokenization, which is what the cap
		// bounds. Uncapped this is seconds, capped a few milliseconds, so 200 ms
		// holds with room to spare on a loaded runner.
		const started = performance.now();
		const [frame] = buildMagicMovePlan(highlighter, [PASTED], "typescript", "midnight", BG).frames;
		expect(performance.now() - started).toBeLessThan(200);
		expect(frame?.tokens).toHaveLength(1);
	});

	it("caps at the column, not before: one column short is still highlighted", () => {
		const under = plan(minified(MAX_TOKENIZED_LINE_COLUMNS - 1)).frames[1]?.tokens ?? [];
		const at = plan(minified(MAX_TOKENIZED_LINE_COLUMNS)).frames[1]?.tokens ?? [];
		expect(under.length).toBeGreaterThan(1);
		expect(at).toHaveLength(1);
	});

	it("plans the capped line without Shiki's empty colour", () => {
		const capped = plan(PASTED).frames[1]?.tokens ?? [];
		expect(capped.length).toBeGreaterThan(0);
		for (const token of capped) {
			expect(token.color).not.toBe("");
		}
	});

	it("draws the capped line in the theme foreground in the DOM preview", () => {
		const tokens = renderStatic(plan(PASTED).frames[1]?.tokens ?? []);
		const { container } = render(
			<MagicMoveCanvas
				tokens={tokens}
				lineCount={1}
				fontSize={14}
				lineHeightRatio={1.6}
				fontFamily="monospace"
				color={FOREGROUND}
				padding={8}
			/>,
		);
		const span = container.querySelector<HTMLElement>("span");
		// The colour a browser resolves: the nearest inline colour, own or inherited.
		let element: HTMLElement | null = span;
		while (element && element.style.color === "") {
			element = element.parentElement;
		}
		expect(element?.style.color).toBe("rgb(230, 237, 243)");
	});

	it("paints the capped line in the theme foreground on the canvas", () => {
		const input: FrameSceneInput = {
			canvasWidth: 1280,
			canvasHeight: 720,
			plan: { frames: [{ lineCount: 1, tokens: [{ col: 0, content: "x" }] }] },
			theme: {
				background: BG,
				foreground: FOREGROUND,
				fontFamily: "monospace",
				fontSize: 14,
				borderRadius: 12,
			},
			title: "pasted.js",
			chrome: "none",
			background: BG,
			padding: 24,
			cardMargin: 32,
			showLineNumbers: false,
			lineNumberStart: 1,
			charWidthRatio: 0.6,
			scale: 1,
			canvasMargin: 0.05,
			grain: null,
		};
		const tokens = renderStatic(plan(PASTED).frames[1]?.tokens ?? []);
		const ctx = new RecordingContext();
		paintFrame(ctx, frameScene(input), {
			tokens,
			lineCount: 1,
			lineNumberCount: 1,
			timeSeconds: 0,
		});
		const first = tokens[0]?.content ?? "";
		const drawn = ctx.commands.findIndex((command) =>
			command.startsWith(`fillText(${JSON.stringify(first)}`),
		);
		expect(drawn).toBeGreaterThan(-1);
		const style = ctx.commands
			.slice(0, drawn)
			.reverse()
			.find((command) => command.startsWith("fillStyle="));
		expect(style).toBe(`fillStyle=${FOREGROUND}`);
	});
});
