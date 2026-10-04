import { AudioCue } from "@/domain/entities/audio-cue";
import { describe, expect, it } from "vitest";

describe("AudioCue", () => {
	it("places a trimmed audio asset on the global project timeline", () => {
		const cue = AudioCue.create({
			id: "cue-voiceover",
			assetId: "asset-voiceover",
			startMs: 500,
			trim: { startMs: 250, endMs: 2_250 },
			gain: 0.8,
			fadeInMs: 200,
			fadeOutMs: 300,
		});

		expect(cue).toMatchObject({
			id: "cue-voiceover",
			assetId: "asset-voiceover",
			startMs: 500,
			trim: { startMs: 250, endMs: 2_250 },
			gain: 0.8,
			fadeInMs: 200,
			fadeOutMs: 300,
			durationMs: 2_000,
			endMs: 2_500,
		});
	});

	it("defaults to timeline zero, unity gain and no fades", () => {
		const cue = AudioCue.create({
			assetId: "asset-music",
			trim: { startMs: 0, endMs: 5_000 },
		});

		expect(cue.id).toBeDefined();
		expect(cue.startMs).toBe(0);
		expect(cue.gain).toBe(1);
		expect(cue.fadeInMs).toBe(0);
		expect(cue.fadeOutMs).toBe(0);
		expect(cue.endMs).toBe(5_000);
	});

	it("rejects invalid identity and timeline placement", () => {
		expect(() =>
			AudioCue.create({ id: " ", assetId: "audio", trim: { startMs: 0, endMs: 1 } }),
		).toThrow("Audio cue id must not be empty");
		expect(() => AudioCue.create({ assetId: " ", trim: { startMs: 0, endMs: 1 } })).toThrow(
			"Audio cue asset id must not be empty",
		);
		expect(() =>
			AudioCue.create({ assetId: "audio", startMs: -1, trim: { startMs: 0, endMs: 1 } }),
		).toThrow("Audio cue start must be a non-negative integer");
	});

	it("requires a non-empty safe trim range", () => {
		expect(() => AudioCue.create({ assetId: "audio", trim: { startMs: 10, endMs: 10 } })).toThrow(
			"Audio cue trim must have a non-negative start before its end",
		);
		expect(() => AudioCue.create({ assetId: "audio", trim: { startMs: 0.5, endMs: 10 } })).toThrow(
			"Audio cue trim must have a non-negative start before its end",
		);
	});

	it("keeps gain normalized and fades inside the audible range", () => {
		expect(() =>
			AudioCue.create({
				assetId: "audio",
				trim: { startMs: 0, endMs: 1_000 },
				gain: 1.1,
			}),
		).toThrow("Audio cue gain must be between 0 and 1");
		expect(() =>
			AudioCue.create({
				assetId: "audio",
				trim: { startMs: 0, endMs: 1_000 },
				fadeInMs: 600,
				fadeOutMs: 500,
			}),
		).toThrow("Audio cue fades must fit inside its trimmed duration");
	});

	it("rejects an unsafe timeline end and freezes its trim", () => {
		expect(() =>
			AudioCue.create({
				assetId: "audio",
				startMs: Number.MAX_SAFE_INTEGER,
				trim: { startMs: 0, endMs: 1 },
			}),
		).toThrow("Audio cue end must be a safe integer");

		const trim = { startMs: 0, endMs: 1_000 };
		const cue = AudioCue.create({ assetId: "audio", trim });
		trim.endMs = 10;

		expect(cue.trim.endMs).toBe(1_000);
		expect(Object.isFrozen(cue)).toBe(true);
		expect(Object.isFrozen(cue.trim)).toBe(true);
	});

	it("patches authored timing and mix values without mutating the source cue", () => {
		const cue = AudioCue.create({
			id: "cue-music",
			assetId: "asset-music",
			startMs: 200,
			trim: { startMs: 100, endMs: 4_100 },
			gain: 0.8,
			fadeInMs: 250,
			fadeOutMs: 300,
		});

		const updated = cue.withPatch({
			startMs: 600,
			trimStartMs: 500,
			trimEndMs: 3_500,
			gain: 0.55,
			fadeInMs: 400,
			fadeOutMs: 500,
		});

		expect(updated).toMatchObject({
			id: "cue-music",
			assetId: "asset-music",
			startMs: 600,
			trim: { startMs: 500, endMs: 3_500 },
			gain: 0.55,
			fadeInMs: 400,
			fadeOutMs: 500,
			durationMs: 3_000,
			endMs: 3_600,
		});
		expect(cue).toMatchObject({
			startMs: 200,
			trim: { startMs: 100, endMs: 4_100 },
			gain: 0.8,
		});
		expect(updated).not.toBe(cue);
		expect(Object.isFrozen(updated)).toBe(true);
	});

	it("revalidates every bound when a patch shortens the audible range", () => {
		const cue = AudioCue.create({
			assetId: "asset-music",
			trim: { startMs: 0, endMs: 2_000 },
			fadeInMs: 500,
			fadeOutMs: 500,
		});

		expect(() => cue.withPatch({ trimEndMs: 800 })).toThrow(
			"Audio cue fades must fit inside its trimmed duration",
		);
		expect(() => cue.withPatch({ gain: -0.1 })).toThrow("Audio cue gain must be between 0 and 1");
		expect(() => cue.withPatch({ startMs: -1 })).toThrow(
			"Audio cue start must be a non-negative integer",
		);
	});
});
