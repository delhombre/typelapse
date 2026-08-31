/** A CSS-compatible cubic Bézier curve: x1, y1, x2, y2. */
export type CubicBezier = readonly [number, number, number, number];

export interface TransitionEasingPreset {
	id: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out" | "smooth";
	label: string;
	value: CubicBezier;
}

/**
 * The compact, familiar palette used by ui.camera. Keeping the values here in
 * the application layer means the preview, both exporters, and the editor all
 * describe the same curve instead of maintaining look-alike presets.
 */
export const TRANSITION_EASING_PRESETS: readonly TransitionEasingPreset[] = [
	{ id: "linear", label: "Linear", value: [0, 0, 1, 1] },
	{ id: "ease", label: "Ease", value: [0.25, 0.1, 0.25, 1] },
	{ id: "ease-in", label: "Ease in", value: [0.42, 0, 1, 1] },
	{ id: "ease-out", label: "Ease out", value: [0, 0, 0.58, 1] },
	{ id: "ease-in-out", label: "Ease in out", value: [0.42, 0, 0.58, 1] },
	{ id: "smooth", label: "Smooth", value: [0.22, 1, 0.36, 1] },
] as const;

/** Preserve Typelapse's existing symmetric morph feel for older projects. */
export const DEFAULT_TRANSITION_EASING: CubicBezier = [0.42, 0, 0.58, 1];

export function isCubicBezier(value: unknown): value is CubicBezier {
	if (!Array.isArray(value) || value.length !== 4) {
		return false;
	}
	const [x1, y1, x2, y2] = value;
	return (
		typeof x1 === "number" &&
		Number.isFinite(x1) &&
		x1 >= 0 &&
		x1 <= 1 &&
		typeof y1 === "number" &&
		Number.isFinite(y1) &&
		typeof x2 === "number" &&
		Number.isFinite(x2) &&
		x2 >= 0 &&
		x2 <= 1 &&
		typeof y2 === "number" &&
		Number.isFinite(y2)
	);
}

/**
 * Evaluate a CSS cubic-bezier at timeline progress `x`.
 *
 * The polynomial parameter is not time: CSS first solves the curve's x axis,
 * then reads y at that parameter. Newton converges quickly for ordinary curves;
 * bisection is the stable fallback around flat tangents.
 */
export function cubicBezierAt(curve: CubicBezier, x: number): number {
	if (x <= 0) {
		return 0;
	}
	if (x >= 1) {
		return 1;
	}

	const [x1, y1, x2, y2] = curve;
	let parameter = x;
	for (let iteration = 0; iteration < 8; iteration++) {
		const error = sample(parameter, x1, x2) - x;
		if (Math.abs(error) < 1e-7) {
			return sample(parameter, y1, y2);
		}
		const slope = sampleSlope(parameter, x1, x2);
		if (Math.abs(slope) < 1e-7) {
			break;
		}
		parameter -= error / slope;
		if (parameter < 0 || parameter > 1) {
			break;
		}
	}

	let low = 0;
	let high = 1;
	parameter = x;
	for (let iteration = 0; iteration < 16; iteration++) {
		const estimate = sample(parameter, x1, x2);
		if (Math.abs(estimate - x) < 1e-7) {
			break;
		}
		if (estimate < x) {
			low = parameter;
		} else {
			high = parameter;
		}
		parameter = (low + high) / 2;
	}
	return sample(parameter, y1, y2);
}

function sample(parameter: number, control1: number, control2: number): number {
	const inverse = 1 - parameter;
	return (
		3 * inverse * inverse * parameter * control1 +
		3 * inverse * parameter * parameter * control2 +
		parameter * parameter * parameter
	);
}

function sampleSlope(parameter: number, control1: number, control2: number): number {
	const inverse = 1 - parameter;
	return (
		3 * inverse * inverse * control1 +
		6 * inverse * parameter * (control2 - control1) +
		3 * parameter * parameter * (1 - control2)
	);
}
