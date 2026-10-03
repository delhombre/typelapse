/**
 * The plan window follows the story (#104): the focus band when a step has one,
 * else the first line the step changes against its neighbour, else the top. A
 * file that fits the window never scrolls, and between two steps the window
 * moves on the morph's own easing, so the three renderers scroll together.
 */

import { videoScript } from "@/application/export/video-script";
import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import { VISIBLE_ROW_LIMIT } from "@/application/layout/canvas-fit";
import { scrolledGutter } from "@/application/line-numbers/gutter";
import { DEFAULT_TRANSITION_EASING, cubicBezierAt } from "@/application/magic-move/easing";
import { ZOOM_SCALE, zoomForFocus } from "@/application/magic-move/focus-zoom";
import { type PlanKeyer, planMagicMove } from "@/application/magic-move/plan";
import { WINDOW_LEAD_ROWS, firstChangedRow, planWindowRows } from "@/application/magic-move/window";
import { describe, expect, it } from "vitest";
import { RecordingContext } from "./support/recording-context";

interface FakeSource {
	code: string;
	tokens: { key: string; content: string; offset: number }[];
}

/** One token per line, keyed by content, so unchanged lines keep their key. */
const keyer: PlanKeyer<FakeSource> = {
	tokenize(code) {
		const tokens: FakeSource["tokens"] = [];
		for (const match of code.matchAll(/\S[^\n]*/g)) {
			tokens.push({ key: match[0], content: match[0], offset: match.index ?? 0 });
		}
		return { code, tokens };
	},
	sync: (from, to) => ({ from, to }),
};

const file = (count: number, edit?: { line: number; text: string }) =>
	Array.from({ length: count }, (_, i) =>
		edit && i + 1 === edit.line ? edit.text : `const line${i + 1} = ${i + 1};`,
	).join("\n");

const range = (from: number, to: number) =>
	new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i));

/** The ticket's story: step 1 focuses lines 1400 to 1410, step 2 edits line 1408. */
const LONG = file(3_000);
const EDITED = file(3_000, { line: 1408, text: "const line1408 = 'edited';" });
const FOCUS = [range(1400, 1410), undefined];

describe("firstChangedRow", () => {
	it("finds the first row two codes differ on, 0-indexed", () => {
		expect(firstChangedRow(LONG, EDITED)).toBe(1407);
		expect(firstChangedRow("a\nb", "a\nb\nc")).toBe(2);
	});

	it("is null when the codes are the same", () => {
		expect(firstChangedRow(LONG, LONG)).toBeNull();
	});
});

describe("planWindowRows", () => {
	it("follows the focus band, with a lead of context above it", () => {
		expect(planWindowRows([LONG, EDITED], FOCUS)[0]).toBe(1399 - WINDOW_LEAD_ROWS);
	});

	it("follows the first changed line when the step has no focus", () => {
		// Step 2 against step 1, and step 1 against step 2 when it has no focus.
		expect(planWindowRows([LONG, EDITED])).toEqual([
			1407 - WINDOW_LEAD_ROWS,
			1407 - WINDOW_LEAD_ROWS,
		]);
	});

	it("keeps the window where it was on a step that changes nothing", () => {
		expect(planWindowRows([LONG, EDITED, EDITED], FOCUS)).toEqual([
			1399 - WINDOW_LEAD_ROWS,
			1407 - WINDOW_LEAD_ROWS,
			1407 - WINDOW_LEAD_ROWS,
		]);
	});

	it("ignores focus lines that are not line numbers", () => {
		expect(planWindowRows([LONG, LONG], [new Set([Number.NaN]), undefined])).toEqual([0, 0]);
	});

	it("stays at the top when nothing changes and nothing is focused", () => {
		expect(planWindowRows([LONG, LONG])).toEqual([0, 0]);
	});

	it("never scrolls past the last full window", () => {
		const tail = file(3_000, { line: 2_999, text: "tail();" });
		expect(planWindowRows([LONG, tail])).toEqual([
			3_000 - VISIBLE_ROW_LIMIT,
			3_000 - VISIBLE_ROW_LIMIT,
		]);
	});

	it("never scrolls a file that fits the window", () => {
		const short = file(VISIBLE_ROW_LIMIT);
		const edited = file(VISIBLE_ROW_LIMIT, { line: 190, text: "edited();" });
		expect(planWindowRows([short, edited], [range(180, 190), undefined])).toEqual([0, 0]);
	});
});

