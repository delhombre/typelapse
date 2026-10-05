import { ISLAND_SPRING } from "@/presentation/components/controls/island-motion";
import { describe, expect, it } from "vitest";

/* The island springs its width to the row it holds, and clips that row while it
   does. Under the shared 205/22 spring (damping ratio 0.77) the width shot past a
   narrower row's right edge and closed on the Export button by up to 6.8px before
   settling back (measured in a browser, a 382px swap), because the row keeps its
   size and the island's `overflow: hidden` is the clip. A spring that never
   crosses its target never closes on the row. */

interface Spring {
	stiffness: number;
	damping: number;
	mass: number;
}

/** Below 1 a spring overshoots its target; at 1 or above it only ever approaches it. */
const dampingRatio = ({ stiffness, damping, mass }: Spring) =>
	damping / (2 * Math.sqrt(stiffness * mass));

/**
 * The response of a spring to a step of `distance` pixels, from rest, integrated
 * in 0.05ms steps (semi-implicit Euler, stable at this step for any damping).
 * Independent of Motion's own solver, which is what the island ships on; it
 * reproduces the browser's numbers for the spring the island used to wear
 * (4.3px of overshoot at 188px, 8.8px at 382px, 550ms to within half a pixel).
 */
function respond({ stiffness, damping, mass }: Spring, distance: number) {
	const dt = 0.00005;
	let x = 0;
	let v = 0;
	let t = 0;
	let overshoot = 0;
	let riseMs = 0;
	let settleMs = 0;
	while (t < 3) {
		v += ((-stiffness * (x - distance) - damping * v) / mass) * dt;
		x += v * dt;
		t += dt;
		overshoot = Math.max(overshoot, x - distance);
		if (riseMs === 0 && x >= 0.9 * distance) riseMs = Math.round(t * 1000);
		if (Math.abs(x - distance) > 0.5) settleMs = Math.round(t * 1000);
	}
	return { overshoot, riseMs, settleMs };
}

describe("the island's width spring", () => {
	it("never crosses its target, so the island never closes on the row it holds", () => {
		expect(dampingRatio(ISLAND_SPRING)).toBeGreaterThanOrEqual(1);
	});

	it("does not overshoot a row swap of any width the rail has", () => {
		// The rail's swaps run from 4px (root to Frame) to 382px (root to Export).
		for (const distance of [4, 18, 188, 266, 382]) {
			expect(respond(ISLAND_SPRING, distance).overshoot, `${distance}px`).toBeLessThan(0.001);
		}
	});

	it("is as quick to arrive as the spring it replaces: 90% of the way in 200ms, settled in 600ms", () => {
		const move = respond(ISLAND_SPRING, 382);
		expect(move.riseMs).toBeLessThanOrEqual(200);
		expect(move.settleMs).toBeLessThan(600);
	});

	it("is a spring of its own because the shared one is not safe for this clip", () => {
		// Pins the measurement: the shared default overshoots the 382px swap by 8.8px.
		const shared = { stiffness: 205, damping: 22, mass: 1 };
		expect(dampingRatio(shared)).toBeLessThan(1);
		expect(respond(shared, 382).overshoot).toBeGreaterThan(8);
	});
});
