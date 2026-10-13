/**
 * Safezone: a phone on its back, a feed's chrome marked on its glass as dashed
 * zones: the tabs along the top, the rail of action buttons down the right, the
 * caption over the bottom. The video's code card lies on the screen under them.
 * The pointer draws the card across the glass on a spring; when it slides under
 * a zone, that zone's edge takes the bright stroke and the card gives it up. At
 * rest the card sits clear of all three, bright. The tuned number is how far the
 * card follows the pointer, as a share of the way.
 *
 * The pattern: a continuous input. One spring per axis for where, and the zone
 * read from the card's target, never its position, so the answer cannot flicker.
 */
import HL, { type ScreenPoint } from "./kernel";
import type { FigureContext, HairlineFigureDef } from "./types";

const {
	Cam,
	clamp,
	facing,
	fit,
	lerp,
	poly,
	proj,
	rings,
	rrect,
	ringAt,
	seg,
	unproj,
	spring,
	stepS,
	disposer,
	mk,
	place,
	pointer,
	prism,
	put,
	register,
	solid,
} = HL;

const PW = 78;
const PH = 156;
const PT = 7;
const GL = PT + 0.2;
const CW = 50;
const CD = 32;
const CT = 1.6;
const ZT = PT + CT + 0.4;
const SX0 = 5;
const SY0 = 7;
const SX1 = PW - 5;
const SY1 = PH - 7;
const HOME: [number, number] = [33, 52];

type Zone = "tabs" | "rail" | "caption";

/** The zones, on the glass: [x0, y0, x1, y1, radius]. */
const ZONES: Record<Zone, [number, number, number, number, number]> = {
	tabs: [14, 12, PW - 14, 22, 4],
	rail: [PW - 19, 66, PW - 8, 128, 5],
	caption: [9, 124, PW - 23, SY1 - 5, 4],
};
const ZONE_NAMES = Object.keys(ZONES) as Zone[];

/** Which zone a card centred on (cx, cy) slides under, or "safe". */
function under(cx: number, cy: number): Zone | "safe" {
	for (const name of ZONE_NAMES) {
		const [x0, y0, x1, y1] = ZONES[name];
		if (
			cx + CW / 2 > x0 + 1 &&
			cx - CW / 2 < x1 - 1 &&
			cy + CD / 2 > y0 + 1 &&
			cy - CD / 2 < y1 - 1
		) {
			return name;
		}
	}
	return "safe";
}

function mount({ stage, svg, read }: FigureContext, value: number) {
	const bag = disposer();
	let reach = value;
	const C = Cam(45, 0.5, 1.95);
	fit(
		C,
		[
			[0, 0, 0],
			[PW, PH, 0],
			[PW, 0, 0],
			[0, PH, 0],
			[0, 0, ZT],
		],
		200,
		162,
	);
	const P = proj(C);
	const front = facing(C);
	const g = mk("g", {}, svg);

	// the phone: a slab, the glass's edge, the island at the top
	// Rounded with 14 steps a corner (rule 09): at r 13 the default four show their facets.
	const br = rrect(0, 0, PW, PH, 13, 14);
	const bi = rrect(2, 2, PW - 2, PH - 2, 11, 14);
	put(solid(g), prism(P, front, br, bi, 0, PT));
	mk("path", { d: poly(ringAt(P, rrect(SX0, SY0, SX1, SY1, 9, 14), GL)), class: "nf" }, g);
	mk(
		"path",
		{ d: poly(ringAt(P, rrect(PW / 2 - 9, 2.6, PW / 2 + 9, 5.6, 1.5, 4), GL)), class: "nf lo" },
		g,
	);

	// the card: a plate with its title bar, three lights and three lines of code
	const card = solid(g);
	const bar = mk("path", { class: "nf lo" }, g);
	const code = mk("path", { class: "nf lo" }, g);
	const lights = [0, 1, 2].map(() => mk("circle", { r: 0.8, class: "dot m" }, g));

	// the zones lie over the card, as the feed's chrome lies over the video
	const zones = {} as Record<Zone, SVGPathElement>;
	for (const name of ZONE_NAMES) {
		const [x0, y0, x1, y1, r] = ZONES[name];
		zones[name] = mk(
			"path",
			{ d: poly(ringAt(P, rrect(x0, y0, x1, y1, r, 5), ZT)), class: "nf dash" },
			g,
		);
	}
	const rail = ZONES.rail;
	for (const k of [0, 1, 2, 3]) {
		const el = mk("circle", { r: 1.25, class: "dot off" }, g);
		place(el, P((rail[0] + rail[2]) / 2, rail[1] + 10 + k * 14, ZT));
	}

	const sx = spring(HOME[0]);
	const sy = spring(HOME[1]);
	const at = (u: number, v: number, z = PT + CT): ScreenPoint =>
		P(sx.x - CW / 2 + u, sy.x - CD / 2 + v, z);

	function draw() {
		const x0 = sx.x - CW / 2;
		const y0 = sy.x - CD / 2;
		const [cr, ci] = rings(x0, y0, x0 + CW, y0 + CD, 4, 1);
		put(card, prism(P, front, cr, ci, PT, PT + CT));
		bar.setAttribute("d", seg(at(1, 7), at(CW - 1, 7)));
		code.setAttribute(
			"d",
			[
				[0, 30],
				[2, 22],
				[2, 34],
			]
				.map(([i = 0, l = 0], k) =>
					seg(at(6 + i * 3, 13 + k * 5.5), at(6 + i * 3 + l * 1.1, 13 + k * 5.5)),
				)
				.join(""),
		);
		lights.forEach((el, k) => place(el, at(4.5 + k * 3, 3.6)));
	}

	let zone = "";
	function mark(z: Zone | "safe") {
		if (z === zone) {
			return;
		}
		zone = z;
		for (const name of ZONE_NAMES) {
			zones[name].setAttribute("class", `nf dash${name === z ? " hi" : ""}`);
		}
		card.sil.classList.toggle("hi", z === "safe");
	}
	mark("safe");

	const B = register(stage, (dt) => {
		const a = stepS(sx, dt);
		const b = stepS(sy, dt);
		draw();
		return a || b;
	});
	bag.add(B.unregister);

	function aim(x: number, y: number) {
		sx.t = clamp(x, SX0 + CW / 2 + 1, SX1 - CW / 2 - 1);
		sy.t = clamp(y, SY0 + CD / 2 + 1, SY1 - CD / 2 - 1);
		const z = under(sx.t, sy.t);
		mark(z);
		B.wake();
		return z;
	}

	bag.add(
		pointer(stage, {
			move: (p) => {
				const last = unproj(C, p[0], p[1], PT);
				const z = aim(lerp(HOME[0], last[0], reach), lerp(HOME[1], last[1], reach));
				read.textContent = z === "safe" ? "safe" : `under ${z}`;
			},
			leave: () => {
				aim(HOME[0], HOME[1]);
				read.textContent = "rest";
			},
		}),
	);
	bag.add(() => svg.replaceChildren());

	return {
		set: (v: number) => {
			reach = v;
		},
		destroy: bag.dispose,
	};
}

const safezone: HairlineFigureDef = {
	name: "safezone",
	means:
		"A phone with a feed's chrome marked on its glass: drawn under the rail or the caption, the code card would be covered.",
	rules: [1, 3, 4, 8],
	range: [0.6, 0.85, 1],
	tour: [[80, 200], [215, 200], [340, 130], null],
	mount,
};

export default safezone;
