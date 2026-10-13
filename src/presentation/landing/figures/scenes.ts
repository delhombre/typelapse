/**
 * Scenes: a diff, printed as a listing on tractor-feed paper and laid on a
 * cutting mat. Its sprocket rails run the whole length and the page between
 * them is cut at the hunks, a dashed line across each cut. The page under the
 * pointer tears free and stands up on its front edge, and as it stands it
 * becomes a scene: the gutter's dots (a bright one for a line added, a dim one
 * for a line removed) close, the removed lines go and the code under them
 * closes up, a title bar and its three lights come on. Its neighbours stand
 * less, staggered outwards. At rest the first hunk already stands and the
 * second is lifting: the diff is turning into a video. The tuned number is
 * the stagger, in ms.
 *
 * The pattern: discrete items (Riffle's). Tweens, a stagger by distance, a hit
 * test on the ground plane, which never moves.
 */
import HL, { type ScreenPoint, type Tween } from "./kernel";
import type { FigureContext, HairlineFigureDef } from "./types";

const { Cam, clamp, facing, fit, proj, rad, rings, rrect, ringAt, seg, unproj } = HL;
const { tdone, tset, tval, tween, disposer, flatDot, mk, place, pointer, prism } = HL;
const { poly, put, register, solid } = HL;

/** Three pages, as the picture beside it holds three scenes: the code before the
    change, then one per hunk. */
const N = 3;
const RAIL = 10;
const WP = 100;
const W = WP + 2 * RAIL;
const D = 32;
const G = 35;
const LEN = (N - 1) * G + D;
/** The kerf between two cuts, and the blank paper run before the first page and after the last. */
const KERF = G - D;
const LEAD = 10;
const TK = 0.8;
const MT = 2.4;
const PZ = MT + 0.25;
const UP = 84;
const STEP = 34;
const LIFT = 5;
const REST = [80, 18, 0];
const PITCH = 5;
const CHAR = 4.6;
const MAT = { x0: -10, y0: -LEAD - 9, x1: W + 10, y1: LEN + LEAD + 9 };

type Kind = "c" | "a" | "d";
/** A page's lines, as the diff has them: context, added or deleted, then the indent and the
    length in character cells. */
const LINES: [Kind, number, number][][] = [
	"c0:15 d1:9 a1:12 c0:8",
	"a0:11 c1:16 d2:7 a2:10",
	"c1:13 d1:6 a1:14 a0:18",
].map((page) => page.split(" ").map((t) => [t[0] as Kind, Number(t[1]), Number(t.slice(3))]));

interface Page {
	back: SVGPathElement;
	face: SVGPathElement;
	bar: SVGPathElement;
	ctx: SVGPathElement;
	add: SVGPathElement;
	del: SVGPathElement;
	gutter: SVGCircleElement[];
	lights: SVGCircleElement[];
	a: Tween;
	z: Tween;
	drawn: string;
}

