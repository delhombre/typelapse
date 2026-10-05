const ENTER_SECONDS = 0.18;
const EXIT_SECONDS = 0.12;
/** A reduced-motion change is a cut: opacity lands in one frame. */
const CUT_SECONDS = 0.01;
/** The studio's `--ease-out`, for what appears in answer to a click. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** What leaves accelerates away; nobody needs to watch it settle. */
const EASE_IN = [0.4, 0, 1, 1] as const;

// A type alias, not an interface: Motion's target type has a CSS-variable index
// signature, which only an alias satisfies implicitly.
type PopoverFrame = {
	opacity: number;
	y?: number;
	scale?: number;
	filter?: string;
};

/**
 * The motion of the source hub's menu and of its two form popovers.
 *
 * They are one family of surfaces opening from the same trigger, and each used
 * to write its own copy: the menu entered at 0.97 and the forms at 0.96, and the
 * forms kept their blur under reduced motion, which strips transforms but not
 * filters. A popover grows from a hint of scale, never from nothing, out of the
 * corner it is anchored to (the caller sets `transformOrigin`), and leaves
 * faster and quieter than it came. Reduced motion keeps opacity alone.
 */
export function sourcePopoverMotion(reduce: boolean) {
	const initial: PopoverFrame = reduce
		? { opacity: 0 }
		: { opacity: 0, y: -5, scale: 0.97, filter: "blur(4px)" };
	const animate: PopoverFrame = reduce
		? { opacity: 1 }
		: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" };
	const exit: PopoverFrame & { transition: { duration: number; ease: typeof EASE_IN } } = reduce
		? { opacity: 0, transition: { duration: CUT_SECONDS, ease: EASE_IN } }
		: {
				opacity: 0,
				y: -3,
				scale: 0.98,
				filter: "blur(2px)",
				transition: { duration: EXIT_SECONDS, ease: EASE_IN },
			};

	return {
		initial,
		animate,
		exit,
		transition: { duration: reduce ? CUT_SECONDS : ENTER_SECONDS, ease: EASE_OUT },
	};
}
