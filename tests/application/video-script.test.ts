import { scriptFrameAt, videoScript } from "@/application/export/video-script";
import {
	DIM_OPACITY,
	type LaidOutToken,
	type MagicMovePlan,
} from "@/application/magic-move/engine";
import { NO_ZOOM, ZOOM_SCALE } from "@/application/magic-move/focus-zoom";
import { type PlanKeyer, planMagicMove } from "@/application/magic-move/plan";
import { layoutTypingTokens } from "@/application/magic-move/typewriter";
import { describe, expect, it } from "vitest";

function tok(key: string, content: string, line: number, col: number): LaidOutToken {
	return { key, content, line, col };
}

/** Two frames: the second gains a row, so the body height has to interpolate. */
const FRAME_A = { tokens: [tok("a", "one", 0, 0)], lineCount: 2 };
const FRAME_B = { tokens: [tok("a", "one", 0, 0), tok("b", "two", 1, 0)], lineCount: 4 };

const PLAN: MagicMovePlan = {
	frames: [FRAME_A, FRAME_B],
	transitions: [{ from: FRAME_A.tokens, to: FRAME_B.tokens }],
};

const BASE = {
	plan: PLAN,
	durations: [1000, 1000],
	transitionMs: 650,
	fps: 30,
	loop: false,
	typewriter: false,
	firstCode: "one",
	focusSets: [undefined, undefined],
};

describe("videoScript segments", () => {
	it("lays holds and transitions out in whole frames, like the composition does", () => {
		const script = videoScript(BASE);

		// 1000ms at 30fps = 30 frames of hold; 650ms = round(19.5) = 20 frames.
		expect(script.segments).toEqual([
			{ type: "hold", index: 0, startFrame: 0, endFrame: 30 },
			{ type: "transition", index: 0, startFrame: 30, endFrame: 50 },
			{ type: "hold", index: 1, startFrame: 50, endFrame: 80 },
		]);
		expect(script.totalFrames).toBe(80);
	});

	it("never produces a video of zero frames", () => {
		const script = videoScript({ ...BASE, durations: [0, 0], transitionMs: 0 });

		expect(script.totalFrames).toBe(1);
	});

	it("appends a loop-back segment when looping is on", () => {
		const script = videoScript({
			...BASE,
			loop: true,
			plan: { ...PLAN, loopTransition: { from: FRAME_B.tokens, to: FRAME_A.tokens } },
		});

		expect(script.segments.at(-1)).toEqual({
			type: "loop",
			index: 1,
			startFrame: 80,
			endFrame: 100,
		});
		expect(script.totalFrames).toBe(100);
	});

	it("does not loop a single-step video", () => {
		const script = videoScript({
			...BASE,
			loop: true,
			durations: [1000],
			plan: { frames: [FRAME_A], transitions: [] },
			focusSets: [undefined],
		});

		expect(script.segments.every((s) => s.type !== "loop")).toBe(true);
	});
});

describe("videoScript frames", () => {
	it("holds a frame's static tokens at full opacity", () => {
		const frame = videoScript(BASE).frameAt(0);

		expect(frame.tokens.map((t) => [t.key, t.opacity])).toEqual([["a", 1]]);
		expect(frame.lineCount).toBe(2);
		expect(frame.lineNumberCount).toBe(2);
		expect(frame.cursor).toBeNull();
		expect(frame.zoom).toEqual(NO_ZOOM);
	});

	it("eases the body height through a morph and holds the gutter at the taller frame", () => {
		const script = videoScript(BASE);
		// Halfway through the 20-frame transition that starts at frame 30.
		const frame = script.frameAt(40);

		// The symmetric default curve crosses its midpoint at 0.5.
		expect(frame.lineCount).toBeCloseTo(3, 6);
		expect(frame.lineNumberCount).toBe(4);
	});

	it("applies the chosen Bézier to exported morph geometry", () => {
		const linear = videoScript({ ...BASE, transitionEasing: [0, 0, 1, 1] }).frameAt(35);
		const smooth = videoScript({ ...BASE, transitionEasing: [0.22, 1, 0.36, 1] }).frameAt(35);

		expect(linear.lineCount).toBeCloseTo(2.5, 4);
		expect(smooth.lineCount).toBeGreaterThan(linear.lineCount + 0.5);
	});

	it("clamps past the end to the last frame rather than falling off the timeline", () => {
		const script = videoScript(BASE);

		expect(script.frameAt(999).tokens.map((t) => t.key)).toEqual(["a", "b"]);
	});

	it("reports the instant a frame belongs to, so the mesh drifts with the video", () => {
		expect(videoScript(BASE).frameAt(45).timeSeconds).toBeCloseTo(1.5, 6);
	});

	it("runs progress from zero to one across the whole video", () => {
		const script = videoScript(BASE);

		expect(script.frameAt(0).progress).toBe(0);
		expect(script.frameAt(40).progress).toBeCloseTo(0.5, 6);
		expect(script.frameAt(79).progress).toBeCloseTo(79 / 80, 6);
	});
});

