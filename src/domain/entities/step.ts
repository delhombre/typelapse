import type { HighlightRange } from "../value-objects/highlight-range";

export interface StepProps {
	code: string;
	duration?: number;
	highlightRanges?: HighlightRange[];
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

	static create(props: StepProps): Step {
		if (!props.code.trim()) {
			throw new Error("Step code must not be empty");
		}
		const duration = props.duration ?? 1000;
		if (duration <= 0) {
			throw new Error("Duration must be positive");
		}
		return new Step({
			id: crypto.randomUUID(),
			code: props.code,
			duration,
			highlightRanges: props.highlightRanges ?? [],
			annotation: props.annotation,
		});
	}
}
