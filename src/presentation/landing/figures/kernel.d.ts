/**
 * Types for the hairline kernel (`kernel.js`, MIT, copied verbatim). Only what
 * the landing's five figures and `HairlineFigure` call is typed; the index at the
 * top of `kernel.js` is the reference for what each one does.
 */

/** A point on the 400 x 320 viewBox: [sx, sy]. */
export type ScreenPoint = [number, number];

/** A camera: azimuth, k = sin(elevation), scale, and the offset `fit` sets. */
export interface Camera {
	az: number;
	k: number;
	S: number;
	ox: number;
	oy: number;
}

/** One sample of a rounded ring, with its outward normal. */
export interface RingSample {
	u: number;
	v: number;
	nu: number;
	nv: number;
}

export type Project = (x: number, y: number, z: number) => ScreenPoint;

export interface PrismPaths {
	sil: string;
	crease: string;
}

export interface Solid {
	g: SVGGElement;
	sil: SVGPathElement;
	cr: SVGPathElement;
}

export interface Spring {
	x: number;
	v: number;
	t: number;
	k: number;
	c: number;
	m: number;
	eps: number;
}

export interface Tween {
	from: number;
	to: number;
	t0: number;
	dur: number;
}

export interface Board {
	wake: () => void;
	unregister: () => void;
}

export interface PointerHandlers {
	move: (point: ScreenPoint, event?: Event) => void;
	down?: (point: ScreenPoint, event?: Event) => void;
	leave: (event?: Event) => void;
}

export interface Disposer {
	add: (fn: () => void) => void;
	on: (
		target: EventTarget,
		type: string,
		fn: EventListener,
		opts?: AddEventListenerOptions,
	) => void;
	dispose: () => void;
}

export interface HairlineKernel {
	Cam: (azDeg: number, k: number, S: number) => Camera;
	fit: (C: Camera, points: [number, number, number][], cx: number, cy: number) => void;
	proj: (C: Camera) => Project;
	unproj: (C: Camera, sx: number, sy: number, z: number) => [number, number];
	facing: (C: Camera) => (sample: RingSample) => boolean;
	rrect: (u0: number, v0: number, u1: number, v1: number, r: number, n?: number) => RingSample[];
	circ: (R: number, n?: number) => RingSample[];
	rings: (
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		r: number,
		b: number,
	) => [RingSample[], RingSample[]];
	prism: (
		P: Project,
		front: (sample: RingSample) => boolean,
		ring: RingSample[],
		inner: RingSample[] | null,
		z0: number,
		z1: number,
	) => PrismPaths;
	ringAt: (P: Project, ring: RingSample[], z: number) => ScreenPoint[];
	run: (ring: RingSample[], keep: (sample: RingSample) => boolean) => RingSample[];
	hull: (points: ScreenPoint[]) => ScreenPoint[];
	fillet: (points: [number, number][], radii: number[], n?: number) => [number, number][];
	poly: (points: ScreenPoint[]) => string;
	open: (points: ScreenPoint[]) => string;
	seg: (a: ScreenPoint, b: ScreenPoint) => string;
	clamp: (v: number, a: number, b: number) => number;
	lerp: (a: number, b: number, t: number) => number;
	rad: (deg: number) => number;
	r2: (n: number) => number;
	spring: (x: number, opts?: { k?: number; c?: number; m?: number; eps?: number }) => Spring;
	stepS: (sp: Spring, dt: number) => boolean;
	tween: (v: number, dur?: number) => Tween;
	tset: (tw: Tween, to: number, now: number, delay: number) => void;
	tval: (tw: Tween, now: number) => number;
	tdone: (tw: Tween, now: number) => boolean;
	EASE_LIFT: (t: number) => number;
	reducedMotion: () => boolean;
	mk: <K extends keyof SVGElementTagNameMap>(
		tag: K,
		attrs?: Record<string, string | number> | null,
		parent?: Element | null,
	) => SVGElementTagNameMap[K];
	solid: (parent: Element) => Solid;
	put: (solid: Solid, paths: PrismPaths) => void;
	flatDot: (parent: Element, C: Camera, r: number, cls: string) => SVGEllipseElement;
	place: (el: Element, point: ScreenPoint) => void;
	register: (stage: Element, tick: (dt: number, now: number) => boolean) => Board;
	pointer: (stage: HTMLElement, handlers: PointerHandlers) => () => void;
	disposer: () => Disposer;
	inject: (root: Document | ShadowRoot) => void;
}

declare const HL: HairlineKernel;
export default HL;