describe("planMagicMove with a window", () => {
	const plan = planMagicMove([LONG, EDITED], keyer, "#0d1117", false, FOCUS);

	it("lays out the rows around the focus band and the edit, on absolute lines", () => {
		const [first, second] = plan.frames;
		expect(first?.firstRow).toBe(1399 - WINDOW_LEAD_ROWS);
		expect(second?.firstRow).toBe(1407 - WINDOW_LEAD_ROWS);
		for (const frame of plan.frames) {
			const lines = frame.tokens.map((token) => token.line);
			expect(Math.min(...lines)).toBe(frame.firstRow);
			expect(Math.max(...lines)).toBe((frame.firstRow ?? 0) + VISIBLE_ROW_LIMIT - 1);
			expect(frame.lineCount).toBe(VISIBLE_ROW_LIMIT);
		}
		expect(second?.tokens.find((token) => token.line === 1407)?.content).toBe(
			"const line1408 = 'edited';",
		);
	});

	it("morphs between the two windows on absolute lines, so unchanged rows stay put", () => {
		const morph = plan.transitions[0];
		const from = morph?.from.find((token) => token.content === "const line1405 = 1405;");
		const to = morph?.to.find((token) => token.content === "const line1405 = 1405;");
		expect(from?.line).toBe(1404);
		expect(to?.line).toBe(1404);
	});

	it("keeps the rows two windows share on screen through the scroll", () => {
		// Line 1396 is above the second window: without the union it would fade
		// out while the window still scrolls past it.
		const morph = plan.transitions[0];
		const from = morph?.from.find((token) => token.content === "const line1396 = 1396;");
		const to = morph?.to.find((token) => token.content === "const line1396 = 1396;");
		expect(from?.line).toBe(1395);
		expect(to?.key).toBe(from?.key);
		expect(to?.line).toBe(1395);
	});

	it("morphs two far-apart windows on their own rows", () => {
		const far = planMagicMove(
			[LONG, file(3_000, { line: 2_000, text: "far();" })],
			keyer,
			"#0d1117",
			false,
			FOCUS,
		);
		const morph = far.transitions[0];
		const lines = (tokens: { line: number }[] = []) => tokens.map((token) => token.line);
		expect(Math.min(...lines(morph?.from))).toBe(1399 - WINDOW_LEAD_ROWS);
		expect(Math.max(...lines(morph?.from))).toBe(1399 - WINDOW_LEAD_ROWS + VISIBLE_ROW_LIMIT - 1);
		expect(Math.min(...lines(morph?.to))).toBe(1999 - WINDOW_LEAD_ROWS);
	});

	it("types the first step from its own window", () => {
		const typed = plan.typing ?? [];
		expect(typed[0]?.line).toBe(plan.frames[0]?.firstRow);
		expect(LONG.slice(typed[0]?.startChar ?? 0).startsWith(typed[0]?.content ?? "?")).toBe(true);
	});

	it("leaves a short file's plan without a window", () => {
		const short = planMagicMove(
			[file(20), file(20, { line: 12, text: "x();" })],
			keyer,
			"#000",
			true,
		);
		for (const frame of short.frames) {
			expect(frame.firstRow).toBeUndefined();
		}
	});
});

describe("zoomForFocus inside a window", () => {
	it("centres the push-in on the band's rows within the window", () => {
		const firstRow = 1399 - WINDOW_LEAD_ROWS;
		const zoom = zoomForFocus(range(1400, 1410), VISIBLE_ROW_LIMIT, firstRow);
		expect(zoom.scale).toBe(ZOOM_SCALE);
		expect(zoom.originYRatio * VISIBLE_ROW_LIMIT).toBeCloseTo((1399 + 1410) / 2 - firstRow, 6);
	});
});

describe("scrolledGutter", () => {
	it("labels the rows from the window's top, with the fraction it sits above it", () => {
		expect(scrolledGutter(1, 3, 0)).toEqual({ labels: ["01", "02", "03"], shift: 0 });
		const mid = scrolledGutter(1, 3, 1391.25);
		expect(mid.labels).toEqual(["1392", "1393", "1394", "1395"]);
		expect(mid.shift).toBeCloseTo(0.25, 9);
	});
});

const SCRIPT = {
	durations: [1000, 1000],
	transitionMs: 1000,
	fps: 30,
	loop: false,
	typewriter: false,
	firstCode: LONG,
};

