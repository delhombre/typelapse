/**
 * Queue: a render server, a tall cabinet with a mouth in its side and vents
 * down its front, and a rail of jobs waiting at the mouth. Each job is a flat
 * case whose dots say its size: one for 1080p, two for 1440p, three for 4K.
 * The pointer picks a job: it rises off the rail and its neighbours rise less,
 * staggered outwards. At rest the first job is at the mouth, lifted, being
 * rendered. The tuned number is the stagger, in ms.
 *
 * The pattern: one of many (Riffle's). The hit test reads the rail's top plane,
 * which never moves.
 */
import HL, { type RingSample, type ScreenPoint, type Solid, type Tween } from "./kernel";
import type { FigureContext, HairlineFigureDef } from "./types";

const {
	Cam,
	clamp,
	facing,
	fit,
	poly,
	proj,
	rings,
	rrect,
	seg,
	unproj,
	tdone,
	tset,
	tval,
	tween,
	disposer,
	flatDot,
	mk,
	place,
	pointer,
	prism,
	put,
	register,
	solid,
} = HL;

const SW = 46;
const SD = 46;
const SH = 74;
const N = 5;
const JX = SW + 10;
const PITCH = 31;
const JW = 24;
const JY0 = 9;
const JY1 = 37;
const JT = 7;
const RT = 2.4;
const LIFT = 15;
const SIZES = [3, 1, 2, 1, 3];
const NAMES = ["", "1080p", "1440p", "4K"];
const REST = [7, 0, 0, 0, 0];

interface Job {
	el: Solid;
	dots: SVGEllipseElement[];
	x0: number;
	ring: [RingSample[], RingSample[]];
	z: Tween;
	drawn: number;
}

function mount({ stage, svg, read }: FigureContext, value: number) {
	const bag = disposer();
	let stag = value;
	const C = Cam(45, 0.5, 1.72);
	const RX1 = JX + N * PITCH - 4;
	fit(
		C,
		[
			[0, 0, 0],
			[SW, SD, 0],
			[RX1, 0, 0],
			[RX1, SD, 0],
			[0, 0, SH],
			[SW, 0, SH],
			[RX1 - PITCH, JY1, RT + JT + LIFT],
		],
		200,
		160,
	);
	const P = proj(C);
	const front = facing(C);
	const g = mk("g", {}, svg);

	// the server: a cabinet, a mouth in its side at the rail's height, vents and three lights on its front
	const [sr, si] = rings(0, 0, SW, SD, 6, 1.8);
	put(solid(g), prism(P, front, sr, si, 0, SH));
	const side = (y: number, z: number): ScreenPoint => P(SW, y, z);
	const face = (x: number, z: number): ScreenPoint => P(x, SD, z);
	mk(
		"path",
		{
			d: poly(rrect(JY0 - 2, RT + 2, JY1 + 2, RT + JT + 9, 3, 4).map((q) => side(q.u, q.v))),
			class: "nf",
		},
		g,
	);
	mk(
		"path",
		{
			d: [0, 1, 2, 3, 4].map((k) => seg(face(10, 30 + k * 6), face(SW - 10, 30 + k * 6))).join(""),
			class: "nf lo",
		},
		g,
	);
	for (const k of [0, 1, 2]) {
		const el = mk("circle", { r: 1.1, class: k === 0 ? "dot m" : "dot off" }, g);
		place(el, face(10 + k * 5, 18));
	}

	// the rail the jobs ride, from the mouth outwards
	const [rr, ri] = rings(SW + 1, JY0 - 4, RX1, JY1 + 4, 4, 1.2);
	put(solid(g), prism(P, front, rr, ri, 0, RT));

	const jobs: Job[] = [];
	for (let i = 0; i < N; i++) {
		const el = solid(g);
		const dots: SVGEllipseElement[] = [];
		for (let k = 0; k < (SIZES[i] ?? 1); k++) {
			dots.push(flatDot(g, C, 1.1, "dot off"));
		}
		const x0 = JX + i * PITCH;
		jobs.push({
			el,
			dots,
			x0,
			ring: rings(x0, JY0, x0 + JW, JY1, 4, 1.2),
			z: tween(REST[i] ?? 0),
			drawn: Number.NaN,
		});
	}

	function draw(j: Job, z: number) {
		if (Math.abs(z - j.drawn) < 1e-3) {
			return;
		}
		j.drawn = z;
		put(j.el, prism(P, front, j.ring[0], j.ring[1], RT + z, RT + z + JT));
		const n = j.dots.length;
		j.dots.forEach((el, k) =>
			place(el, P(j.x0 + JW / 2, (JY0 + JY1) / 2 + (k - (n - 1) / 2) * 5, RT + z + JT)),
		);
	}

	const B = register(stage, (_dt, now) => {
		let m = false;
		for (const j of jobs) {
			draw(j, tval(j.z, now));
			if (!tdone(j.z, now)) {
				m = true;
			}
		}
		return m;
	});
	bag.add(B.unregister);

	let act = -2;
	function setActive(a: number) {
		if (a === act) {
			return;
		}
		const now = performance.now();
		const from = a >= 0 ? a : Math.max(0, act);
		act = a;
		jobs.forEach((j, i) => {
			const z = a < 0 ? (REST[i] ?? 0) : clamp(LIFT - Math.abs(i - a) * 6, 0, LIFT);
			tset(j.z, z, now, Math.abs(i - from) * stag);
			const lit = a < 0 ? i === 0 : i === a;
			j.el.sil.classList.toggle("hi", lit);
			for (const el of j.dots) {
				el.setAttribute("class", lit ? "dot" : "dot off");
			}
		});
		read.textContent = a < 0 ? "rest" : `job ${a + 1} · ${NAMES[SIZES[a] ?? 0]}`;
		B.wake();
	}
	setActive(-1);

	/** The job whose slot on the rail holds the pointer, read on the rail's top plane. */
	function hit(p: ScreenPoint) {
		const [x, y] = unproj(C, p[0], p[1], RT);
		if (y < JY0 - 30 || y > JY1 + 14 || x < JX - 8 || x > RX1 + 8) {
			return -1;
		}
		return clamp(Math.floor((x - JX + (PITCH - JW) / 2) / PITCH), 0, N - 1);
	}
	bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
	bag.add(() => svg.replaceChildren());

	return {
		set: (v: number) => {
			stag = v;
		},
		destroy: bag.dispose,
	};
}

const queue: HairlineFigureDef = {
	name: "queue",
	means:
		"A render server and its queue: the job under the pointer rises off the rail, and the dots on its lid say its size.",
	rules: [1, 2, 5, 10],
	range: [0, 40, 90],
	tour: [[133, 178], [204, 214], [275, 249], null],
	mount,
};

export default queue;