describe("videoScript focus", () => {
	it("leaves a spotlit line at full opacity", () => {
		const script = videoScript({ ...BASE, focusSets: [new Set([1]), undefined] });
		const frame = script.frameAt(0);

		expect(frame.tokens.find((t) => t.key === "a")?.opacity).toBe(1);
	});

	it("dims an unfocused token on a held frame", () => {
		const script = videoScript({
			...BASE,
			durations: [1000, 1000],
			focusSets: [undefined, new Set([1])],
		});
		// Second hold starts at frame 50; line 2 ("two") is outside the spotlight.
		const frame = script.frameAt(50);

		expect(frame.tokens.find((t) => t.key === "b")?.opacity).toBeCloseTo(DIM_OPACITY, 6);
	});

	it("pushes in on a spotlit step and stays neutral without one", () => {
		const zoomed = videoScript({ ...BASE, focusSets: [new Set([1]), undefined] }).frameAt(0);
		const plain = videoScript(BASE).frameAt(0);

		expect(zoomed.zoom.scale).toBeCloseTo(ZOOM_SCALE, 6);
		expect(plain.zoom).toEqual(NO_ZOOM);
	});
});

describe("videoScript typewriter", () => {
	const code = "const a = 1";
	const typing = layoutTypingTokens(code, [{ key: "t0", content: code, offset: 0 }]);

	it("types the first hold out character by character, with a caret", () => {
		const script = videoScript({
			...BASE,
			typewriter: true,
			firstCode: code,
			plan: { ...PLAN, typing },
		});

		const start = script.frameAt(0);
		const mid = script.frameAt(15);
		expect(typed(start)).toBeLessThan(code.length);
		expect(mid.cursor).not.toBeNull();
		expect(typed(mid)).toBeGreaterThan(typed(start));
	});

	it("leaves later holds alone", () => {
		const script = videoScript({
			...BASE,
			typewriter: true,
			firstCode: code,
			plan: { ...PLAN, typing },
		});

		expect(script.frameAt(50).cursor).toBeNull();
	});

	function typed(frame: { tokens: { content: string }[] }): number {
		return frame.tokens.reduce((sum, t) => sum + t.content.length, 0);
	}
});

describe("videoScript loop segment", () => {
	it("morphs the last frame back to the first", () => {
		const script = videoScript({
			...BASE,
			loop: true,
			plan: { ...PLAN, loopTransition: { from: FRAME_B.tokens, to: FRAME_A.tokens } },
		});
		// Frame 99: the very end of the loop-back, where only frame A survives.
		const frame = script.frameAt(99);

		expect(frame.tokens.find((t) => t.key === "b")?.opacity ?? 0).toBeLessThan(0.05);
		expect(frame.lineCount).toBeCloseTo(2, 1);
	});
});

describe("videoScript determinism", () => {
	it("returns the same frame for the same index", () => {
		const script = videoScript(BASE);

		expect(script.frameAt(37)).toEqual(script.frameAt(37));
	});
});