function mount({ stage, svg, read }: FigureContext, value: number) {
	const bag = disposer();
	let stag = value;

	const C = Cam(45, 0.5, 1.5);
	const far = [MAT.x0, MAT.x1].flatMap((x) => [MAT.y0, MAT.y1].map((y) => [x, y, 0]));
	fit(C, [...far, [MAT.x0, D, D + LIFT]] as [number, number, number][], 200, 170);
	const P = proj(C);
	const front = facing(C);
	const g = mk("g", {}, svg);

	// the cutting mat, with a ruler along its two near edges: a tick every 5, a long one every 25
	const [mr, mi] = rings(MAT.x0, MAT.y0, MAT.x1, MAT.y1, 6, 1.6);
	const mat = solid(g);
	put(mat, prism(P, front, mr, mi, 0, MT));
	// the mat is the base, a step quieter than the paper laid on it
	mat.sil.setAttribute("class", "");
	const ticks: string[] = [];
	for (let t = 0; t <= LEN + 5; t += 5) {
		ticks.push(seg(P(MAT.x1 - 2, t, MT), P(MAT.x1 - (t % 25 ? 4 : 6), t, MT)));
	}
	for (let t = 0; t <= W + 5; t += 5) {
		ticks.push(seg(P(t, MAT.y1 - 2, MT), P(t, MAT.y1 - (t % 25 ? 4 : 6), MT)));
	}
	mk("path", { d: ticks.join(""), class: "nf lo" }, g);

	// the paper: two sprocket rails the whole length, a hole every 7, a blank run at each end, and a
	// dashed cut line across the paper at every hunk
	const paper = (x0: number, y0: number, x1: number, y1: number) =>
		mk("path", { d: poly(ringAt(P, rrect(x0, y0, x1, y1, 1.4, 4), PZ)), class: "sil" }, g);
	for (const x0 of [0, W - RAIL]) {
		paper(x0, -LEAD, x0 + RAIL, LEN + LEAD);
	}
	paper(RAIL, -LEAD, W - RAIL, -KERF);
	paper(RAIL, LEN + KERF, W - RAIL, LEN + LEAD);
	for (let y = -LEAD + 5; y < LEN + LEAD - 2; y += 7) {
		for (const x of [RAIL / 2, W - RAIL / 2]) {
			place(flatDot(g, C, 1.05, "nf"), P(x, y, PZ));
		}
	}
	for (let i = 0; i <= N; i++) {
		const y = i * G - KERF / 2;
		mk("path", { d: seg(P(-1, y, PZ), P(W + 1, y, PZ)), class: "nf dash" }, g);
	}

	const shape = rrect(0, 0, WP, D, 2, 3);
	const pages: Page[] = [];
	for (let i = 0; i < N; i++) {
		const grp = mk("g", {}, g);
		const path = (cls: string) => mk("path", { class: cls }, grp);
		const dot = (cls: string) => mk("circle", { r: 0, class: cls }, grp);
		pages.push({
			back: path("lo"),
			face: path("sil"),
			bar: path("nf lo"),
			ctx: path("nf"),
			add: path("nf sil"),
			del: path("nf dash"),
			gutter: (LINES[i] ?? []).map(([kind]) => dot(kind === "a" ? "dot m" : "dot off")),
			lights: [0, 1, 2].map(() => dot("dot off")),
			a: tween(REST[i] ?? 0),
			z: tween(0),
			drawn: "",
		});
	}

	/** Page i stood th degrees up on its front edge, lifted by `lift`: as it stands it becomes a scene. */
	function draw(p: Page, i: number, th: number, lift: number) {
		const key = `${th.toFixed(2)}|${lift.toFixed(2)}`;
		if (key === p.drawn) {
			return;
		}
		p.drawn = key;
		const t = clamp(th / UP, 0, 1);
		const yf = i * G + D;
		const c = Math.cos(rad(th));
		const sn = Math.sin(rad(th));
		// local (u, v): u across the page, v from its back edge (0) to its front edge (D)
		const w = (u: number, v: number, off = 0): ScreenPoint =>
			P(RAIL + u, yf - (D - v) * c - off * sn, (D - v) * sn + lift + PZ - off * c);
		p.back.setAttribute("d", poly(shape.map((q) => w(q.u, q.v, TK))));
		p.face.setAttribute("d", poly(shape.map((q) => w(q.u, q.v))));
		p.bar.setAttribute("d", seg(w(1.2, 7), w(WP - 1.2, 7)));
		const rows: Record<Kind, string[]> = { c: [], a: [], d: [] };
		let gone = 0;
		(LINES[i] ?? []).forEach(([kind, ind, len], k) => {
			// a removed line shortens as the page stands, and the lines below it close up
			const keep = kind === "d" ? 1 - t : 1;
			const v = 14 + (k - gone * t) * PITCH;
			const u = 9 + ind * CHAR;
			rows[kind].push(seg(w(u, v), w(u + len * CHAR * keep, v)));
			if (kind === "d") {
				gone++;
			}
			const dot = p.gutter[k];
			if (dot) {
				dot.setAttribute("r", String(kind === "c" ? 0 : 0.9 * (1 - t)));
				place(dot, w(4.2, v));
			}
		});
		p.ctx.setAttribute("d", rows.c.join(""));
		p.add.setAttribute("d", rows.a.join(""));
		p.del.setAttribute("d", rows.d.join(""));
		p.lights.forEach((el, k) => {
			el.setAttribute("r", String(0.95 * t));
			place(el, w(5 + k * 3.4, 3.6));
		});
	}

	const B = register(stage, (_dt, now) => {
		let moving = false;
		pages.forEach((p, i) => {
			draw(p, i, tval(p.a, now), tval(p.z, now));
			if (!tdone(p.a, now) || !tdone(p.z, now)) {
				moving = true;
			}
		});
		return moving;
	});
	bag.add(B.unregister);

	/** The page whose footprint holds the pointer, read on the ground plane: -1 off the sheet. */
	function hit(p: ScreenPoint) {
		const [x, y] = unproj(C, p[0], p[1], PZ);
		if (x < MAT.x0 - 6 || x > MAT.x1 + 6 || y < MAT.y0 - 30 || y > MAT.y1 + 6) {
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
		pages.forEach((p, i) => {
			const th = a < 0 ? (REST[i] ?? 0) : clamp(UP - Math.abs(i - a) * STEP, 0, UP);
			const delay = Math.abs(i - from) * stag;
			tset(p.a, th, now, delay);
			tset(p.z, i === a ? LIFT : 0, now, delay);
			const lit = a < 0 ? i === 0 : i === a;
			p.face.classList.toggle("hi", lit);
			for (const el of p.lights) {
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
		"A diff printed on tractor-feed paper and cut at its hunks: the page under the pointer stands up as a scene, its neighbours less.",
	rules: [1, 2, 5, 9],
	range: [0, 40, 90],
	tour: [[200, 177], [163, 195], [237, 158], null],
	mount,
};

export default scenes;
