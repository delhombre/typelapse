export interface AudioCueTrim {
	readonly startMs: number;
	readonly endMs: number;
}

export interface AudioCueCreateProps {
	readonly id?: string;
	readonly assetId: string;
	readonly startMs?: number;
	readonly trim: AudioCueTrim;
	/** Normalized linear gain: 0 is silent, 1 is the source level. */
	readonly gain?: number;
	readonly fadeInMs?: number;
	readonly fadeOutMs?: number;
}

/** Editable authored values. Asset identity intentionally cannot be patched. */
export interface AudioCuePatch {
	readonly startMs?: number;
	readonly trimStartMs?: number;
	readonly trimEndMs?: number;
	readonly gain?: number;
	readonly fadeInMs?: number;
	readonly fadeOutMs?: number;
}

function isNonNegativeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

/** One occurrence of an audio asset on the project's global timeline. */
export class AudioCue {
	readonly id: string;
	readonly assetId: string;
	readonly startMs: number;
	readonly trim: Readonly<AudioCueTrim>;
	readonly gain: number;
	readonly fadeInMs: number;
	readonly fadeOutMs: number;
	readonly durationMs: number;
	readonly endMs: number;

	private constructor(props: AudioCueCreateProps) {
		if (props.id !== undefined && !props.id.trim()) {
			throw new Error("Audio cue id must not be empty");
		}
		if (!props.assetId.trim()) {
			throw new Error("Audio cue asset id must not be empty");
		}
		const startMs = props.startMs ?? 0;
		if (!isNonNegativeInteger(startMs)) {
			throw new Error("Audio cue start must be a non-negative integer");
		}
		if (
			!isNonNegativeInteger(props.trim.startMs) ||
			!Number.isSafeInteger(props.trim.endMs) ||
			props.trim.endMs <= props.trim.startMs
		) {
			throw new Error("Audio cue trim must have a non-negative start before its end");
		}
		const gain = props.gain ?? 1;
		if (!Number.isFinite(gain) || gain < 0 || gain > 1) {
			throw new Error("Audio cue gain must be between 0 and 1");
		}
		const fadeInMs = props.fadeInMs ?? 0;
		const fadeOutMs = props.fadeOutMs ?? 0;
		if (!isNonNegativeInteger(fadeInMs) || !isNonNegativeInteger(fadeOutMs)) {
			throw new Error("Audio cue fades must be non-negative integers");
		}
		const durationMs = props.trim.endMs - props.trim.startMs;
		if (fadeInMs + fadeOutMs > durationMs) {
			throw new Error("Audio cue fades must fit inside its trimmed duration");
		}
		const endMs = startMs + durationMs;
		if (!Number.isSafeInteger(endMs)) {
			throw new Error("Audio cue end must be a safe integer");
		}

		this.id = props.id ?? crypto.randomUUID();
		this.assetId = props.assetId;
		this.startMs = startMs;
		this.trim = Object.freeze({ ...props.trim });
		this.gain = gain;
		this.fadeInMs = fadeInMs;
		this.fadeOutMs = fadeOutMs;
		this.durationMs = durationMs;
		this.endMs = endMs;
		Object.freeze(this);
	}

	static create(props: AudioCueCreateProps): AudioCue {
		return new AudioCue(props);
	}

	/** Rebuild through the same invariant gate so preview and export receive canonical values. */
	withPatch(patch: AudioCuePatch): AudioCue {
		return AudioCue.create({
			id: this.id,
			assetId: this.assetId,
			startMs: patch.startMs ?? this.startMs,
			trim: {
				startMs: patch.trimStartMs ?? this.trim.startMs,
				endMs: patch.trimEndMs ?? this.trim.endMs,
			},
			gain: patch.gain ?? this.gain,
			fadeInMs: patch.fadeInMs ?? this.fadeInMs,
			fadeOutMs: patch.fadeOutMs ?? this.fadeOutMs,
		});
	}
}