describe("videoScript with a window", () => {
	const plan = planMagicMove([LONG, EDITED], keyer, "#0d1117", false, FOCUS);
	const script = videoScript({ ...SCRIPT, plan, focusSets: FOCUS });
	const transition = script.segments.find((segment) => segment.type === "transition");

	it("holds each step at its own window, tokens scrolled to it", () => {
		const first = script.frameAt(0);
		expect(first.firstRow).toBe(1399 - WINDOW_LEAD_ROWS);
		expect(Math.min(...first.tokens.map((token) => token.line))).toBe(0);
		const last = script.frameAt(script.totalFrames - 1);
		expect(last.firstRow).toBe(1407 - WINDOW_LEAD_ROWS);
		expect(last.tokens.find((token) => token.content.includes("edited"))?.line).toBe(
			WINDOW_LEAD_ROWS,
		);
	});

	it("moves the window on the morph's easing, not a cut", () => {
		if (!transition) {
			throw new Error("no transition");
		}
		const frame = Math.round((transition.startFrame + transition.endFrame) / 2);
		const t = (frame - transition.startFrame) / (transition.endFrame - transition.startFrame);
		const eased = cubicBezierAt(DEFAULT_TRANSITION_EASING, t);
		const from = 1399 - WINDOW_LEAD_ROWS;
		const to = 1407 - WINDOW_LEAD_ROWS;
		expect(script.frameAt(frame).firstRow).toBeCloseTo(from + (to - from) * eased, 6);
	});

	it("keeps a file under the row limit at a zero offset on every frame", () => {
		const short = [file(40), file(40, { line: 30, text: "edited();" })];
		const shortFocus = [range(25, 35), undefined];
		const shortPlan = planMagicMove(short, keyer, "#0d1117", true, shortFocus);
		for (const typewriter of [false, true]) {
			const shortScript = videoScript({
				...SCRIPT,
				loop: true,
				typewriter,
				firstCode: short[0] ?? "",
				plan: shortPlan,
				focusSets: shortFocus,
			});
			for (let frame = 0; frame < shortScript.totalFrames; frame++) {
				expect(shortScript.frameAt(frame).firstRow).toBe(0);
			}
		}
	});
});

const SCENE_INPUT: FrameSceneInput = {
	canvasWidth: 1280,
	canvasHeight: 720,
	plan: { frames: [{ lineCount: 3, tokens: [{ col: 0, content: "x" }], firstRow: 1391 }] },
	theme: {
		background: "#0d1117",
		foreground: "#e6edf3",
		fontFamily: "monospace",
		fontSize: 14,
		borderRadius: 12,
	},
	title: "long.ts",
	chrome: "macos",
	background: "#111111",
	padding: 24,
	cardMargin: 32,
	showLineNumbers: true,
	lineNumberStart: 1,
	charWidthRatio: 0.6,
	scale: 2.2,
	canvasMargin: 0.05,
	grain: null,
};

describe("the painter's gutter inside a window", () => {
	it("numbers the rows from the window's top and scrolls them by its fraction", () => {
		const scene = frameScene(SCENE_INPUT);
		const ctx = new RecordingContext();
		paintFrame(ctx, scene, {
			tokens: [],
			lineCount: 3,
			lineNumberCount: 3,
			timeSeconds: 0,
			firstRow: 1391.5,
		});
		const labels = ctx.commands.flatMap((command) => {
			const match = /^fillText\("(\d+)",[^,]+,([^)]+)\)$/.exec(command);
			return match ? [{ label: match[1], y: Number(match[2]) }] : [];
		});
		expect(labels.map((entry) => entry.label)).toEqual(["1392", "1393", "1394", "1395"]);
		const step = (labels[1]?.y ?? 0) - (labels[0]?.y ?? 0);
		expect(step).toBeCloseTo(scene.code.lineHeight, 6);
		// Half a row above the code's top: the scroll is in the gutter too.
		expect(labels[0]?.y).toBeLessThan(scene.code.y + scene.code.lineHeight / 2);
	});

	it("sizes the gutter for the deepest row a window shows", () => {
		const scene = frameScene(SCENE_INPUT);
		const flat = frameScene({
			...SCENE_INPUT,
			plan: { frames: [{ lineCount: 3, tokens: [{ col: 0, content: "x" }] }] },
		});
		// 1394 needs four digits where 3 needs the minimum two.
		expect(scene.code.x - flat.code.x).toBeCloseTo(2 * 14 * 2.2 * 0.6, 6);
	});
});
