/**
 * Local: an open laptop exporting a video, the frames it encodes landing as
 * thin plates on a stack beside it on the desk; nothing leaves the desk, and
 * the read-out says so ("0 B sent"). The dashed server slot the prototype hung
 * above the stack went: it pulled the drawing off centre and said less than
 * the read-out does.
 * The pointer's x is how far the export has run: the bar on the screen fills on
 * a spring, and the frames drop out of the screen onto the stack, staggered.
 * At rest the export is halfway. The tuned number is the stagger, in ms.
 *
 * The pattern: one of many, driven by a position: the count is a choice
 * (tweens), the bar a position (a spring). The hit test reads the screen x of
 * fixed corners on the desk.
 */
import HL, { type ScreenPoint, type Solid, type Tween } from "./kernel";
import type { FigureContext, HairlineFigureDef } from "./types";

const {
	Cam,
	clamp,
	facing,
	fit,
	lerp,
	poly,
	proj,
	rad,
	rings,
	ringAt,
	rrect,
	seg,
	spring,
	stepS,
	tdone,
	tset,
	tval,
	tween,
	disposer,
	mk,
	pointer,
	prism,
	put,
	register,
	solid,
} = HL;

const LW = 104;
const LD = 70;
const BT = 4.5;
const LH = 64;
const OPEN = 106;
const N = 6;
const FX0 = LW + 34;
const FY0 = 46;
const FW = 44;
const FD = 30;
const FT = 2.2;
const PITCH = 4.4;
const REST = 2;

interface Frame {
	el: Solid;
	t: Tween;
	drawn: number;
}

function mount({ stage, svg, read }: FigureContext, value: number) {
	const bag = disposer();
	let stag = value;
	const C = Cam(45, 0.5, 1.56);
	const lidTop = (u: number): [number, number, number] => [
		u,
		LH * Math.cos(rad(OPEN)),
		BT + LH * Math.sin(rad(OPEN)),
	];
	fit(C, [[0, 0, 0], [LW, LD, 0], [FX0 + FW, FY0 + FD, 0], lidTop(0), lidTop(LW)], 200, 168);
	const P = proj(C);
	const front = facing(C);
	const g = mk("g", {}, svg);

	// the lid, leaning back on its hinge: its back, its face, the screen and the export bar
	const L = (u: number, v: number, off = 0): ScreenPoint => {
		const c = Math.cos(rad(OPEN));
		const s = Math.sin(rad(OPEN));
		return P(u, v * c + off * s, BT + v * s - off * c);
	};
	const lid = rrect(0, 0, LW, LH, 5, 5);
	mk("path", { d: poly(lid.map((q) => L(q.u, q.v, -1.6))), class: "sil" }, g);
	mk("path", { d: poly(lid.map((q) => L(q.u, q.v))), class: "" }, g);
	mk(
		"path",
		{ d: poly(rrect(5, 5, LW - 5, LH - 5, 2.5, 4).map((q) => L(q.u, q.v))), class: "nf lo" },
		g,
	);
	mk("path", { d: seg(L(20, 18), L(LW - 20, 18)), class: "nf lo" }, g);
	const fill = mk("path", { class: "nf hi" }, g);

	// the base: a slab, the keyboard's well and the trackpad
	const [br, bi] = rings(0, 0, LW, LD, 6, 1.6);
	put(solid(g), prism(P, front, br, bi, 0, BT));
	mk("path", { d: poly(ringAt(P, rrect(8, 6, LW - 8, 38, 3, 4), BT)), class: "nf lo" }, g);
	mk(
		"path",
		{ d: poly(ringAt(P, rrect(LW / 2 - 18, 44, LW / 2 + 18, 64, 3, 4), BT)), class: "nf lo" },
		g,
	);

	// the frames, from the screen to the stack
	const frames: Frame[] = [];
	for (let k = 0; k < N; k++) {
		frames.push({ el: solid(g), t: tween(k < REST ? 1 : 0), drawn: Number.NaN });
	}
	const bar = spring(REST / N);

	function drawFrame(f: Frame, k: number, e: number) {
		if (Math.abs(e - f.drawn) < 1e-4) {
			return;
		}
		f.drawn = e;
		if (e < 0.04) {
			put(f.el, { sil: "", crease: "" });
			return;
		}
		const z = k * PITCH + (1 - e) * 46;
		const x = lerp(LW / 2 - FW / 2, FX0, e);
		const y = lerp(-14, FY0, e);
		const [r, i] = rings(x, y, x + FW, y + FD, 4, 1);
		put(f.el, prism(P, front, r, i, z, z + FT));
	}

	const B = register(stage, (dt, now) => {
		let m = stepS(bar, dt);
		fill.setAttribute("d", bar.x > 0.01 ? seg(L(20, 18), L(lerp(20, LW - 20, bar.x), 18)) : "");
		frames.forEach((f, k) => {
			drawFrame(f, k, tval(f.t, now));
			if (!tdone(f.t, now)) {
				m = true;
			}
		});
		return m;
	});
	bag.add(B.unregister);

	let n = -1;
	function setCount(c: number, reading: boolean) {
		bar.t = c / N;
		if (c !== n) {
			const now = performance.now();
			const from = n < 0 ? c : n;
			frames.forEach((f, k) => tset(f.t, k < c ? 1 : 0, now, Math.abs(k - from) * stag));
			n = c;
		}
		read.textContent = reading ? `frame ${String(c).padStart(2, "0")} · 0 B sent` : "rest";
		B.wake();
	}
	setCount(REST, false);

	// the desk's left corner and the stack's right corner: the export runs between them
	const x0 = P(0, LD, 0)[0];
	const x1 = P(FX0 + FW, FY0, 0)[0];
	bag.add(
		pointer(stage, {
			move: (p) => setCount(Math.round(clamp((p[0] - x0) / (x1 - x0), 0, 1) * N), true),
			leave: () => setCount(REST, false),
		}),
	);
	bag.add(() => svg.replaceChildren());

	return {
		set: (v: number) => {
			stag = v;
		},
		destroy: bag.dispose,
	};
}

const local: HairlineFigureDef = {
	name: "local",
	means:
		"A laptop exports a video: the pointer runs the export, and its frames drop onto a stack on the desk, never further.",
	rules: [3, 5, 6, 8],
	range: [0, 40, 90],
	tour: [[90, 215], [160, 225], [290, 240], null],
	mount,
};

export default local;
