import type { ScreenPoint } from "./kernel";

/** Where a figure says what is under the pointer: the caption beside its stage. */
export interface FigureReadOut {
	textContent: string | null;
}

export interface FigureContext {
	/** The element the pointer is read on; the kernel sizes it at 5:4. */
	stage: HTMLElement;
	/** The 400 x 320 drawing the figure fills. */
	svg: SVGSVGElement;
	read: FigureReadOut;
}

export interface FigureHandle {
	set: (value: number) => void;
	destroy: () => void;
}

/**
 * One hairline figure, in the shape the `hairline-create` skill writes them:
 * what it means, the rules it leans on, the one number it is tuned by at
 * intensity 0, 0.5 and 1, the lap a tour would take, and `mount`.
 */
export interface HairlineFigureDef {
	name: string;
	means: string;
	rules: number[];
	range: [number, number, number];
	tour: (ScreenPoint | null)[] | null;
	mount: (context: FigureContext, value: number) => FigureHandle;
}
