import { collectTickEvents } from "@/application/audio/tick-synth";
import { videoScript } from "@/application/export/video-script";
import type { LaidOutToken, MagicMovePlan } from "@/application/magic-move/engine";
import {
	TYPE_COMPLETE_AT,
	layoutTypingTokens,
	typingHoldIndex,
	typingProgressAt,
} from "@/application/magic-move/typewriter";
import type { ClientExportJob } from "@/infrastructure/export/client-export-job";
import { scriptFor } from "@/infrastructure/export/client-export-scene";
import { describe, expect, it } from "vitest";

/**
 * #106: a video that opens on a title card (a blank scene) typed its code over
 * that card, where no card is drawn, and showed the code whole once the card
 * faded in. The typewriter types the first scene with code instead, and the
 * card fades in on an empty window before it.
 */
const CODE = "const a = 1";
const TYPING = layoutTypingTokens(CODE, [{ key: "t0", content: CODE, offset: 0 }]);
const FULL: LaidOutToken[] = [{ key: "t0", content: CODE, line: 0, col: 0 }];
// A blank scene holds the next scene's code (morphCodes), so both frames match.
const FRAME = { tokens: FULL, lineCount: 1 };
const PLAN: MagicMovePlan = {
	frames: [FRAME, FRAME],
	transitions: [{ from: FULL, to: FULL }],
	typing: TYPING,
};

function typed(frame: { tokens: { content: string }[] }): number {
	return frame.tokens.reduce((sum, token) => sum + token.content.length, 0);
}

describe("the typewriter's hold", () => {
	it("is the first scene with code, and the first scene when none has any", () => {
		expect(typingHoldIndex(["a", "b"])).toBe(0);
		expect(typingHoldIndex(["", "", "b", "c"])).toBe(2);
		expect(typingHoldIndex(["", ""])).toBe(0);
		expect(typingHoldIndex([])).toBe(0);
	});

	it("types nothing before that hold, types over it, and leaves the rest to the morph", () => {
		expect(typingProgressAt({ phase: "hold", index: 0, t: 0.7 }, 1)).toBe(0);
		expect(typingProgressAt({ phase: "transition", index: 0, t: 0.5 }, 1)).toBe(0);
		expect(typingProgressAt({ phase: "hold", index: 1, t: 0.4 }, 1)).toBe(0.4);
		expect(typingProgressAt({ phase: "transition", index: 1, t: 0.1 }, 1)).toBeNull();
		expect(typingProgressAt({ phase: "loop", index: 1, t: 0.1 }, 1)).toBeNull();
		// The first scene has code: the reveal is the first hold, as it always was.
		expect(typingProgressAt({ phase: "hold", index: 0, t: 0.3 }, 0)).toBe(0.3);
		expect(typingProgressAt({ phase: "transition", index: 0, t: 0.3 }, 0)).toBeNull();
	});
});

describe("a video that opens on a blank scene, typed", () => {
	const script = videoScript({
		plan: PLAN,
		durations: [1000, 1000],
		transitionMs: 500,
		fps: 30,
		loop: false,
		typewriter: true,
		firstCode: CODE,
		typingIndex: 1,
		focusSets: [undefined, undefined],
	});
	// 30 frames of title card, 15 of fade, then 30 of the code scene.
	const [title, fade, codeHold] = script.segments;

	it("keeps the window empty over the title card and through the fade", () => {
		expect(title?.type).toBe("hold");
		expect(fade?.type).toBe("transition");
		expect(typed(script.frameAt(10))).toBe(0);
		expect(typed(script.frameAt((fade?.startFrame ?? 0) + 7))).toBe(0);
	});

	it("types the code scene out over its own hold, with a caret", () => {
		const start = codeHold?.startFrame ?? 0;
		const mid = script.frameAt(start + 12);
		expect(typed(mid)).toBeGreaterThan(0);
		expect(typed(mid)).toBeLessThan(CODE.length);
		expect(mid.cursor).not.toBeNull();
		expect(typed(script.frameAt(start + 29))).toBe(CODE.length);
	});
});

describe("the on-device export job", () => {
	it("carries the typed scene to the painter's script", () => {
		const script = scriptFor({
			plan: PLAN,
			durations: [1000, 1000],
			transitionMs: 500,
			fps: 30,
			loop: false,
			typewriter: true,
			firstCode: CODE,
			typingIndex: 1,
			focus: [[], []],
		} as unknown as ClientExportJob);
		expect(typed(script.frameAt(10))).toBe(0);
		expect(typed(script.frameAt(45 + 29))).toBe(CODE.length);
	});
});

describe("the key ticks of a typed code scene", () => {
	it("start with that scene's hold, not at the first frame", () => {
		const events = collectTickEvents({
			typewriter: true,
			firstCodeLength: 4,
			holds: [1000, 2000],
			transitionMs: 500,
			typewriterHoldIndex: 1,
		});
		const keys = events.filter((event) => event.kind === "key").map((event) => event.timeMs);
		expect(keys).toEqual([0, 1, 2, 3].map((c) => 1500 + ((TYPE_COMPLETE_AT * c) / 4) * 2000));
	});
});
