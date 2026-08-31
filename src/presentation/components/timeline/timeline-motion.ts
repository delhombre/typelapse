const INSTANT = { duration: 0 } as const;

const CONTEXT_ENTER = {
	duration: 0.16,
	ease: [0.22, 1, 0.36, 1] as const,
};

const CONTEXT_EXIT = {
	duration: 0.09,
	ease: [0.4, 0, 1, 1] as const,
};

const LAYOUT_SPRING = {
	type: "spring" as const,
	stiffness: 500,
	damping: 42,
	mass: 0.9,
};

/**
 * Timeline motion is split by intent:
 * - context changes are rare and may acknowledge themselves;
 * - pointer/keyboard manipulation must stay one-to-one and therefore instant;
 * - a completed pointer reorder gets a short, heavily damped settle.
 */
export function timelineMotion(reduceMotion: boolean, animateLayout: boolean) {
	return {
		context: reduceMotion
			? {
					initial: false as const,
					animate: { opacity: 1, y: 0, scale: 1, transition: INSTANT },
					exit: { opacity: 1, y: 0, scale: 1, transition: INSTANT },
				}
			: {
					initial: { opacity: 0, y: 3, scale: 0.985 },
					animate: { opacity: 1, y: 0, scale: 1, transition: CONTEXT_ENTER },
					exit: { opacity: 0, y: 2, scale: 0.992, transition: CONTEXT_EXIT },
				},
		layout: reduceMotion || !animateLayout ? INSTANT : LAYOUT_SPRING,
	};
}
