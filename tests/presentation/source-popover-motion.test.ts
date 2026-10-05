import { sourcePopoverMotion } from "@/presentation/components/layout/source-popover-motion";
import { describe, expect, it } from "vitest";

/* The source hub's menu and its two form popovers are one family of surfaces that
   open from the same trigger. Each wrote its own copy of the motion, and the
   copies had drifted: the menu entered at 0.97 and the forms at 0.96, and the
   forms kept their blur under reduced motion, which strips transforms but not
   filters. One table now, read by all three. */
describe("sourcePopoverMotion", () => {
	it("grows from a hint of scale, and leaves faster, quieter and on an ease-in", () => {
		const motion = sourcePopoverMotion(false);

		expect(motion.initial).toMatchObject({ opacity: 0, y: -5, scale: 0.97 });
		expect(motion.animate).toMatchObject({ opacity: 1, y: 0, scale: 1 });
		expect(motion.exit).toMatchObject({ opacity: 0, scale: 0.98 });
		// Entering is an ease-out (the studio's --ease-out); leaving accelerates away.
		expect(motion.transition.ease).toEqual([0.23, 1, 0.32, 1]);
		expect(motion.exit.transition.ease).toEqual([0.4, 0, 1, 1]);
		expect(motion.exit.transition.duration).toBeLessThan(motion.transition.duration);
		expect(motion.transition.duration).toBeLessThanOrEqual(0.2);
	});

	it("never enters from nothing: it starts at a visible scale", () => {
		const { initial } = sourcePopoverMotion(false);
		expect(initial.scale).toBeGreaterThanOrEqual(0.95);
		expect(initial.opacity).toBe(0);
	});

	it("keeps only opacity under reduced motion: no travel, no scale, no blur", () => {
		const motion = sourcePopoverMotion(true);

		expect(motion.initial).toEqual({ opacity: 0 });
		expect(motion.animate).toEqual({ opacity: 1 });
		expect(motion.exit).toMatchObject({ opacity: 0 });
		for (const frame of [motion.initial, motion.animate, motion.exit]) {
			expect(frame).not.toHaveProperty("y");
			expect(frame).not.toHaveProperty("scale");
			expect(frame).not.toHaveProperty("filter");
		}
		expect(motion.transition.duration).toBeLessThan(0.05);
		expect(motion.exit.transition.duration).toBeLessThan(0.05);
	});
});
