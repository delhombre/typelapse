import type { HighlightRange } from "../value-objects/highlight-range";

/**
 * Longest caption a step may carry. The renderers reserve exactly one line of
 * height for the caption block (`CAPTION_BLOCK` in `frame-metrics`) before
 * fitting the card into the canvas, so a caption that wrapped to a second line
 * would render taller than the layout budgeted and push itself off the canvas,
 * worst on the narrow 9:16 preset. `StepCaption` therefore paints one line and
 * ellipsises the overflow.
 *
 * No character count can *guarantee* a fit: the caption band is as wide as the
 * card, and the card is as wide as the widest line of code, so a step with short
 * code has little room. This bound is the "one short line" the product asks for,
 * chosen so an ordinary caption clears the common case (80 chars is roughly
 * 465px at the preview's 13px Inter, against a 608px card) and long ones are
 * refused at the factory instead of being silently cut on export.
 */
export const MAX_ANNOTATION_LENGTH = 80;

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

	/**
	 * Trim a caption to what actually renders: surrounding whitespace never
	 * reaches the screen, and a blank caption is the same thing as none at all
	 * (both leave today's layout untouched). Rejects anything over the bound.
	 */
	private static normalizeAnnotation(annotation: string | undefined): string | undefined {
		if (annotation === undefined) {
			return undefined;
		}
		if (annotation.length > MAX_ANNOTATION_LENGTH) {
			throw new Error(`Step annotation must be at most ${MAX_ANNOTATION_LENGTH} characters`);
		}
		const trimmed = annotation.trim();
		return trimmed === "" ? undefined : trimmed;
	}

	static create(props: StepProps): Step {
		const duration = props.duration ?? 1000;
		Step.assertValid(props.code, duration);
		return new Step({
			id: crypto.randomUUID(),
			code: props.code,
			duration,
			highlightRanges: props.highlightRanges ?? [],
			annotation: Step.normalizeAnnotation(props.annotation),
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
			annotation:
				"annotation" in changes ? Step.normalizeAnnotation(changes.annotation) : this.annotation,
		});
	}
}
