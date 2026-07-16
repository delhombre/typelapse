import type { HighlightRange } from "../value-objects/highlight-range";

export interface StepProps {
	code: string;
	duration?: number;
	highlightRanges?: HighlightRange[];
	annotation?: string;
}

/** Field edits accepted by `Step.with`: anything omitted is carried over. */
export interface StepChanges {
	code?: string;
	duration?: number;
	highlightRanges?: readonly HighlightRange[];
	/** Pass `undefined` explicitly to clear the annotation. */
	annotation?: string;
}

export class Step {
	readonly id: string;
	readonly code: string;
	readonly duration: number;
	readonly highlightRanges: readonly HighlightRange[];
	readonly annotation?: string;

	private constructor(props: {
		id: string;
		code: string;
		duration: number;
		highlightRanges: readonly HighlightRange[];
		annotation?: string;
	}) {
		this.id = props.id;
		this.code = props.code;
		this.duration = props.duration;
		this.highlightRanges = props.highlightRanges;
		this.annotation = props.annotation;
	}

	private static assertValid(code: string, duration: number): void {
		if (!code.trim()) {
			throw new Error("Step code must not be empty");
		}
		if (duration <= 0) {
			throw new Error("Duration must be positive");
		}
	}

	static create(props: StepProps): Step {
		const duration = props.duration ?? 1000;
		Step.assertValid(props.code, duration);
		return new Step({
			id: crypto.randomUUID(),
			code: props.code,
			duration,
			highlightRanges: props.highlightRanges ?? [],
			annotation: props.annotation,
		});
	}

	/**
	 * Clone with the given changes, preserving identity. Edits to an existing
	 * step (duration, focus, caption) must keep its `id` stable (React keys,
	 * drag state and captured ids all rely on it) so this is the only correct
	 * way to derive an edited step. Validates like `create`.
	 */
	with(changes: StepChanges): Step {
		const code = changes.code ?? this.code;
		const duration = changes.duration ?? this.duration;
		Step.assertValid(code, duration);
		return new Step({
			id: this.id,
			code,
			duration,
			highlightRanges: changes.highlightRanges ?? this.highlightRanges,
			annotation: "annotation" in changes ? changes.annotation : this.annotation,
		});
	}
}
