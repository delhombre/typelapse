import { bottomSheetMotion } from "@/presentation/components/ui/studio-bottom-sheet";
import { describe, expect, it } from "vitest";

describe("bottomSheetMotion", () => {
	it("slides a sheet from its bottom edge and keeps the backdrop in sync", () => {
		const motion = bottomSheetMotion(false);

		expect(motion.panel.initial).toEqual({ y: "100%" });
		expect(motion.panel.animate).toMatchObject({ y: 0 });
		expect(motion.panel.exit).toMatchObject({ y: "100%" });
		expect(motion.panel.animate.transition).toEqual(motion.backdrop.animate.transition);
		expect(motion.panel.exit.transition).toEqual(motion.backdrop.exit.transition);
		expect(motion.panel.exit.transition.duration).toBeLessThan(
			motion.panel.animate.transition.duration,
		);
	});

	it("removes every transition when reduced motion is requested", () => {
		const motion = bottomSheetMotion(true);

		expect(motion.panel.initial).toBe(false);
		expect(motion.panel.animate.transition.duration).toBe(0);
		expect(motion.panel.exit.transition.duration).toBe(0);
		expect(motion.backdrop.animate.transition.duration).toBe(0);
		expect(motion.backdrop.exit.transition.duration).toBe(0);
	});
});
