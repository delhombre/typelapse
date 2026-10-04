import { timelineMotion } from "@/presentation/components/timeline/timeline-motion";
import { describe, expect, it } from "vitest";

describe("timelineMotion", () => {
	it("keeps scene-to-scene updates immediate while rare context changes stay restrained", () => {
		const motion = timelineMotion(false, true);

		expect(motion.context.initial).toMatchObject({ opacity: 0, y: 3 });
		expect(motion.context.animate.transition.duration).toBeLessThanOrEqual(0.18);
		expect(motion.context.exit.transition.duration).toBeLessThan(
			motion.context.animate.transition.duration,
		);
		if (!("damping" in motion.layout)) {
			throw new Error("settled timeline motion should use a spring");
		}
		expect(motion.layout.type).toBe("spring");
		expect(motion.layout.damping).toBeGreaterThanOrEqual(40);
	});

	it("makes direct manipulation and keyboard updates follow the pointer or key without lag", () => {
		const motion = timelineMotion(false, false);

		expect(motion.layout).toEqual({ duration: 0 });
	});

	it("removes every transition when reduced motion is requested", () => {
		const motion = timelineMotion(true, true);

		expect(motion.context.initial).toBe(false);
		expect(motion.context.animate.transition.duration).toBe(0);
		expect(motion.context.exit.transition.duration).toBe(0);
		expect(motion.layout).toEqual({ duration: 0 });
	});
});
