/**
 * Glide: a code window lying flat, its code laid out as tokens, small rounded
 * slabs on a monospace grid. The pointer's x is the morph between two frames
 * of the same file: tokens both frames share hop and glide to their new place,
 * a token the second frame drops shrinks away first, and the new ones grow in
 * last, the product's two-beat morph. At rest the window is caught mid-morph.
 * The token that travels furthest has the bright edge. The tuned number is how
 * far each line trails the one above it, in morph units.
 *
 * The pattern: a continuous input (Terrain's clock): one spring for where the
 * pointer is, read through the screen x of the window's own corners, which
 * never move.
 */
import HL, { type Solid } from "./kernel";
import type { FigureContext, HairlineFigureDef } from "./types";

const {
	Cam,
	clamp,
	facing,
	fit,
	lerp,
	prism,
	proj,
	rings,
	seg,
	spring,
	stepS,
	disposer,
	flatDot,
	mk,
	place,
	pointer,
	put,
	register,
	solid,
	EASE_LIFT,
} = HL;

const CH = 4.6;
const LH = 10.6;
const TOP = 14;
const W = 124;
const D = TOP + 6 * LH + 5;
const TH = 2.2;
const DEPTH = 5.4;
const HOP = 7;
const REST = 0.42;
const FAR = 2;

/** A token's place on the grid: [row, col, length]. */
type Cell = [number, number, number];

/** Each token: its cell in the first frame and in the second, or null where it does not exist. */
const TOKENS: [Cell | null, Cell | null][] = [
	[
		[0, 0, 6],
		[0, 0, 6],
	],
	[
		[0, 7, 14],
		[0, 7, 14],
	],
	[
		[1, 0, 8],
		[4, 0, 8],
	],
	[
		[1, 9, 9],
		[4, 9, 9],
	],
	[
		[2, 2, 9],
		[2, 2, 9],
	],
	[
		[2, 12, 10],
		[2, 12, 10],
	],
	[
		[3, 2, 6],
		[3, 2, 6],
	],
	[[3, 9, 11], null],
	[null, [1, 0, 8]],
	[null, [1, 9, 8]],
	[null, [3, 9, 5]],
	[
		[4, 2, 7],
		[5, 2, 7],
	],
	[
		[4, 10, 8],
		[5, 10, 6],
	],
];
const X0 = 10;
const Y0 = TOP + 1.6;

interface Box {
	x: number;
	y: number;
	w: number;
}

const box = ([r, c, l]: Cell): Box => ({ x: X0 + c * CH, y: Y0 + r * LH, w: l * CH - 1.2 });

interface Token {
	a: Box | null;
	b: Box | null;
	row: number;
	el: Solid;
	drawn: string;
}

/** [x, y, z lift, w] */
type Pose = [number, number, number, number];

function mount({ stage, svg, read }: FigureContext, value: number) {
	const bag = disposer();
	let trail = value;
	const C = Cam(45, 0.5, 2.16);
	fit(
		C,
		[
			[0, 0, -4],
			[W, D, -4],
			[W, 0, -4],
			[0, D, -4],
			[W / 2, D / 2, TH + HOP],
		],
		200,
		166,
	);
	const P = proj(C);
	const front = facing(C);
	const g = mk("g", {}, svg);

	// the window: a slab with its title bar, three lights and a dot per line
	const [wr, wi] = rings(0, 0, W, D, 7, 1.8);
	put(solid(g), prism(P, front, wr, wi, -4, 0));
	mk("path", { d: seg(P(1.6, TOP - 3, 0), P(W - 1.6, TOP - 3, 0)), class: "nf lo" }, g);
	for (const k of [0, 1, 2]) {
		place(flatDot(g, C, 0.85, "dot m"), P(6 + k * 4, 5, 0));
	}
	for (let r = 0; r < 6; r++) {
		place(flatDot(g, C, 0.5, "dot off"), P(5, Y0 + r * LH + DEPTH / 2, 0));
	}

	const toks: Token[] = TOKENS.map(([a, b]) => ({
		a: a && box(a),
		b: b && box(b),
		row: (b ?? a ?? [0])[0],
		el: solid(g),
		drawn: "",
	}));
	toks[FAR]?.el.sil.classList.add("hi");
	const sp = spring(REST, { eps: 0.0005 });

	/** Where token t is at morph p, or null once it has gone. */
	function pose(t: Token, p: number): Pose | null {
		const q = clamp((p - trail * t.row) / (1 - trail * 5), 0, 1);
		if (t.a && t.b) {
			const e = EASE_LIFT(clamp(q / 0.62, 0, 1));
			return [
				lerp(t.a.x, t.b.x, e),
				lerp(t.a.y, t.b.y, e),
				HOP * Math.sin(Math.PI * e),
				lerp(t.a.w, t.b.w, e),
			];
		}
		if (t.a) {
			const k = 1 - clamp(q / 0.35, 0, 1);
			return k > 0.02 ? [t.a.x, t.a.y, 0, t.a.w * k] : null;
		}
		if (!t.b) {
			return null;
		}
		const k = clamp((q - 0.55) / 0.4, 0, 1);
		return k > 0.02 ? [t.b.x, t.b.y, 0, t.b.w * k] : null;
	}

	function draw(p: number) {
		const order: [number, Token][] = [];
		for (const t of toks) {
			const s = pose(t, p);
			let key = "";
			if (s) {
				const w = Math.max(1.4, s[3]);
				const [ring, inner] = rings(
					s[0],
					s[1],
					s[0] + w,
					s[1] + DEPTH,
					1.6,
					Math.min(0.55, w / 2 - 0.15),
				);
				key = s.map((n) => n.toFixed(2)).join();
				if (key !== t.drawn) {
					put(t.el, prism(P, front, ring, inner, s[2], s[2] + TH));
				}
				order.push([s[0] + w / 2 + s[1] + DEPTH / 2, t]);
			} else if (t.drawn) {
				put(t.el, { sil: "", crease: "" });
			}
			t.drawn = key;
		}
		// back to front by x + y, so a hopping token passes over the line it crosses
		order.sort((m, n) => m[0] - n[0]);
		for (const [, t] of order) {
			g.append(t.el.g);
		}
	}

	const B = register(stage, (dt) => {
		const m = stepS(sp, dt);
		draw(sp.x);
		return m;
	});
	bag.add(B.unregister);

	// the window's screen corners at rest: the pointer's x between them is the morph
	const L = P(0, D, 0)[0];
	const R = P(W, 0, 0)[0];
	const say = (p: number) => {
		read.textContent = `morph ${Math.round(p * 100)}%`;
	};
	bag.add(
		pointer(stage, {
			move: (pt) => {
				sp.t = clamp(((pt[0] - L) / (R - L)) * 1.2 - 0.1, 0, 1);
				say(sp.t);
				B.wake();
			},
			leave: () => {
				sp.t = REST;
				read.textContent = "rest";
				B.wake();
			},
		}),
	);
	bag.add(() => svg.replaceChildren());

	return {
		set: (v: number) => {
			trail = v;
			B.wake();
		},
		destroy: bag.dispose,
	};
}

const glide: HairlineFigureDef = {
	name: "glide",
	means:
		"Two frames of one file: under the pointer the shared tokens glide to their new places, the dropped ones go first, the new ones last.",
	rules: [3, 5, 8, 9],
	range: [0, 0.05, 0.1],
	tour: [[110, 170], [290, 170], [200, 150], null],
	mount,
};

export default glide;