describe("the frame at a playback position, shared with the preview", () => {
	const LOOPING = {
		...BASE,
		loop: true,
		plan: { ...PLAN, loopTransition: { from: FRAME_B.tokens, to: FRAME_A.tokens } },
	};

	it("paints the loop morph the file paints at the same point", () => {
		const script = videoScript(LOOPING);
		const loop = script.segments.find((segment) => segment.type === "loop");
		if (!loop) {
			throw new Error("The script must loop");
		}
		const middle = loop.startFrame + (loop.endFrame - loop.startFrame) / 2;
		const { progress: _p, timeSeconds: _s, ...fromFile } = script.frameAt(middle);

		expect(scriptFrameAt(LOOPING, { phase: "loop", index: 1, t: 0.5 })).toEqual(fromFile);
	});

	it("lands the loop on the first scene", () => {
		const landed = scriptFrameAt(LOOPING, { phase: "loop", index: 1, t: 1 });

		expect(landed.lineCount).toBe(FRAME_A.lineCount);
		const visible = landed.tokens.filter((token) => token.opacity > 0);
		expect(visible.map((token) => token.key)).toEqual(["a"]);
	});
});

describe("videoScript across a scene break (#280)", () => {
	/** Words as tokens, keyed by content and occurrence: a word both codes hold glides. */
	const keyer: PlanKeyer<{
		code: string;
		tokens: { key: string; content: string; offset: number }[];
	}> = {
		tokenize: (code) => {
			const seen = new Map<string, number>();
			return {
				code,
				tokens: [...code.matchAll(/\S+/g)].map((match) => {
					const count = seen.get(match[0]) ?? 0;
					seen.set(match[0], count + 1);
					return { key: `${match[0]}#${count}`, content: match[0], offset: match.index ?? 0 };
				}),
			};
		},
		sync: (from, to) => ({ from, to }),
	};
	// The same words on other rows and columns: a morph sends them across lines.
	const OLD = "const a = 1;\nconst b = 2;";
	const NEW = "export function f() {\n  const b = a;\n  return b;\n}";
	const input = (breaks: boolean[]) => ({
		...BASE,
		plan: planMagicMove([OLD, NEW], keyer, "#0d1117", false, [], breaks),
		firstCode: OLD,
	});

	it("takes exactly the frames a morph takes", () => {
		const morph = videoScript(input([false, false]));
		const broken = videoScript(input([false, true]));
		expect(broken.totalFrames).toBe(morph.totalFrames);
		expect(broken.segments).toEqual(morph.segments);
	});

	it("moves no token: each side holds its place while it fades, out then in", () => {
		const script = videoScript(input([false, true]));
		const transition = script.segments.find((segment) => segment.type === "transition");
		if (!transition) {
			throw new Error("no transition");
		}
		const place = new Map<string, string>();
		const last = new Map<string, number>();
		for (let frame = transition.startFrame; frame < transition.endFrame; frame++) {
			for (const token of script.frameAt(frame).tokens) {
				const at = `${token.line}:${token.col}`;
				expect(place.get(token.key) ?? at, token.key).toBe(at);
				place.set(token.key, at);
				const before = last.get(token.key);
				if (before !== undefined) {
					// Old tokens only fade out, new ones only fade in.
					if (token.key.startsWith("out:")) {
						expect(token.opacity).toBeLessThanOrEqual(before);
					} else {
						expect(token.opacity).toBeGreaterThanOrEqual(before);
					}
				}
				last.set(token.key, token.opacity);
			}
		}
		// The morph of the same pair glides `const` and `b` across lines.
		const morph = videoScript(input([false, false]));
		const middle = morph.frameAt(Math.floor((transition.startFrame + transition.endFrame) / 2));
		expect(middle.tokens.some((token) => !Number.isInteger(token.line))).toBe(true);
	});

	it("never leaves the card empty: the most visible token stays above 0.2", () => {
		const script = videoScript(input([false, true]));
		const transition = script.segments.find((segment) => segment.type === "transition");
		if (!transition) {
			throw new Error("no transition");
		}
		for (let frame = transition.startFrame; frame < transition.endFrame; frame++) {
			const most = Math.max(...script.frameAt(frame).tokens.map((token) => token.opacity));
			expect(most, `frame ${frame}`).toBeGreaterThan(0.2);
		}
	});

	it("still eases the card from one height to the other", () => {
		const script = videoScript(input([false, true]));
		const transition = script.segments.find((segment) => segment.type === "transition");
		const middle = script.frameAt(
			Math.floor(((transition?.startFrame ?? 0) + (transition?.endFrame ?? 0)) / 2),
		);
		expect(middle.lineCount).toBeGreaterThan(2);
		expect(middle.lineCount).toBeLessThan(4);
	});
});
