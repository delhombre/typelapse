/**
 * Tick-sound synth: pure, dependency-free, no audio assets. Turns the playback
 * timeline into a list of tick events, renders them into a mono PCM buffer, and
 * encodes that as a base64 WAV data URL. The browser preview and the Remotion
 * export both run these same functions on the same timeline numbers, so the
 * sound you hear in the preview is byte-for-byte the sound baked into the video.
 */
import { TYPE_COMPLETE_AT } from "../magic-move/typewriter";

/** A single audible moment: a key press while typing, or a step-to-step morph. */
export interface TickEvent {
	timeMs: number;
	kind: "key" | "morph";
}

export interface TickEventOptions {
	/** Type the first step out character by character (key ticks over its hold). */
	typewriter: boolean;
	/** Character count of the first step's code: the number of key ticks. */
	firstCodeLength: number;
	/** Per-step hold durations in ms (same array fed to buildTimeline). */
	holds: number[];
	/** Morph duration between steps in ms. */
	transitionMs: number;
	/** Which hold the typewriter reveal plays over (`typingHoldIndex`). */
	typewriterHoldIndex?: number;
}

/**
 * Collect the tick events for a timeline. When typewriter is on, one key tick is
 * placed per typed character across the first hold, timed as the inverse of
 * `typedCharCount` so each tick lands exactly as its character appears. A morph
 * tick is placed at every transition start, matching `buildTimeline`'s cursor.
 */
export function collectTickEvents(opts: TickEventOptions): TickEvent[] {
	const { typewriter, firstCodeLength, holds, transitionMs, typewriterHoldIndex = 0 } = opts;
	const events: TickEvent[] = [];

	if (typewriter && firstCodeLength > 0) {
		const holdMs = Math.max(0, holds[typewriterHoldIndex] ?? 0);
		// The typed hold starts after every hold and morph before it.
		let holdStartMs = 0;
		for (let i = 0; i < typewriterHoldIndex; i++) {
			holdStartMs += Math.max(0, holds[i] ?? 0) + transitionMs;
		}
		// typedCharCount reveals the c-th char once progress passes
		// TYPE_COMPLETE_AT*(c-1)/length, so that is the tick's onset.
		for (let c = 1; c <= firstCodeLength; c++) {
			const onset = (TYPE_COMPLETE_AT * (c - 1)) / firstCodeLength;
			events.push({ timeMs: holdStartMs + onset * holdMs, kind: "key" });
		}
	}

	let cursor = 0;
	for (let i = 0; i < holds.length; i++) {
		cursor += Math.max(0, holds[i] ?? 0);
		if (i < holds.length - 1) {
			events.push({ timeMs: cursor, kind: "morph" });
			cursor += transitionMs;
		}
	}

	return events;
}

// ── Synthesis ────────────────────────────────────────────────────────────────

/** Key tick: a short, lowpassed noise burst, a soft mechanical keystroke. */
const KEY_MS = 5;
const KEY_PEAK = 0.18;
const KEY_TAU_S = 0.0012;
const KEY_LP_A = 0.35;

/** Morph tick: a low, soft sine thump marking a step-to-step transition. */
const MORPH_MS = 24;
const MORPH_FREQ = 180;
const MORPH_PEAK = 0.12;
const MORPH_TAU_S = 0.008;

/**
 * Render tick events into a mono float buffer of `totalMs` at `sampleRate`. Key
 * ticks get deterministic per-event jitter (seeded by their index) so repeated
 * keystrokes do not sound like a machine gun; morph ticks are constant. The mix
 * is clamped to [-1, 1] as it is written, so overlapping ticks never clip.
 */
export function renderTickTrack(
	events: TickEvent[],
	totalMs: number,
	sampleRate = 44100,
): Float32Array {
	const length = Math.max(0, Math.round((totalMs / 1000) * sampleRate));
	const buffer = new Float32Array(length);

	for (let i = 0; i < events.length; i++) {
		const event = events[i];
		if (!event) {
			continue;
		}
		if (event.kind === "key") {
			addKeyTick(buffer, event.timeMs, sampleRate, i);
		} else {
			addMorphTick(buffer, event.timeMs, sampleRate);
		}
	}

	return buffer;
}

