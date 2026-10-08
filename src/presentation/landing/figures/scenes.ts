/**
 * Scenes: a pull request laid flat on a plinth, cut at its hunks into five
 * slices. The slice under the pointer stands up on its front edge and becomes a
 * scene, a small window with its title bar on top and its code facing you; the
 * slices beside it rise less, staggered outwards from it. At rest the first
 * hunk already stands and the second is lifting: the diff is turning into a
 * video. The tuned number is the stagger, in ms.
 *
 * The pattern: discrete items (Riffle's). Tweens, a stagger by distance, a hit
 * test on the ground plane, which never moves.
 */
import HL, { type ScreenPoint, type Tween } from "./kernel";
import type { FigureContext, HairlineFigureDef } from "./types";

const {
	Cam,
	clamp,
	facing,
	fillet,
	fit,
	poly,
	proj,
	rad,
	rings,
	seg,
	unproj,
	tdone,
	tset,
	tval,
	tween,
	disposer,
	mk,
	place,
	pointer,
	prism,
	put,
	register,
	solid,
} = HL;

const N = 5;
const W = 112;
const D = 30;
const G = 35;
const TK = 1.4;
const UP = 84;
const STEP = 34;
const LIFT = 5;
const REST = [80, 26, 7, 0, 0];
/** Each hunk's code, as [indent, length] per line, in character cells of 4.6. */
const CODE: [number, number][][] = [
	[
		[0, 15],
		[1, 9],
		[1, 12],
	],
	[
		[0, 11],
		[1, 16],
		[2, 7],
	],
	[
		[1, 13],
		[1, 6],
		[0, 18],
	],
	[
		[0, 8],
		[1, 14],
		[1, 10],
	],
	[
		[0, 17],
		[2, 9],
		[0, 5],
	],
];
const PX0 = -8;
const PX1 = W + 8;
const PY0 = -8;
const PY1 = N * G + 2;

interface Slice {
	back: SVGPathElement;
	face: SVGPathElement;
	bar: SVGPathElement;
	code: SVGPathElement;
	lights: SVGCircleElement[];
	a: Tween;
	z: Tween;
}

function mount({ stage, svg, read }: FigureContext, value: number) {
	const bag = disposer();
	let stag = value;

	const C = Cam(45, 0.5, 1.42);
	fit(
		C,
		[
			[PX0, PY0, -5],
			[PX1, PY1, -5],
			[PX1, PY0, -5],
			[PX0, PY1, -5],
			[PX0, D - G + G, D + LIFT],
			[PX1, D, D + LIFT],
		],
		200,
		170,
	);
	const P = proj(C);
	const front = facing(C);
	const g = mk("g", {}, svg);

	// the plinth the pull request lies on, and the dashed cuts between its hunks
	const [pr, pi] = rings(PX0, PY0, PX1, PY1, 7, 2);
	put(solid(g), prism(P, front, pr, pi, -5, 0));
	for (let i = 1; i < N; i++) {
		mk(
			"path",
			{ d: seg(P(PX0 + 3, i * G - 2.5, 0), P(PX1 - 3, i * G - 2.5, 0)), class: "nf dash" },
			g,
		);
	}

	const shape = fillet(
		[
			[0, 0],
			[W, 0],
			[W, D],
			[0, D],
		],
		[3, 3, 3, 3],
	);
	const slices: Slice[] = [];
	for (let i = 0; i < N; i++) {
		const grp = mk("g", {}, g);
		const back = mk("path", { class: "lo" }, grp);
		const face = mk("path", { class: "sil" }, grp);
		const bar = mk("path", { class: "nf" }, grp);
		const code = mk("path", { class: "nf lo" }, grp);
		const lights = [0, 1, 2].map(() => mk("circle", { r: 0.95, class: "dot off" }, grp));
		slices.push({ back, face, bar, code, lights, a: tween(REST[i] ?? 0), z: tween(0) });
	}

	/** Slice i stood th degrees up on its front edge (y = yf), lifted by `lift`. */
	function draw(s: Slice, i: number, th: number, lift: number) {
		const yf = i * G + D;
		const c = Math.cos(rad(th));
		const sn = Math.sin(rad(th));
		// local (u, v): u across, v from the back edge (0) to the front edge (D)
		const w = (u: number, v: number): ScreenPoint => P(u, yf - (D - v) * c, (D - v) * sn + lift);
		const b = (u: number, v: number): ScreenPoint =>
			P(u, yf - (D - v) * c - TK * sn, (D - v) * sn + lift - TK * c);
		s.back.setAttribute("d", poly(shape.map((q) => b(q[0], q[1]))));
		s.face.setAttribute("d", poly(shape.map((q) => w(q[0], q[1]))));
		s.bar.setAttribute("d", seg(w(1.2, 7), w(W - 1.2, 7)));
		s.code.setAttribute(
			"d",
			(CODE[i] ?? [])
				.map(([ind, len], k) =>
					seg(w(9 + ind * 4.6, 13 + k * 5.4), w(9 + (ind + len) * 4.6, 13 + k * 5.4)),
				)
				.join(""),
		);
		s.lights.forEach((el, k) => place(el, w(5 + k * 3.4, 3.6)));
	}

	const B = register(stage, (_dt, now) => {
		let moving = false;
		slices.forEach((s, i) => {
			draw(s, i, tval(s.a, now), tval(s.z, now));
			if (!tdone(s.a, now) || !tdone(s.z, now)) {
				moving = true;
			}
		});
		return moving;
	});
	bag.add(B.unregister);

	/** The slice whose footprint holds the pointer, read on the ground plane: -1 off the sheet. */
	function hit(p: ScreenPoint) {
		const [x, y] = unproj(C, p[0], p[1], 0);
		if (x < PX0 - 6 || x > PX1 + 6 || y < PY0 - 30 || y > PY1 + 6) {
			return -1;
		}
		return clamp(Math.floor(y / G), 0, N - 1);
	}

	let act = -2;
	function setActive(a: number) {
		if (a === act) {
			return;
		}
		const now = performance.now();
		const from = a >= 0 ? a : Math.max(0, act);
		act = a;
		slices.forEach((s, i) => {
			const th = a < 0 ? (REST[i] ?? 0) : clamp(UP - Math.abs(i - a) * STEP, 0, UP);
			const delay = Math.abs(i - from) * stag;
			tset(s.a, th, now, delay);
			tset(s.z, i === a ? LIFT : 0, now, delay);
			const lit = a < 0 ? i === 0 : i === a;
			s.face.classList.toggle("hi", lit);
			for (const el of s.lights) {
				el.setAttribute("class", lit ? "dot m" : "dot off");
			}
		});
		read.textContent = a < 0 ? "rest" : `scene ${String(a + 1).padStart(2, "0")}`;
		B.wake();
	}
	setActive(-1);

	bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
	bag.add(() => svg.replaceChildren());

	return {
		set: (v: number) => {
			stag = v;
		},
		destroy: bag.dispose,
	};
}

const scenes: HairlineFigureDef = {
	name: "scenes",
	means:
		"A pull request cut at its hunks: the slice under the pointer stands up as a scene, its neighbours rising less.",
	rules: [1, 2, 5, 9],
	range: [0, 40, 90],
	tour: [[271, 141], [201, 176], [131, 211], null],
	mount,
};

export default scenes;
