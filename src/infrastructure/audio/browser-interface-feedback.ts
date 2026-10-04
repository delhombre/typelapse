import type { FeedbackCue } from "@/application/audio/interface-feedback";

/**
 * A tiny procedural Web Audio renderer for interface feedback.
 *
 * It creates no context until a user's gesture asks for a cue and loads no
 * asset. Short attack/release ramps prevent speaker clicks; the compressor is
 * the final safety rail when a double-click overlaps two already-quiet voices.
 */
export class BrowserInterfaceFeedback {
	private context: AudioContext | null = null;
	private bus: GainNode | null = null;

	play(cue: FeedbackCue): void {
		const context = this.audioContext();
		if (!context) {
			return;
		}
		if (context.state === "suspended") {
			void context.resume();
		}
		const bus = this.bus;
		if (!bus) {
			return;
		}
		const now = context.currentTime + 0.003;
		for (const voice of cue.voices) {
			const oscillator = context.createOscillator();
			const envelope = context.createGain();
			const startsAt = now + voice.startMs / 1000;
			const endsAt = startsAt + voice.durationMs / 1000;
			const attackEndsAt = Math.min(startsAt + 0.006, endsAt);

			oscillator.type = voice.oscillator;
			oscillator.frequency.setValueAtTime(voice.frequency, startsAt);
			if (voice.endFrequency !== undefined) {
				oscillator.frequency.exponentialRampToValueAtTime(voice.endFrequency, endsAt);
			}

			envelope.gain.setValueAtTime(0.0001, startsAt);
			envelope.gain.exponentialRampToValueAtTime(voice.gain, attackEndsAt);
			envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt);
			oscillator.connect(envelope);
			envelope.connect(bus);
			oscillator.start(startsAt);
			oscillator.stop(endsAt + 0.004);
		}
	}

	private audioContext(): AudioContext | null {
		if (this.context) {
			return this.context;
		}
		const Context = window.AudioContext;
		if (!Context) {
			return null;
		}
		try {
			const context = new Context({ latencyHint: "interactive" });
			const compressor = context.createDynamicsCompressor();
			compressor.threshold.value = -24;
			compressor.knee.value = 16;
			compressor.ratio.value = 8;
			compressor.attack.value = 0.002;
			compressor.release.value = 0.08;
			const bus = context.createGain();
			bus.gain.value = 0.72;
			bus.connect(compressor);
			compressor.connect(context.destination);
			this.context = context;
			this.bus = bus;
			return context;
		} catch {
			return null;
		}
	}
}