function addKeyTick(buffer: Float32Array, timeMs: number, sampleRate: number, seed: number): void {
	const rng = mulberry32(seed + 1);
	const gainJitter = 1 + (rng() * 2 - 1) * 0.1; // ±10%
	const decayJitter = 1 + (rng() * 2 - 1) * 0.08; // ±8%
	const peak = KEY_PEAK * gainJitter;
	const tau = KEY_TAU_S * decayJitter;
	const start = Math.round((timeMs / 1000) * sampleRate);
	const durSamples = Math.max(1, Math.round((KEY_MS / 1000) * sampleRate));

	let lp = 0;
	for (let n = 0; n < durSamples; n++) {
		const t = n / sampleRate;
		const env = Math.exp(-t / tau);
		const noise = rng() * 2 - 1;
		// One-pole lowpass: y[n] = y[n-1] + a*(x - y[n-1]).
		lp = lp + KEY_LP_A * (noise - lp);
		addSample(buffer, start + n, lp * env * peak);
	}
}

function addMorphTick(buffer: Float32Array, timeMs: number, sampleRate: number): void {
	const start = Math.round((timeMs / 1000) * sampleRate);
	const durSamples = Math.max(1, Math.round((MORPH_MS / 1000) * sampleRate));

	for (let n = 0; n < durSamples; n++) {
		const t = n / sampleRate;
		const env = Math.exp(-t / MORPH_TAU_S);
		addSample(buffer, start + n, Math.sin(2 * Math.PI * MORPH_FREQ * t) * env * MORPH_PEAK);
	}
}

function addSample(buffer: Float32Array, index: number, value: number): void {
	if (index < 0 || index >= buffer.length) {
		return;
	}
	buffer[index] = clampSample((buffer[index] ?? 0) + value);
}

function clampSample(v: number): number {
	if (v > 1) {
		return 1;
	}
	if (v < -1) {
		return -1;
	}
	return v;
}

/** Deterministic PRNG so a given event index always synthesizes the same tick. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ── WAV encoding ─────────────────────────────────────────────────────────────

/**
 * Encode a mono float buffer as a 16-bit PCM WAV, base64'd into a data URL. Uses
 * a portable base64 encoder (no btoa/Buffer) so it runs identically in the
 * browser preview and in the Node render route.
 */
export function encodeWavBase64(samples: Float32Array, sampleRate: number): string {
	const numSamples = samples.length;
	const dataSize = numSamples * 2;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii(view, 0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(view, 8, "WAVE");
	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // audio format = PCM
	view.setUint16(22, 1, true); // channels = mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byte rate = rate * blockAlign
	view.setUint16(32, 2, true); // block align = channels * bytesPerSample
	view.setUint16(34, 16, true); // bits per sample
	writeAscii(view, 36, "data");
	view.setUint32(40, dataSize, true);

	let offset = 44;
	for (let i = 0; i < numSamples; i++) {
		view.setInt16(offset, floatToInt16(samples[i] ?? 0), true);
		offset += 2;
	}

	return `data:audio/wav;base64,${base64FromBytes(new Uint8Array(buffer))}`;
}

function floatToInt16(sample: number): number {
	const v = Math.max(-1, Math.min(1, sample));
	return Math.round(v < 0 ? v * 0x8000 : v * 0x7fff);
}

function writeAscii(view: DataView, offset: number, text: string): void {
	for (let i = 0; i < text.length; i++) {
		view.setUint8(offset + i, text.charCodeAt(i));
	}
}

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64FromBytes(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i += 3) {
		const b0 = bytes[i] ?? 0;
		const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
		const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
		const triple = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
		out += B64_ALPHABET.charAt((triple >> 18) & 63);
		out += B64_ALPHABET.charAt((triple >> 12) & 63);
		out += b1 === undefined ? "=" : B64_ALPHABET.charAt((triple >> 6) & 63);
		out += b2 === undefined ? "=" : B64_ALPHABET.charAt(triple & 63);
	}
	return out;
}
