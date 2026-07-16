import {
	type TickEvent,
	collectTickEvents,
	encodeWavBase64,
	renderTickTrack,
} from "@/application/audio/tick-synth";
import { buildTimeline } from "@/application/magic-move/timeline";
import { TYPE_COMPLETE_AT } from "@/application/magic-move/typewriter";
import { describe, expect, it } from "vitest";

/** Decode a `data:audio/wav;base64,...` URL back into raw bytes (jsdom atob). */
function decodeWav(dataUrl: string): Uint8Array {
	const b64 = dataUrl.replace(/^data:audio\/wav;base64,/, "");
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
}

function ascii(bytes: Uint8Array, offset: number, len: number): string {
	let s = "";
	for (let i = 0; i < len; i++) {
		s += String.fromCharCode(bytes[offset + i] ?? 0);
	}
	return s;
}

describe("collectTickEvents", () => {
	it("emits a morph at each transition start and no keys without typewriter", () => {
		const holds = [1000, 800, 1200];
		const transitionMs = 650;
		const events = collectTickEvents({
			typewriter: false,
			firstCodeLength: 42,
			holds,
			transitionMs,
		});

		expect(events.every((e) => e.kind === "morph")).toBe(true);
		// One morph per adjacent pair.
		expect(events).toHaveLength(holds.length - 1);

		// Morph times line up exactly with the timeline's transition segments.
		const timeline = buildTimeline(holds, transitionMs);
		const transitionStarts = timeline.segments
			.filter((s) => s.type === "transition")
			.map((s) => s.startMs);
		expect(events.map((e) => e.timeMs)).toEqual(transitionStarts);
	});

	it("emits one key per character across the first hold, aligned with typedCharCount", () => {
		const holds = [1000, 800];
		const firstCodeLength = 5;
		const events = collectTickEvents({
			typewriter: true,
			firstCodeLength,
			holds,
			transitionMs: 650,
		});

		const firstHold = holds[0] ?? 0;
		const keys = events.filter((e) => e.kind === "key");
		expect(keys).toHaveLength(firstCodeLength);
		// First key lands at the very start of typing.
		expect(keys[0]?.timeMs).toBeCloseTo(0, 6);
		// Last key lands just before the reveal completes (0.85 of the first hold).
		const expectedLast = ((TYPE_COMPLETE_AT * (firstCodeLength - 1)) / firstCodeLength) * firstHold;
		expect(keys[keys.length - 1]?.timeMs).toBeCloseTo(expectedLast, 6);
		// All key ticks fall within the first hold (before typing completes).
		expect(keys.every((k) => k.timeMs < firstHold)).toBe(true);
	});

	it("caps key events at the character count and still emits morphs", () => {
		const events = collectTickEvents({
			typewriter: true,
			firstCodeLength: 3,
			holds: [500, 500],
			transitionMs: 400,
		});
		expect(events.filter((e) => e.kind === "key")).toHaveLength(3);
		expect(events.filter((e) => e.kind === "morph")).toHaveLength(1);
	});

	it("emits nothing meaningful for a single step with no typewriter", () => {
		const events = collectTickEvents({
			typewriter: false,
			firstCodeLength: 10,
			holds: [1000],
			transitionMs: 650,
		});
		expect(events).toHaveLength(0);
	});
});

describe("renderTickTrack", () => {
	it("produces a silence buffer of the right length", () => {
		const buffer = renderTickTrack([], 1000, 8000);
		expect(buffer).toBeInstanceOf(Float32Array);
		expect(buffer.length).toBe(8000);
		expect(buffer.every((s) => s === 0)).toBe(true);
	});

	it("writes audible samples near a tick's onset", () => {
		const buffer = renderTickTrack([{ timeMs: 0, kind: "key" }], 100, 44100);
		// Something non-silent in the first ~10ms.
		let peak = 0;
		for (let i = 0; i < 441; i++) {
			peak = Math.max(peak, Math.abs(buffer[i] ?? 0));
		}
		expect(peak).toBeGreaterThan(0);
	});

	it("stays within [-1, 1] even when ticks pile up", () => {
		const events: TickEvent[] = [];
		for (let i = 0; i < 40; i++) {
			events.push({ timeMs: i * 0.1, kind: "morph" });
		}
		const buffer = renderTickTrack(events, 50, 44100);
		expect(buffer.every((s) => s >= -1 && s <= 1)).toBe(true);
	});

	it("is deterministic — identical output for identical input", () => {
		const events: TickEvent[] = [
			{ timeMs: 5, kind: "key" },
			{ timeMs: 12, kind: "key" },
			{ timeMs: 30, kind: "morph" },
		];
		const a = renderTickTrack(events, 100, 44100);
		const b = renderTickTrack(events, 100, 44100);
		expect(a.length).toBe(b.length);
		expect(Array.from(a)).toEqual(Array.from(b));
	});
});

describe("encodeWavBase64", () => {
	it("writes a valid 16-bit PCM mono WAV header", () => {
		const samples = new Float32Array([0, 0, 0, 0]);
		const bytes = decodeWav(encodeWavBase64(samples, 44100));

		expect(ascii(bytes, 0, 4)).toBe("RIFF");
		expect(ascii(bytes, 8, 4)).toBe("WAVE");
		expect(ascii(bytes, 12, 4)).toBe("fmt ");
		expect(ascii(bytes, 36, 4)).toBe("data");

		const view = new DataView(bytes.buffer);
		expect(view.getUint16(20, true)).toBe(1); // PCM
		expect(view.getUint16(22, true)).toBe(1); // mono
		expect(view.getUint32(24, true)).toBe(44100); // sample rate
		expect(view.getUint16(34, true)).toBe(16); // bits per sample
	});

	it("gets the length math right", () => {
		const samples = new Float32Array(10);
		const bytes = decodeWav(encodeWavBase64(samples, 44100));
		const view = new DataView(bytes.buffer);

		const dataSize = view.getUint32(40, true);
		expect(dataSize).toBe(10 * 2); // 16-bit mono
		expect(view.getUint32(4, true)).toBe(36 + dataSize); // RIFF chunk size
		expect(bytes.length).toBe(44 + dataSize);
	});

	it("round-trips known sample values through 16-bit PCM", () => {
		const samples = new Float32Array([1, -1, 0]);
		const bytes = decodeWav(encodeWavBase64(samples, 44100));
		const view = new DataView(bytes.buffer);

		expect(view.getInt16(44, true)).toBe(32767); // +full scale
		expect(view.getInt16(46, true)).toBe(-32768); // -full scale
		expect(view.getInt16(48, true)).toBe(0);
	});

	it("prefixes the data URL and is a pure function of its input", () => {
		const samples = new Float32Array([0.25, -0.5, 0.75]);
		const a = encodeWavBase64(samples, 22050);
		const b = encodeWavBase64(samples, 22050);
		expect(a.startsWith("data:audio/wav;base64,")).toBe(true);
		expect(a).toBe(b);
	});
});
