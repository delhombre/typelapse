export const springs = {
	snappy: { type: "spring" as const, stiffness: 400, damping: 30 },
	default: { type: "spring" as const, stiffness: 205, damping: 22 },
	gentle: { type: "spring" as const, stiffness: 120, damping: 18 },
};

export const STAGGER_DELAY = 0.04;

export const mountVariants = {
	hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
	visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};
