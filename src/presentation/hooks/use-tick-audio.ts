import {
	collectTickEvents,
	encodeWavBase64,
	renderTickTrack,
} from "@/application/audio/tick-synth";
import { buildTimeline } from "@/application/magic-move/timeline";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useEffect } from "react";

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}
	return (
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
	);
}

/** Keep a resumed preview track aligned with the exact frame held by the scrubber. */
export function previewAudioOffsetSeconds(
	playbackProgress: number,
	totalMs: number,
	decodeMs: number,
	bufferDurationSeconds: number,
): number {
	const progress = Math.min(Math.max(playbackProgress, 0), 1);
	const requested = (progress * Math.max(totalMs, 0) + Math.max(decodeMs, 0)) / 1000;
	return Math.min(Math.max(requested, 0), Math.max(bufferDurationSeconds, 0));
}

/**
 * Preview parity for synthesized typing sounds. When the Sound toggle is on and
 * playback starts, this renders the SAME tick track the export bakes in (same
 * pure functions, same timeline numbers), decodes it, and plays it as one buffer
 * source synced to the visual start, so the preview is audibly identical to the
 * video. Work is lazy (nothing runs unless sound is on), and the AudioContext is
 * created on the play-driven state change so autoplay policy is satisfied.
 */
export function useTickAudio(): void {
	const isPlaying = useSnippetStore((s) => s.isPlaying);
	const sound = useExportStore((s) => s.sound);

	useEffect(() => {
		if (!sound || !isPlaying) {
			return;
		}
		const Ctor = getAudioContextCtor();
		if (!Ctor) {
			return;
		}

		// Read inputs fresh at play start: the exact numbers the export route uses.
		const { steps } = useSnippetStore.getState().snippet;
		if (steps.length < 2) {
			return;
		}
		const { transitionMs, typewriter } = useExportStore.getState();
		const holds = steps.map((s) => s.duration);
		const events = collectTickEvents({
			typewriter,
			firstCodeLength: steps[0]?.code.length ?? 0,
			holds,
			transitionMs,
		});
		const totalMs = buildTimeline(holds, transitionMs).totalMs;
		const startProgress = useSnippetStore.getState().playbackProgress;
		const dataUrl = encodeWavBase64(renderTickTrack(events, totalMs), 44100);

		const ctx = new Ctor();
		ctx.resume().catch(() => undefined);
		const startedAt = performance.now();
		let source: AudioBufferSourceNode | null = null;
		let cancelled = false;

		fetch(dataUrl)
			.then((res) => res.arrayBuffer())
			.then((buf) => ctx.decodeAudioData(buf))
			.then((audioBuffer) => {
				if (cancelled) {
					return;
				}
				source = ctx.createBufferSource();
				source.buffer = audioBuffer;
				source.connect(ctx.destination);
				// Start at the held timeline frame, then skip decode time so sound and
				// motion resume together instead of replaying ticks from the beginning.
				const offset = previewAudioOffsetSeconds(
					startProgress,
					totalMs,
					performance.now() - startedAt,
					audioBuffer.duration,
				);
				source.start(0, Math.max(0, offset));
			})
			.catch(() => undefined);

		return () => {
			cancelled = true;
			if (source) {
				try {
					source.stop();
				} catch {
					// Already stopped or ended: safe to ignore.
				}
				source.disconnect();
			}
			ctx.close().catch(() => undefined);
		};
	}, [sound, isPlaying]);
}
